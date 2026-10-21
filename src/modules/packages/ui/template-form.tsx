"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback?: string | number | null) =>
    state.values?.[name] ?? (fallback == null ? "" : String(fallback));

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField label={t("packages.templateForm.nazwa_pakietu")} name="name" defaultValue={v("name", values?.name)} errors={errors.name} required />
      <TextField
        label={t("common.liczba_zajec")}
        name="sessionsCount"
        type="number"
        inputMode="numeric"
        min={1}
        defaultValue={v("sessionsCount", values?.sessionsCount)}
        errors={errors.sessionsCount}
        required
      />
      <TextField
        label={t("common.cena_zl")}
        name="price"
        inputMode="decimal"
        defaultValue={v("price", values?.price)}
        errors={errors.price}
        hint={t("packages.templateForm.np_800_lub_800_50")}
        required
      />
      <TextField
        label={t("common.waznosc_dni")}
        name="validityDays"
        type="number"
        inputMode="numeric"
        min={1}
        defaultValue={v("validityDays", values?.validityDays)}
        errors={errors.validityDays}
        hint={t("packages.templateForm.zostaw_puste_jesli_pakiet_nie_wygasa")}
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
