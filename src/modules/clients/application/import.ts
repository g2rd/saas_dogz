import { authorize } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { msg } from "@/shared/i18n/messages";
import { err, ok, type Result } from "@/shared/result";
import { normalizePhone } from "../domain/client";
import { IMPORT_MAX_BYTES, parseCsv, planClientImport, type ImportPlan } from "../domain/import";
import { clientsRepository } from "../infrastructure/clients-repository";

/** Podgląd importu: co zostanie zapisane i co pominięto (z powodami), bez zapisu do bazy. */
export type ImportPreview = ImportPlan & { dogsCount: number };

export type ImportResult = { clients: number; dogs: number; skipped: number; ignored: number };

/** `phoneCountry`: kraj (region użytkownika), z którego liczymy numery telefonu bez prefiksu. */
export type ImportOptions = { phoneCountry?: string | null };

async function plan(ctx: RequestContext, csv: string, options: ImportOptions): Promise<Result<ImportPlan>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;

  if (csv.trim() === "") return err(appError("validation", msg("clients.import.empty")));
  if (new TextEncoder().encode(csv).length > IMPORT_MAX_BYTES) {
    return err(appError("validation", msg("clients.import.too_large")));
  }

  const contacts = await clientsRepository(ctx.db).contacts(ctx.organizationId);
  if (!contacts.ok) return contacts;
  const existing = {
    emails: new Set(contacts.value.flatMap((c) => (c.email ? [c.email] : []))),
    phones: new Set(contacts.value.flatMap((c) => (c.phone ? [normalizePhone(c.phone, options.phoneCountry) ?? c.phone] : []))),
  };

  const result = planClientImport(parseCsv(csv), existing, options.phoneCountry);
  if (result.missingNameColumn) return err(appError("validation", msg("clients.import.no_name_column")));
  return ok(result);
}

export async function previewClientImport(ctx: RequestContext, csv: string, options: ImportOptions = {}): Promise<Result<ImportPreview>> {
  const planned = await plan(ctx, csv, options);
  if (!planned.ok) return planned;
  return ok({ ...planned.value, dogsCount: planned.value.rows.filter((row) => row.dogName).length });
}

/**
 * Zapisuje klientów (i psy) z pliku jednym atomowym zapisem. Plik jest analizowany od nowa: podglądowi nie ufamy,
 * a klienci dodani w międzyczasie nie zostaną zdublowani (sprawdza je też baza).
 */
export async function importClients(ctx: RequestContext, csv: string, options: ImportOptions = {}): Promise<Result<ImportResult>> {
  const planned = await plan(ctx, csv, options);
  if (!planned.ok) return planned;
  if (planned.value.rows.length === 0) return err(appError("validation", msg("clients.import.nothing_to_import")));

  const saved = await clientsRepository(ctx.db).importRows(ctx.organizationId, planned.value.rows);
  if (!saved.ok) return saved;
  return ok({ ...saved.value, ignored: planned.value.issues.filter((issue) => issue.severity === "error").length });
}
