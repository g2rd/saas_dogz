/**
 * Pseudo-lokalizacja do sprawdzania układu: każdy tekst z katalogu jest wydłużany (samogłoski podwojone z akcentem, ok. +35%) i ujęty w nawiasy
 * kwadratowe. Długie tłumaczenia (niemiecki, fiński) nie powinny przepełniać przycisków, kafelków ani menu, a tekst bez nawiasów na ekranie
 * oznacza napis wpisany na stałe w kodzie. Składnia ICU (`{name}`, `{n, plural, one {…} other {…}}`) i tagi `<b>…</b>` zostają bez zmian.
 *
 * Włącza ją wyłącznie zmienna `ENABLE_PSEUDO_LOCALE=1` (testy E2E, podgląd lokalny) razem z ciasteczkiem `dt_pseudo=1`; na produkcji zmiennej nie ustawiamy.
 */
export const PSEUDO_COOKIE = "dt_pseudo";

export function pseudoLocaleEnabled(): boolean {
  return process.env.ENABLE_PSEUDO_LOCALE === "1";
}

const DOUBLED: Record<string, string> = { a: "åå", e: "éé", i: "íí", o: "óó", u: "úú", y: "ýý", A: "ÅÅ", E: "ÉÉ", I: "ÍÍ", O: "ÓÓ", U: "ÚÚ", Y: "ÝÝ" };

const literal = (text: string) => text.replace(/[aeiouyAEIOUY]/g, (char) => DOUBLED[char]);

/** Pseudo-lokalizuje jeden komunikat ICU (tylko tekst, nie składnię). */
export function pseudoLocalize(source: string): string {
  let i = 0;

  function text(inBranch: boolean): string {
    let out = "";
    let buffer = "";
    const flush = () => {
      out += literal(buffer);
      buffer = "";
    };
    while (i < source.length) {
      const char = source[i];
      if (char === "}" && inBranch) break;
      if (char === "{") {
        flush();
        out += argument();
        continue;
      }
      if (char === "<") {
        const end = source.indexOf(">", i);
        if (end > i) {
          flush();
          out += source.slice(i, end + 1);
          i = end + 1;
          continue;
        }
      }
      buffer += char;
      i += 1;
    }
    flush();
    return out;
  }

  /** Argument ICU od `{`: prosty (`{name}`) kopiujemy, a w złożonym (`plural`, `select`) przetwarzamy teksty gałęzi. */
  function argument(): string {
    i += 1;
    let head = "";
    while (i < source.length && source[i] !== "," && source[i] !== "}") head += source[i++];
    if (source[i] !== ",") {
      i += 1;
      return `{${head}}`;
    }
    let out = `{${head},`;
    i += 1;
    while (i < source.length && source[i] !== "," && source[i] !== "}") out += source[i++];
    if (source[i] !== ",") {
      i += 1;
      return `${out}}`;
    }
    out += ",";
    i += 1;
    while (i < source.length && source[i] !== "}") {
      if (source[i] === "{") {
        i += 1;
        out += `{${text(true)}`;
        out += source[i] ?? "";
        i += 1;
      } else {
        out += source[i++];
      }
    }
    out += source[i] ?? "";
    i += 1;
    return out;
  }

  return `[${text(false)}]`;
}

/** Pseudo-lokalizuje cały katalog komunikatów (obiekty, tablice i teksty). */
export function pseudoLocalizeMessages<T>(value: T): T {
  if (typeof value === "string") return pseudoLocalize(value) as T;
  if (Array.isArray(value)) return value.map((item) => pseudoLocalizeMessages(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, pseudoLocalizeMessages(child)])) as T;
  }
  return value;
}
