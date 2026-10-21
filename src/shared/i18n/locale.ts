/** Obsługiwane języki interfejsu (kod ISO 639-1). Źródłowy jest polski; kolejne języki dodaje się wg procedury z docs/WDROZENIE-WIELOJEZYCZNOSCI.md. */
export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

/** Ciasteczko z językiem wybranym w ustawieniach (`Więcej`). Bez niego język bierzemy z przeglądarki lub telefonu. */
export const LOCALE_COOKIE = "dt_locale";

/** Nazwy języków w nich samych (do przełącznika). */
export const LOCALE_LABELS: Record<Locale, string> = {
  pl: "Polski",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Języki widoczne dla użytkowników (zmienna `ENABLED_LOCALES`, np. `pl,en`). Domyślnie tylko polski, więc język w budowie nie jest
 * nikomu pokazywany, dopóki katalog nie jest gotowy. Domyślny język jest zawsze włączony.
 */
export function enabledLocales(raw: string | undefined = process.env.ENABLED_LOCALES): Locale[] {
  const requested = (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isLocale);
  return [...new Set<Locale>([DEFAULT_LOCALE, ...requested])];
}

export type LanguageTag = { tag: string; language: string; region: string | null; quality: number };

/** Rozbiera nagłówek `Accept-Language` ("pl-PL,pl;q=0.9,en-US;q=0.8") na tagi posortowane malejąco wg jakości. */
export function parseAcceptLanguage(header: string | null | undefined): LanguageTag[] {
  if (!header) return [];
  const tags: LanguageTag[] = [];
  header.split(",").forEach((part, index) => {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag.trim();
    if (!tag || tag === "*") return;
    const match = /^([A-Za-z]{2,3})(?:-[A-Za-z]{4})?(?:-([A-Za-z]{2}|\d{3}))?/.exec(tag);
    if (!match) return;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const quality = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(quality) || quality <= 0) return;
    tags.push({
      tag,
      language: match[1].toLowerCase(),
      region: match[2] && /^[A-Za-z]{2}$/.test(match[2]) ? match[2].toUpperCase() : null,
      quality: quality - index * 1e-6, // stabilne sortowanie: wcześniejszy tag wygrywa przy równej jakości
    });
  });
  return tags.sort((a, b) => b.quality - a.quality);
}

export type ResolvedLocale = {
  locale: Locale;
  /** Region z preferencji przeglądarki (np. `GB`), do wyboru waluty; `null`, gdy go brak. */
  region: string | null;
  source: "cookie" | "browser" | "default";
};

/**
 * Wybór języka: ciasteczko (wybór użytkownika) → `Accept-Language` (telefon lub przeglądarka) → domyślny.
 * Bierze pod uwagę tylko języki włączone (`enabled`).
 */
export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  enabled?: readonly Locale[];
}): ResolvedLocale {
  const enabled = input.enabled ?? enabledLocales();
  const tags = parseAcceptLanguage(input.acceptLanguage);
  const region = tags.find((t) => t.region)?.region ?? null;

  if (isLocale(input.cookie) && enabled.includes(input.cookie)) {
    return { locale: input.cookie, region, source: "cookie" };
  }
  for (const tag of tags) {
    if (isLocale(tag.language) && enabled.includes(tag.language)) {
      return { locale: tag.language, region: tag.region ?? region, source: "browser" };
    }
  }
  return { locale: DEFAULT_LOCALE, region, source: "default" };
}

/** Znacznik BCP 47 do formatowania (`Intl`): język z regionem, gdy znamy region (np. `en-GB`). */
export function intlLocale(locale: Locale, region?: string | null): string {
  return region ? `${locale}-${region}` : locale;
}
