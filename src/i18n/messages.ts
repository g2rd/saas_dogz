import { DEFAULT_LOCALE, type Locale } from "@/shared/i18n/locale";

/**
 * Przestrzenie nazw katalogów: `messages/<język>/<przestrzeń>.json`. Każdy język może mieć podzbiór (brakujące pliki uzupełnia polski).
 * Uwaga: Vite rozwija dynamiczny `import()` w czasie transformacji i buforuje wynik, więc po dodaniu plików nowego języka
 * zmień ten plik (albo wyczyść `node_modules/.vite`), inaczej testy nie zobaczą nowych katalogów.
 */
export const NAMESPACES = [
  "common",
  "errors",
  "validation",
  "shared",
  "auth",
  "marketing",
  "trainer",
  "portal",
  "clients",
  "dogs",
  "packages",
  "payments",
  "scheduling",
  "notifications",
  "notify",
  "report",
  "legal",
  "invitations",
  "labels",
  "feedback",
] as const;

export type Messages = Record<string, unknown>;

async function loadCatalog(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      try {
        const loaded = (await import(`../../messages/${locale}/${namespace}.json`)) as { default: unknown };
        return [namespace, loaded.default] as const;
      } catch {
        // Język w trakcie tłumaczenia może nie mieć jeszcze pliku tej przestrzeni: wtedy działa polski (łańcuch zapasowy)
        return [namespace, {}] as const;
      }
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
