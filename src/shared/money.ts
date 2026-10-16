/** Kwoty zawsze w najmniejszej jednostce waluty (grosze) jako liczby całkowite. */
export type Money = {
  amountMinor: number;
  currency: string;
};

export const DEFAULT_CURRENCY = "PLN";

export function money(amountMinor: number, currency = DEFAULT_CURRENCY): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError(`amountMinor must be an integer, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Górna granica pojedynczej kwoty: 1 000 000,00 (mieści się w integer w bazie z dużym zapasem). */
export const MAX_AMOUNT_MINOR = 100_000_000;

/**
 * Kwota wpisana przez użytkownika ("800", "800,50", "1 200.5") w groszach.
 * Zwraca null dla niepoprawnego zapisu (litery, więcej niż 2 miejsca po przecinku, kwota ponad limit).
 */
export function parseAmountToMinor(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

export function formatMoney(value: Money, locale = "pl-PL"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
