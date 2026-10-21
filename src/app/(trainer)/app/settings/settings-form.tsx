"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckboxField, FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { SettingsFormState } from "./actions";

type Option = { value: string; label: string };

type Props = {
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  initial: { currency: string; timezone: string; locale: string; lateCancelHours: number; lateCancelConsumesSession: boolean };
  currencyOptions: Option[];
  timezoneOptions: Option[];
  localeOptions: Option[];
  currencyLocked: boolean;
};

/** Formularz ustawień szkoły. Zablokowana waluta jest widoczna, ale niezmienialna (wartość leci ukrytym polem). */
export function SettingsForm({ action, initial, currencyOptions, timezoneOptions, localeOptions, currencyLocked }: Props) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      {currencyLocked ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("settings.currency.label")}</span>
          <p className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 leading-[2.75rem]" data-testid="currency-locked">
            {initial.currency}
          </p>
          <input type="hidden" name="currency" value={initial.currency} />
          <p className="text-zinc-600">{t("settings.currency.locked")}</p>
        </div>
      ) : (
        <SelectField
          name="currency"
          label={t("settings.currency.label")}
          hint={t("settings.currency.hint")}
          options={currencyOptions}
          defaultValue={value("currency", initial.currency)}
          errors={errors.currency}
        />
      )}
      <SelectField
        name="timezone"
        label={t("settings.timezone.label")}
        hint={t("settings.timezone.hint")}
        options={timezoneOptions}
        defaultValue={value("timezone", initial.timezone)}
        errors={errors.timezone}
      />
      <SelectField
        name="locale"
        label={t("settings.locale.label")}
        hint={t("settings.locale.hint")}
        options={localeOptions}
        defaultValue={value("locale", initial.locale)}
        errors={errors.locale}
      />
      <TextField
        name="lateCancelHours"
        label={t("settings.lateCancel.hours.label")}
        hint={t("settings.lateCancel.hours.hint")}
        type="number"
        inputMode="numeric"
        min={0}
        defaultValue={value("lateCancelHours", String(initial.lateCancelHours))}
        errors={errors.lateCancelHours}
      />
      <CheckboxField
        name="lateCancelConsumesSession"
        label={t("settings.lateCancel.consumes.label")}
        hint={t("settings.lateCancel.consumes.hint")}
        defaultChecked={state.values ? state.values.lateCancelConsumesSession === "on" : initial.lateCancelConsumesSession}
      />
      <FormMessage state={state} />
      {state.saved ? (
        <p role="status" className="text-sm text-emerald-700">
          {t("settings.saved")}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel={t("settings.saving")}>{t("settings.save")}</SubmitButton>
      </div>
    </form>
  );
}
