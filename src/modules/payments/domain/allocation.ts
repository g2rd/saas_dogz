export type OpenCharge = {
  id: string;
  /** Ile jeszcze zostało do zapłaty, w groszach. */
  remainingMinor: number;
  /** Termin płatności YYYY-MM-DD. */
  dueDate: string;
  createdAt: string;
};

export type Allocation = { chargeId: string; amountMinor: number };

export type AllocationPlan = {
  allocations: Allocation[];
  /** Część wpłaty, która nie pokryła żadnej należności (nadpłata, zostaje na koncie klienta). */
  unallocatedMinor: number;
};

/**
 * Dzieli wpłatę na otwarte należności: najpierw najstarszy termin, przy remisie wcześniej utworzona.
 * Bazę pilnuje niezmienników (kwoty, klient, równoległość); tu zapada decyzja o podziale.
 */
export function allocatePayment(amountMinor: number, charges: readonly OpenCharge[]): AllocationPlan {
  const ordered = [...charges]
    .filter((c) => c.remainingMinor > 0)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );

  const allocations: Allocation[] = [];
  let left = amountMinor;
  for (const charge of ordered) {
    if (left <= 0) break;
    const amount = Math.min(left, charge.remainingMinor);
    allocations.push({ chargeId: charge.id, amountMinor: amount });
    left -= amount;
  }
  return { allocations, unallocatedMinor: left };
}

/** Alokacja na jedną wskazaną należność (nie więcej niż jej pozostało). */
export function allocateToCharge(amountMinor: number, charge: OpenCharge): AllocationPlan {
  const amount = Math.min(amountMinor, Math.max(charge.remainingMinor, 0));
  return {
    allocations: amount > 0 ? [{ chargeId: charge.id, amountMinor: amount }] : [],
    unallocatedMinor: amountMinor - amount,
  };
}
