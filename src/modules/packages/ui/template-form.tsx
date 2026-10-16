"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export type TemplateFormValues = {
  name: string;
  sessionsCount: number;
  validityDays: number | null;
  /** Cena w złotych jako tekst, np. "800,00". */
  price: string;
};

export function TemplateForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: TemplateFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback?: string | number | null) =>
    state.values?.[name] ?? (fallback == null ? "" : String(fallback));

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField label="Nazwa pakietu" name="name" defaultValue={v("name", values?.name)} errors={errors.name} required />
      <TextField
        label="Liczba zajęć"
        name="sessionsCount"
        type="number"
        inputMode="numeric"
        min={1}
        defaultValue={v("sessionsCount", values?.sessionsCount)}
        errors={errors.sessionsCount}
        required
      />
      <TextField
        label="Cena (zł)"
        name="price"
        inputMode="decimal"
        defaultValue={v("price", values?.price)}
        errors={errors.price}
        hint="Np. 800 lub 800,50"
        required
      />
      <TextField
        label="Ważność (dni)"
        name="validityDays"
        type="number"
        inputMode="numeric"
        min={1}
        defaultValue={v("validityDays", values?.validityDays)}
        errors={errors.validityDays}
        hint="Zostaw puste, jeśli pakiet nie wygasa"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
