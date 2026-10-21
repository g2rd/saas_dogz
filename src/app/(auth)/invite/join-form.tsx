"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

export function JoinForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label={t("common.kod_zaproszenia")}
        name="code"
        defaultValue={state.values?.code}
        errors={state.fieldErrors?.code}
        hint={t("auth.inviteJoinForm.kod_dostales_od_trenera_np_abcde_fghjk")}
        autoComplete="off"
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={t("auth.inviteJoinForm.sprawdzanie")}>{t("auth.inviteJoinForm.dalej")}</SubmitButton>
      </div>
    </form>
  );
}
