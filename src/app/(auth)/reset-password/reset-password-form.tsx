"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

export function ResetPasswordForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label={t("common.nowe_haslo")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("common.co_najmniej_8_znakow")}
        errors={errors.password}
        required
      />
      <TextField
        label={t("auth.resetPasswordResetPasswordForm.powtorz_haslo")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={errors.confirmPassword}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{t("auth.resetPasswordResetPasswordForm.ustaw_haslo")}</SubmitButton>
      </div>
    </form>
  );
}
