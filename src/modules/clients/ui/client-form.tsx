"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { CLIENT_STATUSES, type ClientStatus } from "../domain/client";
import { useTranslations } from "next-intl";

export type ClientFormValues = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
};

export function ClientForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: ClientFormValues;
  submitLabel: string;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  // React 19 czyści formularz po akcji; po błędzie wracamy do tego, co wpisał użytkownik.
  const v = (name: string, fallback?: string | null) => state.values?.[name] ?? fallback ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField label={t("clients.clientForm.imie")} name="firstName" defaultValue={v("firstName", values?.firstName)} errors={errors.firstName} required />
      <TextField label={t("clients.clientForm.nazwisko")} name="lastName" defaultValue={v("lastName", values?.lastName)} errors={errors.lastName} />
      <TextField
        label={t("common.e_mail")}
        name="email"
        type="email"
        defaultValue={v("email", values?.email)}
        errors={errors.email}
        autoComplete="off"
      />
      <TextField
        label={t("clients.clientForm.telefon")}
        name="phone"
        type="tel"
        defaultValue={v("phone", values?.phone)}
        errors={errors.phone}
        hint={t("clients.clientForm.numer_polski_bez_prefiksu_zapiszemy_jako")}
        autoComplete="off"
      />
      <SelectField
        label={t("clients.clientForm.status")}
        name="status"
        defaultValue={v("status", values?.status ?? "active")}
        options={CLIENT_STATUSES.map((s) => ({ value: s, label: t(`labels.clientStatus.${s}`) }))}
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
