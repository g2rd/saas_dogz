import { authorize } from "@/modules/core";
import { isoDate } from "@/shared/dates";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { formText, parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { z } from "zod";
import { LOW_BALANCE_THRESHOLD, packageStatus, type PackageStatus } from "../domain/ledger";
import { resolveSale, saleInputSchema } from "../domain/sale";
import { templateInputSchema, type PackageTemplate } from "../domain/template";
import {
  packagesRepository,
  type LedgerRecord,
  type PackageRecord,
} from "../infrastructure/packages-repository";
import { templatesRepository } from "../infrastructure/templates-repository";

export type ClientPackage = PackageRecord & { status: PackageStatus };

function withStatus(ctx: RequestContext, record: PackageRecord): ClientPackage {
  return {
    ...record,
    status: packageStatus(
      { balance: record.balance, validUntil: record.validUntil, canceledAt: record.canceledAt },
      isoDate(ctx.clock.now()),
    ),
  };
}

// --- szablony ----------------------------------------------------------------------------------

export async function listTemplates(
  ctx: RequestContext,
  options: { includeArchived?: boolean } = {},
): Promise<Result<PackageTemplate[]>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  return templatesRepository(ctx.db).list(ctx.organizationId, options.includeArchived);
}

export async function getTemplate(ctx: RequestContext, id: string): Promise<Result<PackageTemplate>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  return templatesRepository(ctx.db).get(ctx.organizationId, id);
}

export async function createTemplate(ctx: RequestContext, raw: unknown): Promise<Result<PackageTemplate>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(templateInputSchema, raw);
  if (!input.ok) return err(input.error);
  return templatesRepository(ctx.db).insert(ctx.organizationId, ctx.userId, input.value);
}

export async function updateTemplate(
  ctx: RequestContext,
  id: string,
  raw: unknown,
): Promise<Result<PackageTemplate>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(templateInputSchema, raw);
  if (!input.ok) return err(input.error);
  return templatesRepository(ctx.db).update(ctx.organizationId, id, input.value);
}

export async function archiveTemplate(ctx: RequestContext, id: string): Promise<Result<PackageTemplate>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;
  return templatesRepository(ctx.db).setArchived(ctx.organizationId, id, ctx.clock.now());
}

export async function restoreTemplate(ctx: RequestContext, id: string): Promise<Result<PackageTemplate>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;
  return templatesRepository(ctx.db).setArchived(ctx.organizationId, id, null);
}

// --- pakiety klientów -----------------------------------------------------------------------------

export async function listClientPackages(ctx: RequestContext, clientId: string): Promise<Result<ClientPackage[]>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  const result = await packagesRepository(ctx.db).listByClient(ctx.organizationId, clientId);
  if (!result.ok) return result;
  return ok(result.value.map((record) => withStatus(ctx, record)));
}

export async function getClientPackage(ctx: RequestContext, id: string): Promise<Result<ClientPackage>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  const result = await packagesRepository(ctx.db).get(ctx.organizationId, id);
  if (!result.ok) return result;
  return ok(withStatus(ctx, result.value));
}

/** Pakiety z 1-2 pozostałymi zajęciami (do przypomnień i pulpitu). */
export async function listLowBalancePackages(
  ctx: RequestContext,
  threshold = LOW_BALANCE_THRESHOLD,
): Promise<Result<ClientPackage[]>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  const result = await packagesRepository(ctx.db).listLowBalance(
    ctx.organizationId,
    threshold,
    isoDate(ctx.clock.now()),
  );
  if (!result.ok) return result;
  return ok(result.value.map((record) => withStatus(ctx, record)));
}

export async function listPackageLedger(ctx: RequestContext, packageId: string): Promise<Result<LedgerRecord[]>> {
  const allowed = authorize(ctx, "packages.read");
  if (!allowed.ok) return allowed;
  return packagesRepository(ctx.db).listLedger(ctx.organizationId, packageId);
}

/** Sprzedaje pakiet klientowi: szablon lub własne parametry; atomowo tworzy też należność. */
export async function sellPackage(ctx: RequestContext, raw: unknown): Promise<Result<string>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(saleInputSchema, raw);
  if (!input.ok) return err(input.error);

  let template: PackageTemplate | null = null;
  if (input.value.templateId) {
    const found = await templatesRepository(ctx.db).get(ctx.organizationId, input.value.templateId);
    if (found.ok) template = found.value;
    else if (found.error.code !== "not_found") return found;
  }

  const draft = resolveSale(input.value, template, isoDate(ctx.clock.now()));
  if (!draft.ok) return draft;

  return packagesRepository(ctx.db).sell(ctx.organizationId, draft.value);
}

const adjustmentSchema = z.object({
  delta: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : v),
    z
      .number({ error: "Podaj liczbę zajęć, np. 1 lub -1" })
      .int("Podaj liczbę całkowitą")
      .min(-500, "Za duża korekta")
      .max(500, "Za duża korekta")
      .refine((v) => v !== 0, "Korekta nie może być zerowa"),
  ),
  reason: z.enum(["adjustment", "refund"]).default("adjustment"),
  note: formText(300).transform((v) => (v === "" ? null : v)),
});

/** Ręczna korekta salda (np. zwrot zajęć); saldo nie może zejść poniżej zera. */
export async function adjustPackage(
  ctx: RequestContext,
  packageId: string,
  raw: unknown,
): Promise<Result<string>> {
  const allowed = authorize(ctx, "packages.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(adjustmentSchema, raw);
  if (!input.ok) return err(input.error);

  const result = await packagesRepository(ctx.db).adjust(
    ctx.organizationId,
    packageId,
    input.value.delta,
    input.value.reason,
    input.value.note,
  );
  if (!result.ok && result.error.code === "validation") {
    return err(
      appError("validation", "Popraw zaznaczone pola.", {
        delta: ["Saldo nie może zejść poniżej zera"],
      }),
    );
  }
  return result;
}
