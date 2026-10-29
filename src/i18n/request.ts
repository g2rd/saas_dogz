import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "@/shared/i18n/locale";
import { PSEUDO_COOKIE, pseudoLocaleEnabled, pseudoLocalizeMessages } from "@/shared/i18n/pseudo";
import { loadMessages } from "./messages";

/**
 * Konfiguracja next-intl bez routingu językowego: język z ciasteczka (wybór w `Więcej`) albo z nagłówka `Accept-Language`
 * (ustawienia telefonu lub przeglądarki), tylko spośród języków włączonych (`ENABLED_LOCALES`).
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const { locale } = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  const messages = await loadMessages(locale);
  // Podgląd układu z wydłużonymi tekstami (tylko gdy włączony zmienną środowiskową; patrz pseudo.ts)
  const pseudo = pseudoLocaleEnabled() && cookieStore.get(PSEUDO_COOKIE)?.value === "1";
  return { locale, messages: pseudo ? pseudoLocalizeMessages(messages) : messages };
});
