import { authorize } from "@/modules/core";
import { isoDate } from "@/shared/dates";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { DEFAULT_CURRENCY } from "@/shared/money";
import { err, ok, type Result } from "@/shared/result";
import { allocatePayment, allocateToCharge, type Allocation, type OpenCharge } from "../domain/allocation";
import {
  chargeRemaining,
  chargeStatus,
  type ChargeStatus,
} from "../domain/charge-status";
import {
  paidAtFromDate,
  paymentInputSchema,
  type Charge,
  type ClientBalance,
  type Payment,
} from "../domain/payment";
import { paymentsRepository } from "../infrastructure/payments-repository";

export type ChargeView = Charge & { remainingMinor: number; status: ChargeStatus };

function toView(ctx: RequestContext, charge: Charge): ChargeView {
  const snapshot = {
    amountMinor: charge.amountMinor,
    allocatedMinor: charge.allocatedMinor,
    dueDate: charge.dueDate,
    voided: charge.voidedAt !== null,
  };
  return {
    ...charge,
    remainingMinor: charge.voidedAt ? 0 : chargeRemaining(snapshot),
    status: chargeStatus(snapshot, isoDate(ctx.clock.now())),
  };
}

export async function listClientCharges(ctx: RequestContext, clientId: string): Promise<Result<ChargeView[]>> {
  const allowed = authorize(ctx, "payments.read");
  if (!allowed.ok) return allowed;
  const result = await paymentsRepository(ctx.db).listChargesByClient(ctx.organizationId, clientId);
  if (!result.ok) return result;
  return ok(result.value.map((charge) => toView(ctx, charge)));
}

/** Należności po terminie i niezapłacone w całości (do pulpitu i przypomnień). */
export async function listOverdueCharges(ctx: RequestContext): Promise<Result<ChargeView[]>> {
  const allowed = authorize(ctx, "payments.read");
  if (!allowed.ok) return allowed;
  const result = await paymentsRepository(ctx.db).listDueBefore(ctx.organizationId, isoDate(ctx.clock.now()));
  if (!result.ok) return result;
  return ok(result.value.map((charge) => toView(ctx, charge)).filter((view) => view.status === "overdue"));
}

export async function listClientPayments(ctx: RequestContext, clientId: string): Promise<Result<Payment[]>> {
  const allowed = authorize(ctx, "payments.read");
  if (!allowed.ok) return allowed;
  return paymentsRepository(ctx.db).listPaymentsByClient(ctx.organizationId, clientId);
}

export async function getClientBalance(ctx: RequestContext, clientId: string): Promise<Result<ClientBalance>> {
  const allowed = authorize(ctx, "payments.read");
  if (!allowed.ok) return allowed;
  return paymentsRepository(ctx.db).getClientBalance(ctx.organizationId, clientId);
}

export type RecordedPayment = {
  paymentId: string;
  allocations: Allocation[];
  allocatedMinor: number;
  /** Nadpłata: część wpłaty, która nie pokryła żadnej należności. */
  unallocatedMinor: number;
};

/**
 * Księguje wpłatę klienta. Domyślnie dzieli ją na najstarsze otwarte należności; z `chargeId`
 * trafia tylko na wskazaną. Reszta zostaje jako nadpłata na koncie klienta.
 */
export async function recordPayment(ctx: RequestContext, raw: unknown): Promise<Result<RecordedPayment>> {
  const allowed = authorize(ctx, "payments.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(paymentInputSchema, raw);
  if (!input.ok) return err(input.error);
  const payment = input.value;

  const repo = paymentsRepository(ctx.db);
  const charges = await repo.listChargesByClient(ctx.organizationId, payment.clientId);
  if (!charges.ok) return charges;

  const open: OpenCharge[] = charges.value
    .filter((c) => c.voidedAt === null)
    .map((c) => ({
      id: c.id,
      remainingMinor: c.amountMinor - c.allocatedMinor,
      dueDate: c.dueDate,
      createdAt: c.createdAt.toISOString(),
    }))
    .filter((c) => c.remainingMinor > 0);

  let plan;
  if (payment.chargeId) {
    const target = open.find((c) => c.id === payment.chargeId);
    if (!target) {
      return err(
        appError("validation", "Popraw zaznaczone pola.", { chargeId: ["Ta należność jest już opłacona lub anulowana"] }),
      );
    }
    plan = allocateToCharge(payment.amount, target);
  } else {
    plan = allocatePayment(payment.amount, open);
  }

  const recorded = await repo.record(ctx.organizationId, {
    clientId: payment.clientId,
    amountMinor: payment.amount,
    currency: charges.value[0]?.currency ?? DEFAULT_CURRENCY,
    method: payment.method,
    paidAt: payment.paidAt ? paidAtFromDate(payment.paidAt) : null,
    reference: payment.reference,
    allocations: plan.allocations,
  });
  if (!recorded.ok) {
    // Naruszenie niezmienników w bazie przy poprawnych danych oznacza wyścig z inną wpłatą.
    if (recorded.error.code === "validation") {
      return err(appError("conflict", "Należności zmieniły się w międzyczasie. Odśwież stronę i spróbuj ponownie."));
    }
    return recorded;
  }

  return ok({
    paymentId: recorded.value,
    allocations: plan.allocations,
    allocatedMinor: payment.amount - plan.unallocatedMinor,
    unallocatedMinor: plan.unallocatedMinor,
  });
}

/** Storno wpłaty: wpłata zostaje w historii jako anulowana, a należności wracają do stanu sprzed wpłaty. */
export async function voidPayment(ctx: RequestContext, paymentId: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "payments.write");
  if (!allowed.ok) return allowed;
  return paymentsRepository(ctx.db).voidPayment(ctx.organizationId, paymentId);
}

/** Anuluje należność, na którą nic nie wpłacono. */
export async function voidCharge(ctx: RequestContext, chargeId: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "payments.write");
  if (!allowed.ok) return allowed;
  const result = await paymentsRepository(ctx.db).voidCharge(ctx.organizationId, chargeId);
  if (!result.ok && result.error.code === "validation") {
    return err(appError("conflict", "Nie można anulować należności, na którą są już wpłaty."));
  }
  return result;
}
