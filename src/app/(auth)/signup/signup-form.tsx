"use client";

import { useActionState } from "react";
import { ConsentField } from "@/shared/ui/consent-field";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { SignupState } from "./actions";
import { useTranslations } from "next-intl";

export function SignupForm({
  action,
  next,
  requireCode = false,
}: {
  action: (prev: SignupState, formData: FormData) => Promise<SignupState>;
  next: string;
  /** Rejestracja zamknięta: wymagany kod zaproszenia od zespołu. */
  requireCode?: boolean;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.confirmationSent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {t("auth.signupSignupForm.wyslalismy_wiadomosc_z_linkiem")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {requireCode ? (
        <TextField
          label={t("common.kod_zaproszenia")}
          name="betaCode"
          autoComplete="off"
          defaultValue={state.values?.betaCode}
          errors={errors.betaCode}
          hint={t("auth.signupSignupForm.rejestracja_jest_na_razie_zamknieta_kod")}
          required
        />
      ) : null}
      <TextField
        label={t("common.imie_i_nazwisko")}
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        errors={errors.fullName}
      />
      <TextField
        label={t("common.e_mail")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={errors.email}
        required
      />
      <TextField
        label={t("common.haslo")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("common.co_najmniej_8_znakow")}
        errors={errors.password}
        required
      />
      <ConsentField errors={errors.acceptTerms} defaultChecked={state.values?.acceptTerms === "on"} />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={t("auth.signupSignupForm.tworzenie_konta")}>{t("common.zaloz_konto")}</SubmitButton>
      </div>
    </form>
  );
}
