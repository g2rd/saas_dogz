import { dogAgeMessage } from "../domain/dog";

/** Wiek psa w języku użytkownika (`t` z next-intl); `null`, gdy nie znamy daty urodzenia. */
export function dogAgeText(
  t: (key: string, values?: Record<string, number>) => string,
  birthDate: string | null,
  now: Date,
): string | null {
  const age = dogAgeMessage(birthDate, now);
  return age ? t(age.key, age.params as Record<string, number>) : null;
}
