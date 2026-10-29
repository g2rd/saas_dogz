"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

/** Formularz prośby o dołączenie do szkoły (osoba jest już zalogowana; e-mail bierze baza z jej konta). */
export function JoinRequestForm({
  action,
  firstName,
  lastName,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  firstName: string;
  lastName: string;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField label={t("invitations.schoolJoin.form.first_name")} name="firstName" autoComplete="given-name" defaultValue={state.values?.firstName ?? firstName} errors={errors.firstName} required />
      <TextField label={t("invitations.schoolJoin.form.last_name")} name="lastName" autoComplete="family-name" defaultValue={state.values?.lastName ?? lastName} errors={errors.lastName} />
      <TextField label={t("invitations.schoolJoin.form.phone")} name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone} errors={errors.phone} />
      <TextAreaField label={t("invitations.schoolJoin.form.note")} name="note" defaultValue={state.values?.note} errors={errors.note} hint={t("invitations.schoolJoin.form.note_hint")} />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={t("invitations.schoolJoin.form.sending")}>{t("invitations.schoolJoin.form.submit")}</SubmitButton>
      </div>
    </form>
  );
}
