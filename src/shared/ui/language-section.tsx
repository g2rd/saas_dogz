import { getTranslations } from "next-intl/server";
import { setLocaleAction } from "../i18n/actions";
import { LOCALE_LABELS } from "../i18n/locale";
import { getLocaleContext } from "../i18n/server";
import { LanguageSelect } from "./language-select";

/**
 * Sekcja „Język” w menu `Więcej` (trener i klient). Widoczna tylko wtedy, gdy włączone są co najmniej dwa języki
 * (`ENABLED_LOCALES`); domyślnie język bierzemy z telefonu lub przeglądarki (opcja „Automatycznie”).
 */
export async function LanguageSection() {
  const context = await getLocaleContext();
  if (context.enabled.length < 2) return null;
  const t = await getTranslations();

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4">
      <h2 className="font-semibold">{t("common.language.title")}</h2>
      <p className="text-sm text-zinc-600">{t("common.language.description")}</p>
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
    </section>
  );
}
