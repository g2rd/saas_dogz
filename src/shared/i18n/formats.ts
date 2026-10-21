import { formatIsoDate } from "../dates";
import type { Money } from "../money";
import { formatDateHeading } from "../time";

/**
 * Formatowanie dat, godzin i kwot zależne od języka (`Intl`). Funkcje czyste: język podajemy jawnie (np. `pl`, `en-GB`).
 * Zastępują sztywne `pl-PL` rozsiane po kodzie; w komponentach używaj `getFormats()` (serwer) albo `useFormats()` (klient).
 */

/** Data kalendarzowa YYYY-MM-DD w zapisie lokalnym (pl: 16.10.2026, en-GB: 16/10/2026, en-US: 10/16/2026). */
export function formatCalendarDate(isoDate: string, locale: string): string {
  return formatIsoDate(isoDate, locale);
}

/** Moment jako data (w strefie szkoły, gdy podana; inaczej w strefie środowiska). */
export function formatDate(at: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).format(at);
}

/** Moment jako data i godzina. */
export function formatDateTime(at: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(at);
}

/** Nagłówek dnia dla daty YYYY-MM-DD: „wtorek, 16 października” / „Tuesday, October 16”. */
export function formatDayHeading(isoDate: string, locale: string): string {
  return formatDateHeading(isoDate, locale);
}

/** Kwota z walutą wg języka (pl: 1 200,50 zł, en-GB: £1,200.50). */
export function formatCurrency(value: Money, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(value.amountMinor / 100);
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Lista „A, B i C” / “A, B, and C” wg języka. */
export function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

/** Formatery związane z jednym językiem; zwraca `getFormats()` i `useFormats()`. */
export function createFormats(locale: string) {
  return {
    locale,
    calendarDate: (isoDate: string) => formatCalendarDate(isoDate, locale),
    date: (at: Date, timeZone?: string) => formatDate(at, locale, timeZone),
    dateTime: (at: Date, timeZone?: string) => formatDateTime(at, locale, timeZone),
    dayHeading: (isoDate: string) => formatDayHeading(isoDate, locale),
    money: (value: Money) => formatCurrency(value, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    list: (items: string[]) => formatList(items, locale),
  };
}

export type Formats = ReturnType<typeof createFormats>;
