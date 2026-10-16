export type LedgerReason =
  | "purchase"
  | "session"
  | "late_cancel"
  | "adjustment"
  | "refund"
  | "expiry";

export type LedgerEntry = {
  delta: number;
  reason: LedgerReason;
};

export type PackageStatus = "active" | "depleted" | "expired" | "canceled";

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  active: "Aktywny",
  depleted: "Wykorzystany",
  expired: "Wygasł",
  canceled: "Anulowany",
};

export const LEDGER_REASON_LABELS: Record<LedgerReason, string> = {
  purchase: "Zakup pakietu",
  session: "Zajęcia",
  late_cancel: "Późne odwołanie",
  adjustment: "Korekta",
  refund: "Zwrot",
  expiry: "Wygaśnięcie",
};

/** Saldo pakietu to suma wpisów dziennika (zakup dodaje, zużycia odejmują). */
export function packageBalance(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.delta, 0);
}

/**
 * Status pakietu. `validUntil` i `today` to daty YYYY-MM-DD; pakiet jest ważny
 * przez cały dzień `validUntil`. Wygaśnięcie wygrywa z wyczerpaniem, a anulowanie ze wszystkim.
 */
export function packageStatus(
  pkg: { balance: number; validUntil: string | null; canceledAt: Date | null },
  today: string,
): PackageStatus {
  if (pkg.canceledAt) return "canceled";
  if (pkg.validUntil && pkg.validUntil < today) return "expired";
  if (pkg.balance <= 0) return "depleted";
  return "active";
}

/** Wpis dziennika odejmujący jedną jednostkę z pakietu. */
export function consumeEntry(reason: "session" | "late_cancel"): LedgerEntry {
  return { delta: -1, reason };
}

export const LOW_BALANCE_THRESHOLD = 2;

export function isLowBalance(balance: number, threshold = LOW_BALANCE_THRESHOLD): boolean {
  return balance > 0 && balance <= threshold;
}
