/**
 * Kodowane komunikaty: warstwy czyste (`domain`, `application`) nie znają języka, więc zamiast gotowego zdania zwracają napis
 * `klucz|{"parametr":wartość}`. Granica UI (formularze, strony) tłumaczy taki napis w języku użytkownika, a zwykły tekst
 * (jeszcze niezmigrowany) wyświetla bez zmian. Dzięki temu migrację można robić miejsce po miejscu.
 */
export type MessageParams = Record<string, string | number>;

/** Klucz komunikatu: małe litery, cyfry i podkreślenia rozdzielone kropkami, co najmniej dwa człony (`validation.email`). */
const KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

export function msg(key: string, params?: MessageParams): string {
  return params && Object.keys(params).length > 0 ? `${key}|${JSON.stringify(params)}` : key;
}

export type ParsedMessage = { key: string; params: MessageParams };

/** Rozpoznaje kodowany komunikat; `null` dla zwykłego tekstu. */
export function parseMessage(text: string): ParsedMessage | null {
  const separator = text.indexOf("|");
  const key = separator === -1 ? text : text.slice(0, separator);
  if (!KEY_PATTERN.test(key)) return null;
  if (separator === -1) return { key, params: {} };
  try {
    const params: unknown = JSON.parse(text.slice(separator + 1));
    if (params && typeof params === "object" && !Array.isArray(params)) return { key, params: params as MessageParams };
  } catch {
    // niepoprawne parametry: traktujemy jak zwykły tekst
  }
  return null;
}

/** Minimalny interfejs tłumacza (zgodny z `useTranslations()` i `getTranslations()` z next-intl). */
export type Translator = {
  (key: string, values?: MessageParams): string;
  has(key: string): boolean;
};

/**
 * Tłumaczy kodowany komunikat; zwykły tekst oraz klucz bez wpisu w katalogu zwracane są bez zmian
 * (klucz bez tłumaczenia nie powinien trafiać do użytkownika, ale lepszy on niż wyjątek).
 */
export function translateMessage(t: Translator, text: string): string {
  const parsed = parseMessage(text);
  if (!parsed || !t.has(parsed.key)) return text;
  return t(parsed.key, parsed.params);
}
