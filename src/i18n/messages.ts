import { DEFAULT_LOCALE, type Locale } from "@/shared/i18n/locale";

/** Przestrzenie nazw katalogów: `messages/<język>/<przestrzeń>.json`. Rosną wraz z migracją modułów (etap 3). */
export const NAMESPACES = ["common", "errors", "validation"] as const;

export type Messages = Record<string, unknown>;

async function loadCatalog(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const loaded = (await import(`../../messages/${locale}/${namespace}.json`)) as { default: unknown };
      return [namespace, loaded.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Głębokie scalenie: wartości z `override` nadpisują `base`, brakujące klucze zostają z `base`. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeMessages(base[key], value) : value;
  }
  return result;
}

/**
 * Katalog dla języka. Brakujące klucze uzupełnia język źródłowy (polski), więc częściowo przetłumaczony język nie psuje widoku;
 * test parzystości pilnuje kompletności języków włączonych dla użytkowników.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const source = await loadCatalog(DEFAULT_LOCALE);
  if (locale === DEFAULT_LOCALE) return source;
  return mergeMessages(source, await loadCatalog(locale));
}
