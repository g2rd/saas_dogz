"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, TextField } from "@/shared/ui/form-fields";
import { PAYMENT_METHODS } from "../domain/payment";
import { useTranslations } from "next-intl";

export type OpenChargeOption = { id: string; label: string };

export function RecordPaymentForm({
  action,
  openCharges,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  openCharges: OpenChargeOption[];
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label={t("payments.recordPaymentForm.kwota_zl")}
        name="amount"
        inputMode="decimal"
        defaultValue={v("amount")}
        errors={errors.amount}
        hint={t("payments.recordPaymentForm.np_300_lub_300_50")}
        required
      />
      <SelectField
        label={t("payments.recordPaymentForm.sposob_platnosci")}
        name="method"
        defaultValue={v("method") || "cash"}
        errors={errors.method}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`labels.paymentMethod.${m}`) }))}
      />
      <SelectField
        label={t("payments.recordPaymentForm.na_ktora_naleznosc")}
        name="chargeId"
        defaultValue={v("chargeId")}
        errors={errors.chargeId}
        options={[
          { value: "", label: "Automatycznie (najstarsze po terminie najpierw)" },
          ...openCharges.map((c) => ({ value: c.id, label: c.label })),
        ]}
      />
      <TextField
        label={t("payments.recordPaymentForm.data_wplaty")}
        name="paidAt"
        type="date"
        defaultValue={v("paidAt")}
        errors={errors.paidAt}
        hint={t("common.puste_dzis")}
      />
      <TextField label={t("payments.recordPaymentForm.opis_opcjonalnie")} name="reference" defaultValue={v("reference")} errors={errors.reference} />
      <FormMessage state={state} />
      <div>
        <ConfirmSubmit
          tone="primary"
          title={t("payments.recordPaymentForm.zaksiegowac_wplate")}
          description={t("payments.recordPaymentForm.wplata_zostanie_zapisana_i_rozliczona_z")}
          confirmLabel={t("payments.recordPaymentForm.zaksieguj")}
          pendingLabel={t("common.zapisywanie")}
        >
          {t("common.zaksieguj_wplate")}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
