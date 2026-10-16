export type ChargeStatus = "void" | "unpaid" | "partial" | "paid" | "overdue";

export type ChargeSnapshot = {
  amountMinor: number;
  /** Suma alokacji wpłat na tę należność, w groszach. */
  allocatedMinor: number;
  dueDate: Date | null;
  voided: boolean;
};

export function chargeRemaining(charge: ChargeSnapshot): number {
  return Math.max(charge.amountMinor - charge.allocatedMinor, 0);
}

/** Status wyliczany z salda, nigdy nie przechowywany. */
export function chargeStatus(charge: ChargeSnapshot, now: Date): ChargeStatus {
  if (charge.voided) return "void";
  if (charge.allocatedMinor >= charge.amountMinor) return "paid";
  if (charge.dueDate && charge.dueDate.getTime() < now.getTime()) return "overdue";
  return charge.allocatedMinor > 0 ? "partial" : "unpaid";
}
