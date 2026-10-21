"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { ForgotPasswordState } from "./actions";
import { useTranslations } from "next-intl";

export function ForgotPasswordForm({
  action,
}: {
  action: (prev: ForgotPasswordState, formData: FormData) => Promise<ForgotPasswordState>;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.sent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {t("auth.forgotPasswordForgotPasswordForm.jesli_konto_z_tym_adresem_istnieje")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label={t("common.e_mail")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={errors.email}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={t("common.wysylanie")}>{t("auth.forgotPasswordForgotPasswordForm.wyslij_link")}</SubmitButton>
      </div>
    </form>
  );
}
