import { describe, expect, it } from "vitest";
import { enabledLocales, intlLocale, parseAcceptLanguage, resolveLocale } from "./locale";

describe("enabledLocales", () => {
  it("domyślnie tylko polski, a domyślny język jest zawsze włączony", () => {
    expect(enabledLocales(undefined)).toEqual(["pl"]);
    expect(enabledLocales("")).toEqual(["pl"]);
    expect(enabledLocales("en")).toEqual(["pl", "en"]);
    expect(enabledLocales(" EN , pl , xx ")).toEqual(["pl", "en"]);
  });
});

describe("parseAcceptLanguage", () => {
  it("sortuje wg jakości i rozdziela język od regionu", () => {
    const tags = parseAcceptLanguage("pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7");
    expect(tags.map((t) => t.tag)).toEqual(["pl-PL", "pl", "en-US", "en"]);
    expect(tags[0]).toMatchObject({ language: "pl", region: "PL" });
    expect(tags[2]).toMatchObject({ language: "en", region: "US" });
  });

  it("zachowuje kolejność przy równej jakości i pomija symbol wieloznaczny oraz jakość 0", () => {
    expect(parseAcceptLanguage("de, en;q=0.9, *;q=0.5, fr;q=0").map((t) => t.language)).toEqual(["de", "en"]);
  });

  it("radzi sobie z pustym i niepoprawnym nagłówkiem", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage("%%%")).toEqual([]);
  });

  it("rozpoznaje tagi ze skryptem (zh-Hant-TW) i regiony numeryczne", () => {
    expect(parseAcceptLanguage("zh-Hant-TW")[0]).toMatchObject({ language: "zh", region: "TW" });
    expect(parseAcceptLanguage("es-419")[0]).toMatchObject({ language: "es", region: null });
  });
});

describe("resolveLocale", () => {
  const both = ["pl", "en"] as const;

  it("ciasteczko (wybór użytkownika) ma pierwszeństwo przed przeglądarką", () => {
    expect(resolveLocale({ cookie: "en", acceptLanguage: "pl-PL", enabled: both })).toMatchObject({
      locale: "en",
      source: "cookie",
      region: "PL",
    });
  });

  it("bez ciasteczka bierze język przeglądarki i jej region", () => {
    expect(resolveLocale({ acceptLanguage: "en-GB,en;q=0.9,pl;q=0.5", enabled: both })).toEqual({
      locale: "en",
      region: "GB",
      source: "browser",
    });
  });

  it("wybiera pierwszy obsługiwany język z listy preferencji", () => {
    expect(resolveLocale({ acceptLanguage: "de-DE,de;q=0.9,en;q=0.8", enabled: both })).toMatchObject({
      locale: "en",
      source: "browser",
    });
  });

  it("ignoruje język niewłączony (nieukończony katalog) i wraca do domyślnego", () => {
    expect(resolveLocale({ cookie: "en", acceptLanguage: "en-US", enabled: ["pl"] })).toMatchObject({
      locale: "pl",
      source: "default",
      region: "US",
    });
  });

  it("ignoruje śmieciowe ciasteczko", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "pl-PL", enabled: both })).toMatchObject({
      locale: "pl",
      source: "browser",
    });
  });

  it("bez żadnych wskazówek zwraca polski", () => {
    expect(resolveLocale({ enabled: both })).toEqual({ locale: "pl", region: null, source: "default" });
  });
});

describe("intlLocale", () => {
  it("łączy język z regionem", () => {
    expect(intlLocale("en", "GB")).toBe("en-GB");
    expect(intlLocale("pl")).toBe("pl");
  });
});
