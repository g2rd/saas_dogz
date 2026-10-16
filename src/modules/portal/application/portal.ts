import { proposeDog } from "@/modules/dogs";
import { LOW_BALANCE_THRESHOLD, isLowBalance, packageStatus } from "@/modules/packages";
import { chargeRemaining, chargeStatus } from "@/modules/payments";
import type { ClientRequestContext } from "@/shared/context";
import { dateInZone } from "@/shared/time";
import { err, ok, type Result } from "@/shared/result";
import {
  pickNextCharge,
  type PortalCharge,
  type PortalDog,
  type PortalOverview,
  type PortalPackage,
  type PortalPayment,
  type PortalSession,
} from "../domain/portal";
import { portalRepository, type ChargeRow, type PackageRow } from "../infrastructure/portal-repository";

function toPackage(row: PackageRow, today: string): PortalPackage {
  const status = packageStatus(
    { balance: row.balance, validUntil: row.valid_until, canceledAt: row.canceled_at ? new Date(row.canceled_at) : null },
    today,
  );
  return {
    id: row.id,
    name: row.name,
    sessionsTotal: row.sessions_total,
    balance: row.balance,
    validUntil: row.valid_until,
    priceMinor: row.price_minor,
    currency: row.currency,
    status,
    low: status === "active" && isLowBalance(row.balance, LOW_BALANCE_THRESHOLD),
  };
}

function toCharge(row: ChargeRow, today: string): PortalCharge {
  const snapshot = {
    amountMinor: row.amount_minor,
    allocatedMinor: row.allocated_minor,
    dueDate: row.due_date,
    voided: row.voided_at !== null,
  };
  return {
    id: row.id,
    description: row.description,
    amountMinor: row.amount_minor,
    remainingMinor: row.voided_at ? 0 : chargeRemaining(snapshot),
    currency: row.currency,
    dueDate: row.due_date,
    status: chargeStatus(snapshot, today),
  };
}

/** Strona startowa panelu: pakiety z saldem, najpilniejsza płatność, najbliższe zajęcia. */
export async function getPortalOverview(ctx: ClientRequestContext): Promise<Result<PortalOverview>> {
  const repo = portalRepository(ctx.db, ctx.organizationId, ctx.clientId);
  const now = ctx.clock.now();

  const header = await repo.getHeader();
  if (!header.ok) return header;
  const today = dateInZone(now, header.value.timezone);

  const [packages, charges, upcoming, dogs] = await Promise.all([
    repo.listPackages(),
    repo.listCharges(),
    repo.listSessions({ status: "scheduled", from: new Date(now.getTime() - 3_600_000), limit: 3 }),
    repo.listDogs(),
  ]);
  if (!packages.ok) return packages;
  if (!charges.ok) return charges;
  if (!upcoming.ok) return upcoming;
  if (!dogs.ok) return dogs;

  const packageViews = packages.value.map((row) => toPackage(row, today));
  const chargeViews = charges.value.map((row) => toCharge(row, today));

  return ok({
    ...header.value,
    today,
    packages: packageViews.filter((p) => p.status === "active" || p.status === "depleted"),
    lowBalance: packageViews.filter((p) => p.low),
    nextCharge: pickNextCharge(chargeViews),
    owedMinor: chargeViews.reduce((sum, c) => sum + c.remainingMinor, 0),
    currency: chargeViews[0]?.currency ?? packageViews[0]?.currency ?? "PLN",
    upcoming: upcoming.value,
    pendingDogs: dogs.value.filter((d) => d.approvalStatus === "pending").length,
  });
}

export async function listPortalSessions(
  ctx: ClientRequestContext,
): Promise<Result<{ upcoming: PortalSession[]; recent: PortalSession[]; timezone: string }>> {
  const repo = portalRepository(ctx.db, ctx.organizationId, ctx.clientId);
  const header = await repo.getHeader();
  if (!header.ok) return header;

  const now = ctx.clock.now();
  const [upcoming, recent] = await Promise.all([
    repo.listSessions({ status: "scheduled", from: new Date(now.getTime() - 3_600_000), limit: 30 }),
    repo.listSessions({ status: "completed", newestFirst: true, limit: 10 }),
  ]);
  if (!upcoming.ok) return upcoming;
  if (!recent.ok) return recent;
  return ok({ upcoming: upcoming.value, recent: recent.value, timezone: header.value.timezone });
}

export type PortalPayments = {
  charges: PortalCharge[];
  payments: PortalPayment[];
  owedMinor: number;
  creditMinor: number;
  currency: string;
};

/** Należności z terminami i statusami oraz historia wpłat. */
export async function listPortalPayments(ctx: ClientRequestContext): Promise<Result<PortalPayments>> {
  const repo = portalRepository(ctx.db, ctx.organizationId, ctx.clientId);
  const header = await repo.getHeader();
  if (!header.ok) return header;
  const today = dateInZone(ctx.clock.now(), header.value.timezone);

  const [charges, payments] = await Promise.all([repo.listCharges(), repo.listPayments()]);
  if (!charges.ok) return charges;
  if (!payments.ok) return payments;

  const chargeViews = charges.value.map((row) => toCharge(row, today));
  const owed = chargeViews.reduce((sum, c) => sum + c.remainingMinor, 0);
  const allocated = charges.value
    .filter((row) => row.voided_at === null)
    .reduce((sum, row) => sum + row.allocated_minor, 0);
  const paid = payments.value.reduce((sum, p) => sum + p.amountMinor, 0);

  return ok({
    charges: chargeViews,
    payments: payments.value,
    owedMinor: owed,
    creditMinor: Math.max(paid - allocated, 0),
    currency: chargeViews[0]?.currency ?? payments.value[0]?.currency ?? "PLN",
  });
}

export async function listPortalDogs(ctx: ClientRequestContext): Promise<Result<PortalDog[]>> {
  return portalRepository(ctx.db, ctx.organizationId, ctx.clientId).listDogs();
}

/** Klient dodaje psa; pies czeka na zatwierdzenie trenera. */
export async function addMyDog(ctx: ClientRequestContext, raw: unknown): Promise<Result<PortalDog>> {
  const result = await proposeDog(ctx, raw);
  if (!result.ok) return err(result.error);
  const dog = result.value;
  return ok({
    id: dog.id,
    name: dog.name,
    breed: dog.breed,
    birthDate: dog.birthDate,
    sex: dog.sex,
    approvalStatus: dog.approvalStatus,
  });
}
