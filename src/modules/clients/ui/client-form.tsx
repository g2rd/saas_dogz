"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, type ClientStatus } from "../domain/client";

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
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField label="Imię" name="firstName" defaultValue={values?.firstName} errors={errors.firstName} required />
      <TextField label="Nazwisko" name="lastName" defaultValue={values?.lastName} errors={errors.lastName} />
      <TextField
        label="E-mail"
        name="email"
        type="email"
        defaultValue={values?.email}
        errors={errors.email}
        autoComplete="off"
      />
      <TextField
        label="Telefon"
        name="phone"
        type="tel"
        defaultValue={values?.phone}
        errors={errors.phone}
        hint="Numer polski bez prefiksu zapiszemy jako +48"
        autoComplete="off"
      />
      <SelectField
        label="Status"
        name="status"
        defaultValue={values?.status ?? "active"}
        options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABELS[s] }))}
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
