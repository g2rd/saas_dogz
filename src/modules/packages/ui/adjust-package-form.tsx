"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

export function AdjustPackageForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label={t("packages.adjustPackageForm.zmiana_liczby_zajec")}
        name="delta"
        type="number"
        inputMode="numeric"
        defaultValue={state.values?.delta}
        errors={errors.delta}
        hint={t("packages.adjustPackageForm.np_1_odjecie_zajec_lub_1_dodanie_saldo")}
        required
      />
      <TextField label={t("packages.adjustPackageForm.powod_opcjonalnie")} name="note" defaultValue={state.values?.note} errors={errors.note} />
      <FormMessage state={state} />
      <div>
        <ConfirmSubmit
          tone="primary"
          title={t("packages.adjustPackageForm.zapisac_korekte_salda")}
          description={t("packages.adjustPackageForm.saldo_pakietu_zmieni_sie_od_razu_a_wpis")}
          confirmLabel={t("packages.adjustPackageForm.zapisz_korekte")}
          pendingLabel={t("common.zapisywanie")}
        >
          {t("packages.adjustPackageForm.zapisz_korekte")}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
