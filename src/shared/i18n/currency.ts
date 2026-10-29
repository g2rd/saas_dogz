import { DEFAULT_CURRENCY } from "../money";

/** Waluta wg regionu (kraju) z ustawień przeglądarki lub telefonu. */
const REGION_CURRENCY: Record<string, string> = {
  PL: "PLN",
  GB: "GBP",
  US: "USD",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  IE: "EUR",
  DE: "EUR",
  AT: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  PT: "EUR",
  FI: "EUR",
  GR: "EUR",
  SK: "EUR",
  SI: "EUR",
  LT: "EUR",
  LV: "EUR",
  EE: "EUR",
  CZ: "CZK",
  SE: "SEK",
  DK: "DKK",
  NO: "NOK",
  HU: "HUF",
  RO: "RON",
  CH: "CHF",
  UA: "UAH",
};

/** Waluta wg samego języka, gdy region jest nieznany. */
const LANGUAGE_CURRENCY: Record<string, string> = {
  pl: "PLN",
  en: "USD",
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  nl: "EUR",
  pt: "EUR",
  cs: "CZK",
  sv: "SEK",
  da: "DKK",
  nb: "NOK",
  no: "NOK",
  hu: "HUF",
  ro: "RON",
};

/**
 * Waluta domyślna dla nowej szkoły z języka i regionu systemowego lub przeglądarkowego: najpierw region, potem język,
 * w ostateczności `DEFAULT_CURRENCY`. To tylko wartość startowa; szkoła ma jedną walutę zapisaną w ustawieniach.
 */
export function currencyFor(language: string, region?: string | null): string {
  if (region && REGION_CURRENCY[region.toUpperCase()]) return REGION_CURRENCY[region.toUpperCase()];
  return LANGUAGE_CURRENCY[language.toLowerCase()] ?? DEFAULT_CURRENCY;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Kod waluty ISO 4217 rozpoznawany przez `Intl` (odrzuca śmieci z formularza). */
export function isSupportedCurrency(code: string): boolean {
  if (!CURRENCY_PATTERN.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/** Strefa czasowa IANA rozpoznawana przez `Intl` (np. `Europe/London`). */
export function isSupportedTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Waluty oferowane w ustawieniach szkoły: te, które wykrywamy z regionu urządzenia (w kolejności kodów). */
export const SELECTABLE_CURRENCIES: readonly string[] = [...new Set(Object.values(REGION_CURRENCY))].sort();
