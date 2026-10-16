"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { DOG_SEXES, DOG_SEX_LABELS, type DogSex } from "../domain/dog";

export type DogFormValues = {
  name: string;
  breed: string | null;
  birthDate: string | null;
  sex: DogSex;
};

export function DogForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: DogFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  // React 19 czyści formularz po akcji; po błędzie wracamy do tego, co wpisał użytkownik.
  const v = (name: string, fallback?: string | null) => state.values?.[name] ?? fallback ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField label="Imię psa" name="name" defaultValue={v("name", values?.name)} errors={errors.name} required />
      <TextField label="Rasa" name="breed" defaultValue={v("breed", values?.breed)} errors={errors.breed} />
      <TextField
        label="Data urodzenia"
        name="birthDate"
        type="date"
        defaultValue={v("birthDate", values?.birthDate)}
        errors={errors.birthDate}
      />
      <SelectField
        label="Płeć"
        name="sex"
        defaultValue={v("sex", values?.sex ?? "unknown")}
        options={DOG_SEXES.map((s) => ({ value: s, label: DOG_SEX_LABELS[s] }))}
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
