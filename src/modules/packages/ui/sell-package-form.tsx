"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { formatMoney, money } from "@/shared/money";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";

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
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <SelectField
        label="Szablon pakietu"
        name="templateId"
        defaultValue={v("templateId")}
        errors={errors.templateId}
        options={[
          { value: "", label: "Własny pakiet (wpisz dane poniżej)" },
          ...templates.map((t) => ({
            value: t.id,
            label: `${t.name}: ${t.sessionsCount} zajęć, ${formatMoney(money(t.priceMinor, t.currency))}`,
          })),
        ]}
      />
      <SelectField
        label="Pies"
        name="dogId"
        defaultValue={v("dogId")}
        options={[{ value: "", label: "Bez przypisania do psa" }, ...dogs.map((d) => ({ value: d.id, label: d.name }))]}
      />

      <fieldset className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm text-zinc-600 dark:text-zinc-400">
          Własny pakiet lub zmiana ustawień z szablonu
        </legend>
        <TextField label="Nazwa" name="name" defaultValue={v("name")} errors={errors.name} />
        <TextField
          label="Liczba zajęć"
          name="sessionsCount"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v("sessionsCount")}
          errors={errors.sessionsCount}
        />
        <TextField
          label="Cena (zł)"
          name="price"
          inputMode="decimal"
          defaultValue={v("price")}
          errors={errors.price}
          hint="Przy szablonie wpisz tylko, żeby zmienić cenę (np. rabat)"
        />
        <TextField
          label="Ważność (dni)"
          name="validityDays"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v("validityDays")}
          errors={errors.validityDays}
        />
      </fieldset>

      <TextField
        label="Początek ważności"
        name="validFrom"
        type="date"
        defaultValue={v("validFrom")}
        errors={errors.validFrom}
        hint="Puste = dziś"
      />
      <TextField
        label="Termin płatności"
        name="dueDate"
        type="date"
        defaultValue={v("dueDate")}
        errors={errors.dueDate}
        hint="Puste = za 7 dni"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Sprzedawanie...">Sprzedaj pakiet</SubmitButton>
      </div>
    </form>
  );
}
