"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/modules/core";
import { lookupSchoolJoin, requestSchoolJoin } from "@/modules/invitations";
import { siteUrl } from "@/shared/env";
import { toFormState, type FormState } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";
import { getLocaleContext } from "@/shared/i18n/server";
import { createUserClient } from "@/shared/supabase/server";
import type { InviteState } from "../../invite/actions";

/**
 * Rejestracja z linku szkoły. Token linku jest dowodem przy zamkniętym naborze (baza sprawdza, że link jest aktywny); konto może
 * tylko wysłać prośbę o dołączenie. Po założeniu konta wracamy na stronę linku, gdzie czeka formularz prośby.
 */
export async function schoolSignupAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const db = await createUserClient();
  const school = await lookupSchoolJoin(db, token);
  if (!school.ok) return toFormState(school.error, formData);
  if (!school.value) return { error: msg("errors.db.not_found"), values: {} };

  const signedUp = await signUp(db, Object.fromEntries(formData), {
    siteUrl: siteUrl(),
    next: `/school/${token}`,
    inviteHash: token,
    locale: (await getLocaleContext()).preferred,
  });
  if (!signedUp.ok) {
    if (signedUp.error.code === "conflict") return { ...toFormState(signedUp.error, formData), existingAccount: true };
    return toFormState(signedUp.error, formData);
  }
  if (signedUp.value === "confirmation_required") return { confirmationSent: true };
  redirect(`/school/${token}`);
}

/** Zalogowana osoba wysyła prośbę o dołączenie; potem widzi jej status na `/school`. */
export async function requestJoinAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const db = await createUserClient();
  const result = await requestSchoolJoin(db, { ...Object.fromEntries(formData), token });
  if (!result.ok) {
    // Osoba ma już dostęp do tej szkoły: nic nie wysyłamy, tylko prowadzimy do panelu
    if ((result.error.details as { reason?: string } | undefined)?.reason === "already_member") redirect("/start");
    return toFormState(result.error, formData);
  }
  redirect("/school");
}
