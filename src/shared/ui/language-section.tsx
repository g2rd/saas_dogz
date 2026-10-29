import { getTranslations } from "next-intl/server";
import { setLocaleAction, setRegionAction } from "../i18n/actions";
import { SUPPORTED_REGIONS } from "../i18n/currency";
import { LOCALE_LABELS } from "../i18n/locale";
import { getLocaleContext } from "../i18n/server";
import { LanguageSelect } from "./language-select";

/**
 * Sekcja „Język i region” w menu `Więcej` (trener i klient). Wybór języka jest widoczny tylko wtedy, gdy włączone są co najmniej dwa języki
 * (`ENABLED_LOCALES`); region (kraj) wpływa na zapis dat, liczb i numerów telefonu. Domyślnie bierzemy ustawienia z telefonu lub przeglądarki
 * (opcja „Automatycznie”).
 */
export async function LanguageSection() {
  const context = await getLocaleContext();
  const t = await getTranslations();
  const names = new Intl.DisplayNames([context.intl], { type: "region" });
  const regions = SUPPORTED_REGIONS.map((code) => ({ value: code, label: names.of(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label, context.locale));

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4">
      <h2 className="font-semibold">{t("common.language.title")}</h2>
      <p className="text-sm text-zinc-600">{t("common.language.description")}</p>
      {context.enabled.length >= 2 ? (
        <LanguageSelect
          label={t("common.language.label")}
          savingLabel={t("common.language.saving")}
          current={context.chosen ?? "auto"}
          options={[
            { value: "auto", label: t("common.language.auto") },
            ...context.enabled.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] })),
          ]}
          action={setLocaleAction}
        />
      ) : null}
      <LanguageSelect
        label={t("common.language.region_label")}
        savingLabel={t("common.language.saving")}
        current={context.chosenRegion ?? "auto"}
        options={[{ value: "auto", label: t("common.language.auto") }, ...regions]}
        action={setRegionAction}
      />
    </section>
  );
}
