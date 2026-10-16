import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { invitationHashSecret, siteUrl } from "@/shared/env";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import {
  createInvitationInputSchema,
  type ClientAccessInfo,
  type CreatedInvitation,
  type InvitationPreview,
} from "../domain/invitation";
import {
  formatCode,
  generateCode,
  generateToken,
  hashSecret,
  invitationExpiry,
  normalizeSecret,
} from "../domain/secrets";
import { invitationsRepository } from "../infrastructure/invitations-repository";
import { renderQrSvg } from "../infrastructure/qr";

/**
 * Tworzy zaproszenie klienta do panelu: link (dla QR) i krótki kod. Sekrety są pokazywane tylko tutaj;
 * w bazie zostają wyłącznie ich HMAC-i. Poprzednie oczekujące zaproszenia klienta tracą ważność.
 */
export async function createClientInvitation(ctx: RequestContext, raw: unknown): Promise<Result<CreatedInvitation>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(createInvitationInputSchema, raw);
  if (!input.ok) return err(input.error);

  const pepper = invitationHashSecret();
  const token = generateToken();
  const code = generateCode();
  const expiresAt = invitationExpiry(ctx.clock.now());

  const created = await invitationsRepository(ctx.db).create(ctx.organizationId, {
    clientId: input.value.clientId,
    email: input.value.email,
    packageId: input.value.packageId,
    tokenHash: hashSecret(token, pepper),
    codeHash: hashSecret(code, pepper),
    expiresAt,
  });
  if (!created.ok) return created;

  const link = `${siteUrl()}/invite/${token}`;
  return ok({
    invitationId: created.value,
    link,
    code: formatCode(code),
    qrSvg: await renderQrSvg(link),
    expiresAt,
  });
}

/** Stan dostępu klienta do panelu: konta z dostępem i oczekujące zaproszenie. */
export async function getClientAccessInfo(ctx: RequestContext, clientId: string): Promise<Result<ClientAccessInfo>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return invitationsRepository(ctx.db).getAccessInfo(ctx.organizationId, clientId, ctx.clock.now());
}

export async function revokeClientAccess(
  ctx: RequestContext,
  clientId: string,
  userId: string,
): Promise<Result<void>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return invitationsRepository(ctx.db).revokeAccess(ctx.organizationId, clientId, userId);
}

const malformed = () => appError("validation", "Niepoprawny kod lub link zaproszenia.");

/** Publiczny podgląd zaproszenia (bez logowania) po tokenie z linku albo krótkim kodzie. */
export async function lookupInvitation(
  db: SupabaseClient,
  rawSecret: string,
  email: string | null = null,
): Promise<Result<InvitationPreview>> {
  const secret = normalizeSecret(rawSecret);
  if (!secret) return err(malformed());
  return invitationsRepository(db).lookup(hashSecret(secret, invitationHashSecret()), email);
}

/** Przyjmuje zaproszenie dla zalogowanego użytkownika: tworzy dostęp do panelu klienta. */
export async function acceptInvitation(
  db: SupabaseClient,
  rawSecret: string,
): Promise<Result<{ clientId: string; organizationId: string }>> {
  const secret = normalizeSecret(rawSecret);
  if (!secret) return err(malformed());
  const result = await invitationsRepository(db).accept(hashSecret(secret, invitationHashSecret()));
  if (!result.ok && result.error.code === "not_found") {
    return err(appError("not_found", "Nie znaleziono zaproszenia. Sprawdź kod lub link."));
  }
  return result;
}
