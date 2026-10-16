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

export type PackageStatus = "active" | "depleted" | "expired";

/** Saldo pakietu to suma wpisów dziennika (zakup dodaje, zużycia odejmują). */
export function packageBalance(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.delta, 0);
}

export function packageStatus(
  balance: number,
  validUntil: Date | null,
  now: Date,
): PackageStatus {
  if (validUntil && validUntil.getTime() < now.getTime()) return "expired";
  if (balance <= 0) return "depleted";
  return "active";
}

/** Wpis dziennika odejmujący jedną jednostkę z pakietu. */
export function consumeEntry(reason: "session" | "late_cancel"): LedgerEntry {
  return { delta: -1, reason };
}

export function isLowBalance(balance: number, threshold = 2): boolean {
  return balance > 0 && balance <= threshold;
}
