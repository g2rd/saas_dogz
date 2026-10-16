import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authorize, getOrganization } from "@/modules/core";
import { createEmailSender, type EmailSender } from "@/modules/notifications";
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
import { composeInvitationMessage } from "../domain/message";
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

const deliverInputSchema = z.object({
  clientId: z.uuid(),
  link: z.string().min(1).max(500),
  code: z.string().min(1).max(40),
});

const maskEmail = (value: string) => value.replace(/^(.).*(@.*)$/, "$1***$2");

/**
 * Wysyła klientowi zaproszenie e-mailem. Serwer sam weryfikuje link i kod z bazą (HMAC), więc nie da się nim
 * wysłać dowolnej treści ani zaproszenia nieważnego lub cudzego. Adres: e-mail z zaproszenia albo z kartoteki.
 */
export async function deliverClientInvitation(
  ctx: RequestContext,
  raw: unknown,
  sender: { email: EmailSender } = { email: createEmailSender() },
): Promise<Result<{ recipient: string }>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(deliverInputSchema, raw);
  if (!input.ok) return err(input.error);

  const prefix = `${siteUrl()}/invite/`;
  const token = input.value.link.startsWith(prefix) ? normalizeSecret(input.value.link.slice(prefix.length)) : null;
  const code = normalizeSecret(input.value.code);
  if (!token || !code) return err(malformed());

  const pepper = invitationHashSecret();
  const found = await invitationsRepository(ctx.db).findDeliverable(
    ctx.organizationId,
    input.value.clientId,
    hashSecret(token, pepper),
    ctx.clock.now(),
  );
  if (!found.ok) return found;
  const invitation = found.value;
  if (!invitation || invitation.codeHash !== hashSecret(code, pepper)) {
    return err(appError("not_found", "To zaproszenie jest już nieważne. Utwórz nowe."));
  }

  const organization = await getOrganization(ctx);
  if (!organization.ok) return organization;

  const message = composeInvitationMessage({
    organizationName: organization.value.name,
    clientFirstName: invitation.clientFirstName,
    link: input.value.link,
    code: formatCode(code),
    expiresAt: invitation.expiresAt,
    packageName: invitation.packageName,
  });

  const to = invitation.email ?? invitation.clientEmail;
  if (!to) return err(appError("validation", "Klient nie ma adresu e-mail. Uzupełnij go w kartotece."));
  try {
    const outcome = await sender.email.send({ to, subject: message.subject, text: message.text, html: message.html });
    if (outcome.status === "skipped") {
      return err(appError("internal", `E-mail nie został wysłany: ${outcome.detail ?? "brak konfiguracji"}.`));
    }
  } catch {
    return err(appError("internal", "Nie udało się wysłać e-maila. Spróbuj ponownie albo przekaż link osobiście."));
  }
  return ok({ recipient: maskEmail(to) });
}
