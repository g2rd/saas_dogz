"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/modules/core";
import { acceptMemberInvitation, invitationProofHash, lookupMemberInvitation } from "@/modules/invitations";
import { siteUrl } from "@/shared/env";
import { getLocaleContext } from "@/shared/i18n/server";
import { toFormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";
import type { InviteState } from "../invite/actions";
import { msg } from "@/shared/i18n/messages";

const MESSAGES: Record<string, string> = {
  email_mismatch:
    "To zaproszenie jest przypisane do innego adresu e-mail. Wyloguj się i użyj konta z właściwym adresem.",
  invitation_unusable: "To zaproszenie wygasło lub zostało już użyte. Poproś o nowe.",
  already_member: "Masz już dostęp do tej organizacji.",
  throttled: "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut.",
};

function acceptError(error: { message: string; details?: unknown }): string {
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  return (reason && MESSAGES[reason]) || error.message;
}

/** Zalogowany użytkownik przyjmuje zaproszenie do zespołu na swoje konto. */
export async function acceptJoinAction(token: string): Promise<InviteState> {
  const db = await createUserClient();
  const result = await acceptMemberInvitation(db, token);
  if (!result.ok) return { error: acceptError(result.error) };
  redirect("/app");
}

/** Rejestracja z zaproszenia do zespołu: sprawdza zaproszenie i e-mail, zakłada konto i od razu przyjmuje zaproszenie. */
export async function joinSignupAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const db = await createUserClient();
  const email = String(formData.get("email") ?? "");

  const preview = await lookupMemberInvitation(db, token, email.trim() === "" ? null : email);
  if (!preview.ok) return toFormState(preview.error, formData);
  if (preview.value.status !== "valid") {
    return { error: "To zaproszenie wygasło lub zostało już użyte. Poproś o nowe.", values: {} };
  }
  if (preview.value.emailMatches === false) {
    return {
      error: msg("validation.fix_fields"),
      fieldErrors: { email: ["Podaj adres e-mail, na który wysłano zaproszenie"] },
      values: { fullName: String(formData.get("fullName") ?? ""), email },
    };
  }

  const signedUp = await signUp(db, Object.fromEntries(formData), {
    siteUrl: siteUrl(),
    next: `/join/${token}`,
    inviteHash: invitationProofHash(token),
    locale: (await getLocaleContext()).preferred,
  });
  if (!signedUp.ok) {
    if (signedUp.error.code === "conflict") return { ...toFormState(signedUp.error, formData), existingAccount: true };
    return toFormState(signedUp.error, formData);
  }
  if (signedUp.value === "confirmation_required") return { confirmationSent: true };

  const accepted = await acceptMemberInvitation(db, token);
  if (!accepted.ok) {
    return { error: acceptError(accepted.error), values: { fullName: String(formData.get("fullName") ?? ""), email } };
  }
  redirect("/app");
}
