import { describe, expect, it } from "vitest";
import { currencyFor, isSupportedCurrency, isSupportedTimeZone } from "./currency";

describe("currencyFor", () => {
  it("najpierw region, potem język, w ostateczności złoty", () => {
    expect(currencyFor("pl", "PL")).toBe("PLN");
    expect(currencyFor("en", "GB")).toBe("GBP");
    expect(currencyFor("en", "US")).toBe("USD");
    expect(currencyFor("en", "AU")).toBe("AUD");
    expect(currencyFor("de", "DE")).toBe("EUR");
    expect(currencyFor("de", "CH")).toBe("CHF");
    expect(currencyFor("en", "DE")).toBe("EUR"); // region wygrywa z językiem
  });

  it("bez regionu używa języka", () => {
    expect(currencyFor("en")).toBe("USD");
    expect(currencyFor("pl", null)).toBe("PLN");
    expect(currencyFor("cs")).toBe("CZK");
  });

  it("dla nieznanego języka i regionu zwraca domyślną walutę", () => {
    expect(currencyFor("xx", "ZZ")).toBe("PLN");
    expect(currencyFor("xx")).toBe("PLN");
  });

  it("nie zależy od wielkości liter", () => {
    expect(currencyFor("EN", "gb")).toBe("GBP");
  });
});

describe("walidacja", () => {
  it("rozpoznaje waluty i strefy znane Intl", () => {
    expect(isSupportedCurrency("PLN")).toBe(true);
    expect(isSupportedCurrency("GBP")).toBe(true);
    expect(isSupportedCurrency("pln")).toBe(false);
    expect(isSupportedCurrency("ZZZZ")).toBe(false);
    expect(isSupportedCurrency("<script>")).toBe(false);
    expect(isSupportedTimeZone("Europe/Warsaw")).toBe(true);
    expect(isSupportedTimeZone("America/New_York")).toBe(true);
    expect(isSupportedTimeZone("Mars/Olympus")).toBe(false);
  });
});
