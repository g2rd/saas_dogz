import "server-only";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createFormats, type Formats } from "./formats";
import {
  enabledLocales,
  intlLocale,
  isLocale,
  LOCALE_COOKIE,
  REGION_COOKIE,
  parseAcceptLanguage,
  resolveLocale,
  type Locale,
  type ResolvedLocale,
} from "./locale";
import { DEFAULT_PHONE_COUNTRY, phonePrefix } from "../phone";
import type { Translator } from "./messages";

export type LocaleContext = ResolvedLocale & {
  /** Znacznik do `Intl` z regionem, gdy znany (np. `en-GB`). */
  intl: string;
  enabled: Locale[];
  /** Język wybrany ręcznie w ustawieniach (ciasteczko); `null` = automatycznie z urządzenia. */
  chosen: Locale | null;
  /**
   * Język preferowany przez użytkownika niezależnie od tego, czy jest już włączony w aplikacji (wybór ręczny albo pierwszy język z
   * przeglądarki). Zapisujemy go w profilu, żeby po włączeniu nowego języka powiadomienia szły w języku użytkownika.
   */
  preferred: string;
};

/** Język, region i ustawienia wyboru dla bieżącego żądania (ciasteczko → `Accept-Language` → domyślny). */
export async function getLocaleContext(): Promise<LocaleContext> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const regionCookie = cookieStore.get(REGION_COOKIE)?.value;
  const enabled = enabledLocales();
  const resolved = resolveLocale({ cookie, regionCookie, acceptLanguage: headerStore.get("accept-language"), enabled });
  return {
    ...resolved,
    intl: intlLocale(resolved.locale, resolved.region),
    enabled,
    chosen: isLocale(cookie) && enabled.includes(cookie) ? cookie : null,
    preferred: (isLocale(cookie) && enabled.includes(cookie) ? cookie : parseAcceptLanguage(headerStore.get("accept-language"))[0]?.language) ?? resolved.locale,
  };
}

/** Kraj, z którego liczymy numery telefonu bez prefiksu: region użytkownika, a bez niego Polska (`DEFAULT_PHONE_COUNTRY`). */
export async function getPhoneCountry(): Promise<string> {
  return (await getLocaleContext()).region ?? DEFAULT_PHONE_COUNTRY;
}

/** Podpowiedź pod polem telefonu: kraj i prefiks, z którym zapiszemy numer bez prefiksu (region użytkownika). */
export async function getPhoneHint(): Promise<string> {
  const [t, context] = await Promise.all([getTranslations(), getLocaleContext()]);
  const country = context.region ?? DEFAULT_PHONE_COUNTRY;
  const name = new Intl.DisplayNames([context.intl], { type: "region" }).of(country) ?? country;
  return t("clients.clientForm.phone_hint", { country: name, prefix: phonePrefix(country) });
}

/** Formatery dat, godzin i kwot w języku i regionie bieżącego żądania (serwer). */
export async function getFormats(): Promise<Formats> {
  return createFormats((await getLocaleContext()).intl);
}

/** Tłumacz kodowanych komunikatów (`validation.email`, `errors.db.forbidden`...) dla serwera. */
export async function getMessageTranslator(): Promise<Translator> {
  const t = await getTranslations();
  return Object.assign((key: string, values?: Record<string, string | number>) => t(key as never, values as never), {
    has: (key: string) => t.has(key as never),
  });
}
