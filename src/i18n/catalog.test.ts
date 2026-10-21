import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/shared/i18n/locale";
import { mergeMessages, NAMESPACES } from "./messages";

const ROOT = process.cwd();

function readCatalog(locale: string): Record<string, unknown> {
  const catalog: Record<string, unknown> = {};
  for (const namespace of NAMESPACES) {
    catalog[namespace] = JSON.parse(readFileSync(join(ROOT, "messages", locale, `${namespace}.json`), "utf8"));
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

/** Nazwy parametrów ICU (`{max}`, `{count, plural, ...}`) użyte w tekście. */
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
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`język ${locale} ma dokładnie te same klucze co język źródłowy (${DEFAULT_LOCALE})`, () => {
      const translated = flatten(readCatalog(locale));
      expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort());
    });

    it(`język ${locale} używa tych samych parametrów co język źródłowy`, () => {
      const translated = flatten(readCatalog(locale));
      for (const [key, text] of Object.entries(source)) {
        expect(placeholders(translated[key] ?? ""), `parametry klucza ${key}`).toEqual(placeholders(text));
      }
    });
  }

  it("żaden tekst nie jest pusty", () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(flatten(readCatalog(locale)))) {
        expect(text.trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("każdy klucz użyty w kodzie przez msg(...) istnieje w katalogu źródłowym", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\bmsg\(\s*"([a-z][a-z0-9_.]*)"/g)) {
        if (!(match[1] in source)) missing.push(`${relative(ROOT, file)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("mergeMessages", () => {
  it("uzupełnia brakujące klucze językiem źródłowym i nie psuje istniejących", () => {
    const merged = mergeMessages({ a: { x: "pl-x", y: "pl-y" }, b: "pl-b" }, { a: { x: "en-x" } });
    expect(merged).toEqual({ a: { x: "en-x", y: "pl-y" }, b: "pl-b" });
  });
});
