"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { money } from "@/shared/money";
import { FormMessage, SelectField, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";
import { useFormats } from "@/shared/i18n/client";

export type SellTemplateOption = {
  id: string;
  name: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
};

export function SellPackageForm({
  action,
  templates,
  dogs,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  templates: SellTemplateOption[];
  dogs: { id: string; name: string }[];
}) {
  const formats = useFormats();
  const tr = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <SelectField
        label={tr("packages.sellPackageForm.szablon_pakietu")}
        name="templateId"
        defaultValue={v("templateId")}
        errors={errors.templateId}
        options={[
          { value: "", label: tr("packages.sellPackageForm.custom_package") },
          ...templates.map((t) => ({
            value: t.id,
            label: tr("packages.sellPackageForm.template_option", {
              name: t.name,
              sessions: tr("common.sessions_count", { count: t.sessionsCount }),
              price: formats.money(money(t.priceMinor, t.currency)),
            }),
          })),
        ]}
      />
      <SelectField
        label={tr("common.pies")}
        name="dogId"
        defaultValue={v("dogId")}
        options={[{ value: "", label: "Bez przypisania do psa" }, ...dogs.map((d) => ({ value: d.id, label: d.name }))]}
      />

      <fieldset className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm text-zinc-600 dark:text-zinc-400">
          {tr("packages.sellPackageForm.wlasny_pakiet_lub_zmiana_ustawien_z")}
        </legend>
        <TextField label={tr("packages.sellPackageForm.nazwa")} name="name" defaultValue={v("name")} errors={errors.name} />
        <TextField
          label={tr("common.liczba_zajec")}
          name="sessionsCount"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v("sessionsCount")}
          errors={errors.sessionsCount}
        />
        <TextField
          label={tr("common.cena_zl")}
          name="price"
          inputMode="decimal"
          defaultValue={v("price")}
          errors={errors.price}
          hint={tr("packages.sellPackageForm.przy_szablonie_wpisz_tylko_zeby_zmienic")}
        />
        <TextField
          label={tr("common.waznosc_dni")}
          name="validityDays"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v("validityDays")}
          errors={errors.validityDays}
        />
      </fieldset>

      <TextField
        label={tr("packages.sellPackageForm.poczatek_waznosci")}
        name="validFrom"
        type="date"
        defaultValue={v("validFrom")}
        errors={errors.validFrom}
        hint={tr("common.puste_dzis")}
      />
      <TextField
        label={tr("packages.sellPackageForm.termin_platnosci")}
        name="dueDate"
        type="date"
        defaultValue={v("dueDate")}
        errors={errors.dueDate}
        hint={tr("packages.sellPackageForm.puste_za_7_dni")}
      />
      <FormMessage state={state} />
      <div>
        <ConfirmSubmit
          tone="primary"
          title={tr("packages.sellPackageForm.sprzedac_pakiet")}
          description={tr("packages.sellPackageForm.klient_dostanie_pakiet_zajec_i_powstanie")}
          confirmLabel={tr("common.sprzedaj_pakiet")}
          pendingLabel={tr("packages.sellPackageForm.sprzedawanie")}
        >
          {tr("common.sprzedaj_pakiet")}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
