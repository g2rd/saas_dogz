"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/modules/core";
import { acceptInvitation, invitationProofHash, lookupInvitation, normalizeSecret } from "@/modules/invitations";
import { siteUrl } from "@/shared/env";
import { getLocaleContext } from "@/shared/i18n/server";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";
import { msg } from "@/shared/i18n/messages";

export type InviteState = FormState & {
  /** E-mail jest już zarejestrowany: pokazujemy link do logowania. */
  existingAccount?: boolean;
  confirmationSent?: boolean;
};

/** Wpisanie krótkiego kodu na stronie /invite: przekierowanie na stronę zaproszenia. */
export async function joinWithCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const secret = normalizeSecret(String(formData.get("code") ?? ""));
  if (!secret) {
    return {
      error: "Niepoprawny kod.",
      fieldErrors: { code: ["Kod ma 10 znaków (litery i cyfry), np. ABCDE-FGHJK"] },
      values: { code: String(formData.get("code") ?? "") },
    };
  }
  redirect(`/invite/${secret}`);
}

const MESSAGES: Record<string, string> = {
  email_mismatch:
    "To zaproszenie jest przypisane do innego adresu e-mail. Wyloguj się i użyj konta z właściwym adresem.",
  invitation_unusable: "To zaproszenie wygasło lub zostało już użyte. Poproś trenera o nowe.",
  throttled: "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut.",
};

function acceptError(error: { code: string; message: string; details?: unknown }): string {
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  return (reason && MESSAGES[reason]) || error.message;
}

/** Zalogowany użytkownik przyjmuje zaproszenie na swoje konto. */
export async function acceptInviteAction(secret: string): Promise<InviteState> {
  const db = await createUserClient();
  const result = await acceptInvitation(db, secret);
  if (!result.ok) return { error: acceptError(result.error) };
  redirect("/portal");
}

/**
 * Rejestracja z zaproszenia: sprawdza zaproszenie i e-mail, zakłada konto (zwykła rejestracja, bez uprawnień
 * serwisowych) i od razu przyjmuje zaproszenie. Gdy projekt wymaga potwierdzenia e-mail, dokończenie następuje
 * po kliknięciu linku (wraca na tę stronę).
 */
export async function inviteSignupAction(
  secret: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const db = await createUserClient();
  const email = String(formData.get("email") ?? "");

  const preview = await lookupInvitation(db, secret, email.trim() === "" ? null : email);
  if (!preview.ok) return toFormState(preview.error, formData);
  if (preview.value.status !== "valid") {
    return { error: "To zaproszenie wygasło lub zostało już użyte. Poproś trenera o nowe.", values: {} };
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
    next: `/invite/${secret}`,
    inviteHash: invitationProofHash(secret),
    locale: (await getLocaleContext()).preferred,
  });
  if (!signedUp.ok) {
    if (signedUp.error.code === "conflict") {
      return { ...toFormState(signedUp.error, formData), existingAccount: true };
    }
    return toFormState(signedUp.error, formData);
  }
  if (signedUp.value === "confirmation_required") return { confirmationSent: true };

  const accepted = await acceptInvitation(db, secret);
  if (!accepted.ok) {
    return {
      error: acceptError(accepted.error),
      values: { fullName: String(formData.get("fullName") ?? ""), email },
    };
  }
  redirect("/portal");
}
