"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

export type SessionTypeFormValues = {
  name: string;
  durationMinutes: number;
  /** Cena w złotych jako tekst, np. "100,00". */
  defaultPrice: string;
};

export function SessionTypeForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: SessionTypeFormValues;
  submitLabel: string;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback?: string | number | null) =>
    state.values?.[name] ?? (fallback == null ? "" : String(fallback));

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label={t("scheduling.sessionTypeForm.nazwa_zajec")}
        name="name"
        defaultValue={v("name", values?.name)}
        errors={errors.name}
        hint={t("scheduling.sessionTypeForm.np_trening_indywidualny_konsultacja")}
        required
      />
      <TextField
        label={t("scheduling.sessionTypeForm.czas_trwania_minuty")}
        name="durationMinutes"
        type="number"
        inputMode="numeric"
        min={5}
        defaultValue={v("durationMinutes", values?.durationMinutes ?? 60)}
        errors={errors.durationMinutes}
        required
      />
      <TextField
        label={t("scheduling.sessionTypeForm.cena_pojedynczych_zajec_zl")}
        name="defaultPrice"
        inputMode="decimal"
        defaultValue={v("defaultPrice", values?.defaultPrice ?? "0")}
        errors={errors.defaultPrice}
        hint={t("scheduling.sessionTypeForm.naliczana_gdy_zajecia_rozliczasz_bez")}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
