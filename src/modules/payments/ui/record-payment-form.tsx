"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../domain/payment";

export type OpenChargeOption = { id: string; label: string };

export function RecordPaymentForm({
  action,
  openCharges,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  openCharges: OpenChargeOption[];
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label="Kwota (zł)"
        name="amount"
        inputMode="decimal"
        defaultValue={v("amount")}
        errors={errors.amount}
        hint="Np. 300 lub 300,50"
        required
      />
      <SelectField
        label="Sposób płatności"
        name="method"
        defaultValue={v("method") || "cash"}
        errors={errors.method}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
      />
      <SelectField
        label="Na którą należność"
        name="chargeId"
        defaultValue={v("chargeId")}
        errors={errors.chargeId}
        options={[
          { value: "", label: "Automatycznie (najstarsze po terminie najpierw)" },
          ...openCharges.map((c) => ({ value: c.id, label: c.label })),
        ]}
      />
      <TextField
        label="Data wpłaty"
        name="paidAt"
        type="date"
        defaultValue={v("paidAt")}
        errors={errors.paidAt}
        hint="Puste = dziś"
      />
      <TextField label="Opis (opcjonalnie)" name="reference" defaultValue={v("reference")} errors={errors.reference} />
      <FormMessage state={state} />
      <div>
        <SubmitButton>Zaksięguj wpłatę</SubmitButton>
      </div>
    </form>
  );
}
