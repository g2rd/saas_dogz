import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDaysIso, isRealIsoDate } from "./dates";

export const DEFAULT_TIMEZONE = "Europe/Warsaw";

/** Data kalendarzowa (YYYY-MM-DD) dla momentu w podanej strefie. */
export function dateInZone(at: Date, timeZone: string): string {
  return formatInTimeZone(at, timeZone, "yyyy-MM-dd");
}

/** Godzina HH:mm dla momentu w podanej strefie. */
export function timeInZone(at: Date, timeZone: string): string {
  return formatInTimeZone(at, timeZone, "HH:mm");
}

/** Początek doby (00:00 w strefie) jako moment UTC. */
export function startOfDayUtc(date: string, timeZone: string): Date {
  return fromZonedTime(`${date}T00:00:00`, timeZone);
}

/** Zakres doby [początek, początek następnej) jako momenty UTC. */
export function dayRange(date: string, timeZone: string): { from: Date; to: Date } {
  return { from: startOfDayUtc(date, timeZone), to: startOfDayUtc(addDaysIso(date, 1), timeZone) };
}

/** „wtorek, 16 października” dla daty YYYY-MM-DD (bez przesunięć stref, bo to data kalendarzowa). */
export function formatDateHeading(date: string, locale = "pl-PL"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Jak `formatDateHeading`, z wielką pierwszą literą („Piątek, 16 października”). */
export function formatDateHeadingTitle(date: string, locale = "pl-PL"): string {
  const heading = formatDateHeading(date, locale);
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

/** Data i godzina wpisane w strefie organizacji (np. "2026-10-20", "17:30") jako moment UTC. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!isRealIsoDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const result = fromZonedTime(`${date}T${time}:00`, timeZone);
  return Number.isNaN(result.getTime()) ? null : result;
}
