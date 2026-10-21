import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, enabledLocales, LOCALES } from "@/shared/i18n/locale";
import { mergeMessages, NAMESPACES } from "./messages";

const ROOT = process.cwd();

/** Języki z kompletnym katalogiem (etap 5: angielski), niezależnie od ustawienia ENABLED_LOCALES. */
const COMPLETE_LOCALES: string[] = ["en"];

/** Wczytuje katalog języka; brakujące pliki przestrzeni (język w trakcie tłumaczenia) pomija. */
function readCatalog(locale: string): Record<string, unknown> {
  const catalog: Record<string, unknown> = {};
  for (const namespace of NAMESPACES) {
    const file = join(ROOT, "messages", locale, `${namespace}.json`);
    if (existsSync(file)) catalog[namespace] = JSON.parse(readFileSync(file, "utf8"));
  }
  return catalog;
}

/** Spłaszcza zagnieżdżony katalog do `{ "errors.db.forbidden": "tekst" }`. */
function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(result, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return result;
}

/** Nazwy parametrów ICU (`{max}`, `{count, plural, ...}`) użyte w tekście, bez parametrów z gałęzi `select` i tagów. */
function placeholders(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/\{\s*(\w+)\s*[,}]/g)) names.add(match[1]);
  return [...names].sort();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const source = flatten(readCatalog(DEFAULT_LOCALE));

describe("katalogi tekstów", () => {
  it("każdy plik katalogu źródłowego jest zarejestrowany w NAMESPACES (i odwrotnie)", () => {
    const files = readdirSync(join(ROOT, "messages", DEFAULT_LOCALE))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort();
    expect(files).toEqual([...NAMESPACES].sort());
  });

  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`język ${locale} nie ma kluczy spoza katalogu źródłowego (${DEFAULT_LOCALE})`, () => {
      const translated = flatten(readCatalog(locale));
      expect(Object.keys(translated).filter((key) => !(key in source))).toEqual([]);
    });

    it(`język ${locale} używa tych samych parametrów co język źródłowy`, () => {
      const translated = flatten(readCatalog(locale));
      for (const [key, text] of Object.entries(translated)) {
        expect(placeholders(text), `parametry klucza ${key}`).toEqual(placeholders(source[key] ?? ""));
      }
    });

    // Język widoczny dla użytkowników (ENABLED_LOCALES) i język uznany za gotowy (COMPLETE_LOCALES) muszą być kompletne;
    // język w trakcie tłumaczenia może mieć podzbiór
    it(`język ${locale} jest kompletny, jeśli jest włączony dla użytkowników albo gotowy`, () => {
      if (!enabledLocales().includes(locale) && !COMPLETE_LOCALES.includes(locale)) return;
      const translated = flatten(readCatalog(locale));
      expect(Object.keys(source).filter((key) => !(key in translated))).toEqual([]);
    });
  }

  it("żaden tekst nie jest pusty (poza celowo pustymi gałęziami select)", () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(flatten(readCatalog(locale)))) {
        expect(text.trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("każdy klucz użyty w kodzie (msg, t, tr, t.rich) istnieje w katalogu źródłowym", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\b(?:msg|t|tr|t\.rich|tr\.rich)\(\s*"([a-z][A-Za-z0-9_.]*)"/g)) {
        if (!(match[1] in source)) missing.push(`${relative(ROOT, file)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("klucze etykiet (labels.<mapa>.<wartość>) pokrywają wszystkie wartości map w kodzie", () => {
    // mapy etykiet mają ten sam zestaw wartości co typy w warstwie domain; test chroni przed usunięciem wpisu
    for (const prefix of ["labels.clientStatus.", "labels.paymentMethod.", "labels.sessionStatus.", "labels.chargeStatus."]) {
      expect(Object.keys(source).some((key) => key.startsWith(prefix)), prefix).toBe(true);
    }
  });
});

describe("mergeMessages", () => {
  it("uzupełnia brakujące klucze językiem źródłowym i nie psuje istniejących", () => {
    const merged = mergeMessages({ a: { x: "pl-x", y: "pl-y" }, b: "pl-b" }, { a: { x: "en-x" } });
    expect(merged).toEqual({ a: { x: "en-x", y: "pl-y" }, b: "pl-b" });
  });
});
