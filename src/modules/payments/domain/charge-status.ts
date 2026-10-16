export type ChargeStatus = "void" | "unpaid" | "partial" | "paid" | "overdue";

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  void: "Anulowana",
  unpaid: "Do zapłaty",
  partial: "Częściowo opłacona",
  paid: "Opłacona",
  overdue: "Po terminie",
};

export type ChargeSnapshot = {
  amountMinor: number;
  /** Suma alokacji wpłat na tę należność, w groszach. */
  allocatedMinor: number;
  /** Termin płatności jako data YYYY-MM-DD. */
  dueDate: string | null;
  voided: boolean;
};

export function chargeRemaining(charge: ChargeSnapshot): number {
  return Math.max(charge.amountMinor - charge.allocatedMinor, 0);
}

/**
 * Status wyliczany z salda, nigdy nie przechowywany. Należność jest po terminie
 * od dnia następnego po terminie płatności (`today` to data YYYY-MM-DD).
 */
export function chargeStatus(charge: ChargeSnapshot, today: string): ChargeStatus {
  if (charge.voided) return "void";
  if (charge.allocatedMinor >= charge.amountMinor) return "paid";
  if (charge.dueDate && charge.dueDate < today) return "overdue";
  return charge.allocatedMinor > 0 ? "partial" : "unpaid";
}
