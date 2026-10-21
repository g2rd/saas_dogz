import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBetaCode, generateBetaCode, hashBetaCode } from "@/modules/core";
import { invitationHashSecret } from "@/shared/env";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { zonedDateTimeToUtc, DEFAULT_TIMEZONE } from "@/shared/time";
import {
  createBetaCodeSchema,
  extendAccessSchema,
  notesSchema,
  setStatusSchema,
  signupModeSchema,
} from "../domain/inputs";
import type { BetaCodeRow, OrganizationOverview, StatusHistoryEntry } from "../domain/overview";
import { adminRepository } from "../infrastructure/admin-repository";

const DAY_MS = 86_400_000;

/**
 * Kontekst właściciela platformy. `db` to klient service_role, więc tworzyć go wolno wyłącznie po sprawdzeniu,
 * że zalogowana osoba jest w `platform_admins` (robi to strażnik w trasach `/admin`).
 */
export type AdminContext = { adminId: string; db: SupabaseClient; now: () => Date };

const repo = (ctx: AdminContext) => adminRepository(ctx.db, ctx.adminId);

export async function listOrganizations(ctx: AdminContext): Promise<Result<OrganizationOverview[]>> {
  return repo(ctx).overview();
}

export async function getOrganizationOverview(ctx: AdminContext, orgId: string): Promise<Result<OrganizationOverview>> {
  const all = await repo(ctx).overview();
  if (!all.ok) return all;
  const found = all.value.find((org) => org.id === orgId);
  return found ? ok(found) : err(appError("not_found", "Nie znaleziono szkoły."));
}

export async function getStatusHistory(ctx: AdminContext, orgId: string): Promise<Result<StatusHistoryEntry[]>> {
  return repo(ctx).history(orgId);
}

/** Koniec wskazanego dnia (czas polski) jako termin dostępu. */
function endOfDay(isoDate: string): Date | null {
  return zonedDateTimeToUtc(isoDate, "23:59", DEFAULT_TIMEZONE);
}

export async function setOrganizationStatus(ctx: AdminContext, orgId: string, raw: unknown): Promise<Result<void>> {
  const input = parseInput(setStatusSchema, raw);
  if (!input.ok) return err(input.error);
  const { status, reason, accessUntil } = input.value;
  if ((status === "suspended" || status === "read_only") && !reason) {
    return err(appError("validation", "Podaj powód (zobaczy go trener).", { reason: ["Powód jest wymagany przy blokadzie"] }));
  }
  const until = accessUntil ? endOfDay(accessUntil) : null;
  if (accessUntil && !until) return err(appError("validation", "Podaj poprawną datę.", { accessUntil: ["Niepoprawna data"] }));
  return repo(ctx).setStatus(orgId, status, reason, until);
}

/** Przedłuża dostęp o N dni od dzisiaj albo od obecnego terminu, jeśli jest dalszy; szkołę blokowaną przywraca do trybu aktywnego. */
export async function extendOrganizationAccess(ctx: AdminContext, orgId: string, raw: unknown): Promise<Result<void>> {
  const input = parseInput(extendAccessSchema, raw);
  if (!input.ok) return err(input.error);
  const current = await getOrganizationOverview(ctx, orgId);
  if (!current.ok) return current;
  const org = current.value;

  const base = org.accessUntil && org.accessUntil.getTime() > ctx.now().getTime() ? org.accessUntil : ctx.now();
  const until = new Date(base.getTime() + input.value.days * DAY_MS);
  const status = org.status === "trial" || org.status === "active" ? org.status : "active";
  return repo(ctx).setStatus(orgId, status, null, until);
}

export async function setOrganizationNotes(ctx: AdminContext, orgId: string, raw: unknown): Promise<Result<void>> {
  const input = parseInput(notesSchema, raw);
  if (!input.ok) return err(input.error);
  return repo(ctx).setNotes(orgId, input.value.notes);
}

export async function getSignupMode(ctx: AdminContext): Promise<Result<"open" | "closed">> {
  return repo(ctx).getSignupMode();
}

export async function setSignupMode(ctx: AdminContext, raw: unknown): Promise<Result<void>> {
  const input = parseInput(signupModeSchema, raw);
  if (!input.ok) return err(input.error);
  return repo(ctx).setSignupMode(input.value.mode);
}

export async function listBetaCodes(ctx: AdminContext): Promise<Result<BetaCodeRow[]>> {
  return repo(ctx).listBetaCodes();
}

/** Tworzy kod beta; jawny kod zwracamy tylko tutaj (w bazie jest sam skrót). */
export async function createBetaCode(ctx: AdminContext, raw: unknown): Promise<Result<{ code: string; display: string }>> {
  const input = parseInput(createBetaCodeSchema, raw);
  if (!input.ok) return err(input.error);
  const code = generateBetaCode();
  const expiresAt = new Date(ctx.now().getTime() + input.value.validDays * DAY_MS);
  const created = await repo(ctx).createBetaCode(
    hashBetaCode(code, invitationHashSecret()),
    input.value.label,
    input.value.maxUses,
    expiresAt,
  );
  if (!created.ok) return created;
  return ok({ code, display: formatBetaCode(code) });
}

export async function revokeBetaCode(ctx: AdminContext, codeId: string): Promise<Result<void>> {
  return repo(ctx).revokeBetaCode(codeId);
}
