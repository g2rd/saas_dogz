/** Daty kalendarzowe jako tekst YYYY-MM-DD (bez strefy), jak kolumny `date` w bazie. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Data YYYY-MM-DD dla podanego momentu w UTC. */
export function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** 2026-10-16 -> 16.10.2026 (pl-PL, domyślnie), 16/10/2026 (en-GB), 10/16/2026 (en-US). Data kalendarzowa, bez przesunięć stref. */
export function formatIsoDate(value: string, locale = "pl-PL"): string {
  if (!isRealIsoDate(value)) return value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

/** Różnica w pełnych dniach: `to` minus `from` (obie YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function addDaysIso(value: string, days: number): string {
  const [y, m, d] = value.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m - 1, d + days)));
}
