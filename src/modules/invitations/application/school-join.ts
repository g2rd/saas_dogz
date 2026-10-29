import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { siteUrl } from "@/shared/env";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";
import { err, ok, type Result } from "@/shared/result";
import {
  SCHOOL_JOIN_TOKEN_PATTERN,
  decideJoinRequestInputSchema,
  joinRequestInputSchema,
  type JoinRequest,
  type SchoolJoinLink,
} from "../domain/school-join";
import { generateToken } from "../domain/secrets";
import { renderQrSvg } from "../infrastructure/qr";
import { schoolJoinRepository } from "../infrastructure/school-join-repository";

async function toLink(token: string): Promise<SchoolJoinLink> {
  const link = `${siteUrl()}/school/${token}`;
  return { link, qrSvg: await renderQrSvg(link) };
}

/** Stały link szkoły i jego kod QR (właściciel i administrator); `null`, gdy link jeszcze nie został utworzony. */
export async function getSchoolJoinLink(ctx: RequestContext): Promise<Result<SchoolJoinLink | null>> {
  const allowed = authorize(ctx, "organization.update");
  if (!allowed.ok) return allowed;
  const token = await schoolJoinRepository(ctx.db).activeToken(ctx.organizationId);
  if (!token.ok) return token;
  return ok(token.value ? await toLink(token.value) : null);
}

/** Tworzy nowy link szkoły; poprzedni przestaje działać (np. gdy wydrukowany kod trafił w niepowołane ręce). */
export async function rotateSchoolJoinLink(ctx: RequestContext): Promise<Result<SchoolJoinLink>> {
  const allowed = authorize(ctx, "organization.update");
  if (!allowed.ok) return allowed;
  const token = generateToken();
  const rotated = await schoolJoinRepository(ctx.db).rotate(ctx.organizationId, token);
  if (!rotated.ok) return rotated;
  return ok(await toLink(token));
}

/** Nazwa szkoły z linku (publiczne, bez logowania); `null` dla nieważnego linku. */
export async function lookupSchoolJoin(db: SupabaseClient, token: string): Promise<Result<{ name: string } | null>> {
  if (!SCHOOL_JOIN_TOKEN_PATTERN.test(token)) return ok(null);
  return schoolJoinRepository(db).lookup(token);
}

/** Prośba zalogowanej osoby o dołączenie do szkoły (po jej zaakceptowaniu przez trenera powstaje kartoteka i dostęp do panelu). */
export async function requestSchoolJoin(db: SupabaseClient, raw: unknown): Promise<Result<string>> {
  const input = parseInput(joinRequestInputSchema, raw);
  if (!input.ok) return err(input.error);
  return schoolJoinRepository(db).request(input.value);
}

/** Oczekujące prośby o dołączenie do szkoły (personel z prawem odczytu klientów). */
export async function listJoinRequests(ctx: RequestContext): Promise<Result<JoinRequest[]>> {
  const allowed = authorize(ctx, "clients.read");
  if (!allowed.ok) return allowed;
  return schoolJoinRepository(ctx.db).pending(ctx.organizationId);
}

/** Prośby zalogowanej osoby (status: oczekuje, zaakceptowana, odrzucona). */
export async function listMyJoinRequests(db: SupabaseClient, userId: string): Promise<Result<JoinRequest[]>> {
  return schoolJoinRepository(db).mine(userId);
}

/**
 * Decyzja trenera. Akceptacja bez `clientId` zakłada nową kartotekę z danych prośby; z `clientId` łączy konto z istniejącym klientem
 * (np. gdy trener już go dodał). Odrzucenie niczego nie tworzy.
 */
export async function decideJoinRequest(ctx: RequestContext, raw: unknown): Promise<Result<{ clientId: string | null }>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(decideJoinRequestInputSchema, raw);
  if (!input.ok) return err(input.error);
  if (!input.value.approve && input.value.clientId) {
    return err(appError("validation", msg("errors.db.constraint")));
  }
  const decided = await schoolJoinRepository(ctx.db).decide(ctx.organizationId, input.value.requestId, input.value.approve, input.value.clientId);
  if (!decided.ok) return decided;
  return ok({ clientId: decided.value });
}
