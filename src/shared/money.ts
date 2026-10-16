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
