export type CancellationPolicy = {
  /** Ile godzin przed zajęciami odwołanie jest jeszcze „bez konsekwencji”. */
  lateCancelHours: number;
  /** Czy późne odwołanie zabiera zajęcie z pakietu. */
  lateCancelConsumesSession: boolean;
};

export function isLateCancellation(startsAt: Date, now: Date, lateCancelHours: number): boolean {
  return startsAt.getTime() - now.getTime() < lateCancelHours * 3_600_000;
}

/** Domyślna decyzja, czy odwołanie zużywa zajęcie z pakietu (trener może ją zmienić). */
export function shouldConsumeOnCancel(startsAt: Date, now: Date, policy: CancellationPolicy): boolean {
  return policy.lateCancelConsumesSession && isLateCancellation(startsAt, now, policy.lateCancelHours);
}
