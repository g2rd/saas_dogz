export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Zegar sterowany ręcznie, do testów. */
export function fixedClock(at: Date | string): Clock {
  const fixed = new Date(at);
  return { now: () => new Date(fixed) };
}
