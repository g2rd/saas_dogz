import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize, getOrganization, hasPermission } from "@/modules/core";
import { createEmailSender, type EmailSender } from "@/modules/notifications";
import type { RequestContext } from "@/shared/context";
import { invitationHashSecret, siteUrl } from "@/shared/env";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import {
  MEMBER_ROLE_LABELS,
  createMemberInvitationSchema,
  type CreatedMemberInvitation,
  type MemberInvitationPreview,
  type MemberRole,
  type TeamOverview,
} from "../domain/invitation";
import { composeMemberInvitationMessage } from "../domain/message";
import { generateToken, hashSecret, invitationExpiry, normalizeSecret } from "../domain/secrets";
import { membersRepository } from "../infrastructure/members-repository";

const malformed = () => appError("validation", "Niepoprawny link zaproszenia.");

/**
 * Zaprasza osobę do zespołu (administrator, trener, asystent). Link jest zwracany tylko tutaj (w bazie jest sam HMAC);
 * wiadomość e-mail wysyłamy od razu, a jej niepowodzenie nie psuje zaproszenia: trener może przekazać link ręcznie.
 */
export async function createMemberInvitation(
  ctx: RequestContext,
  raw: unknown,
  email: EmailSender = createEmailSender(),
): Promise<Result<CreatedMemberInvitation>> {
  const allowed = authorize(ctx, "members.manage");
  if (!allowed.ok) return allowed;

  const input = parseInput(createMemberInvitationSchema, raw);
  if (!input.ok) return err(input.error);

  const token = generateToken();
  const expiresAt = invitationExpiry(ctx.clock.now());
  const created = await membersRepository(ctx.db).create(ctx.organizationId, {
    email: input.value.email,
    role: input.value.role,
    tokenHash: hashSecret(token, invitationHashSecret()),
    expiresAt,
  });
  if (!created.ok) return created;

  const link = `${siteUrl()}/join/${token}`;
  const organization = await getOrganization(ctx);
  let emailSent = false;
  if (organization.ok) {
    const message = composeMemberInvitationMessage({
      organizationName: organization.value.name,
      roleLabel: MEMBER_ROLE_LABELS[input.value.role],
      link,
      expiresAt,
    });
    try {
      const outcome = await email.send({ to: input.value.email, ...message });
      emailSent = outcome.status === "sent";
    } catch {
      emailSent = false;
    }
  }
  return ok({ invitationId: created.value, link, expiresAt, emailSent });
}

/** Zespół organizacji: członkowie z rolami oraz (dla właściciela i administratora) oczekujące zaproszenia. */
export async function getTeam(ctx: RequestContext): Promise<Result<TeamOverview>> {
  const allowed = authorize(ctx, "members.read");
  if (!allowed.ok) return allowed;
  return membersRepository(ctx.db).team(ctx.organizationId, ctx.userId, hasPermission(ctx, "members.manage"), ctx.clock.now());
}

export async function revokeMemberInvitation(ctx: RequestContext, invitationId: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "members.manage");
  if (!allowed.ok) return allowed;
  return membersRepository(ctx.db).revoke(ctx.organizationId, invitationId);
}

/** Publiczny podgląd zaproszenia do zespołu (bez logowania). */
export async function lookupMemberInvitation(
  db: SupabaseClient,
  rawToken: string,
  email: string | null = null,
): Promise<Result<MemberInvitationPreview>> {
  const token = normalizeSecret(rawToken);
  if (!token) return err(malformed());
  return membersRepository(db).lookup(hashSecret(token, invitationHashSecret()), email);
}

/** Przyjmuje zaproszenie dla zalogowanego użytkownika (jego adres e-mail musi być adresem zaproszenia). */
export async function acceptMemberInvitation(
  db: SupabaseClient,
  rawToken: string,
): Promise<Result<{ organizationId: string; role: MemberRole }>> {
  const token = normalizeSecret(rawToken);
  if (!token) return err(malformed());
  const result = await membersRepository(db).accept(hashSecret(token, invitationHashSecret()));
  if (!result.ok && result.error.code === "not_found") {
    return err(appError("not_found", "Nie znaleziono zaproszenia. Sprawdź link."));
  }
  return result;
}
