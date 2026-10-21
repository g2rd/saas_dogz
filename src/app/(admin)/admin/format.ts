import type { ActivityLevel, OrgStatus } from "@/modules/platform";

const DAY_MS = 86_400_000;

/** „dziś”, „wczoraj”, „5 dni temu” albo „nigdy” — krótki zapis ostatniej aktywności. */
export function relativeDays(at: Date | null, now: Date): string {
  if (!at) return "nigdy";
  const days = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  return `${days} dni temu`;
}

export const formatDate = (at: Date | null) =>
  at ? at.toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—";

export const formatDateTime = (at: Date) =>
  at.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });

export const STATUS_TONES: Record<OrgStatus, "neutral" | "success" | "warning" | "danger"> = {
  trial: "neutral",
  active: "success",
  read_only: "warning",
  suspended: "danger",
  archived: "danger",
};

export const ACTIVITY_TONES: Record<ActivityLevel, "neutral" | "success" | "warning" | "danger"> = {
  active: "success",
  quiet: "warning",
  inactive: "danger",
  never: "neutral",
};

/** Dni do końca dostępu (ujemne = po terminie); `null`, gdy bez terminu. */
export function daysUntil(at: Date | null, now: Date): number | null {
  return at ? Math.ceil((at.getTime() - now.getTime()) / DAY_MS) : null;
}
