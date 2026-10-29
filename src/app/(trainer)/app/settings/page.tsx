import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hasPermission, getSchoolSettings } from "@/modules/core";
import { SELECTABLE_CURRENCIES } from "@/shared/i18n/currency";
import { enabledLocales, LOCALE_LABELS } from "@/shared/i18n/locale";
import { requireContext } from "../../_lib/context";
import { saveSchoolSettingsAction } from "./actions";
import { SettingsForm } from "./settings-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function SchoolSettingsPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/more" className="text-sm underline">
        {t("settings.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("settings.title")}</h1>
      <p className="mt-2 max-w-xl text-sm text-zinc-600">{t("settings.description")}</p>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Settings />
      </Suspense>
    </>
  );
}

/** Lista stref IANA z `Intl`; bieżąca strefa jest zawsze na liście, nawet gdy środowisko jej nie zna. */
function timezoneOptions(current: string) {
  const zones = new Set<string>(Intl.supportedValuesOf("timeZone"));
  zones.add(current);
  return [...zones].sort().map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
}

async function Settings() {
  const t = await getTranslations();
  const ctx = await requireContext();
  if (!hasPermission(ctx, "organization.update")) notFound();

  const result = await getSchoolSettings(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { settings, currencyLocked } = result.value;

  // Bieżąca waluta i język szkoły są na liście, nawet jeśli nie są (już) oferowane
  const currencies = [...new Set([settings.currency, ...SELECTABLE_CURRENCIES])].sort();
  const locales = [...new Set([settings.locale, ...enabledLocales()])];
  const labelOf = (code: string) => (code in LOCALE_LABELS ? LOCALE_LABELS[code as keyof typeof LOCALE_LABELS] : code);

  return (
    <section className="mt-6" aria-label={t("settings.title")}>
      <SettingsForm
        action={saveSchoolSettingsAction}
        initial={settings}
        currencyOptions={currencies.map((code) => ({ value: code, label: code }))}
        timezoneOptions={timezoneOptions(settings.timezone)}
        localeOptions={locales.map((code) => ({ value: code, label: labelOf(code) }))}
        currencyLocked={currencyLocked}
      />
    </section>
  );
}
