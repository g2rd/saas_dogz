import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Kraj, z którego liczymy numery krajowe (bez prefiksu), gdy region użytkownika jest nieznany. */
export const DEFAULT_PHONE_COUNTRY = "PL";

function country(value: string | null | undefined): CountryCode {
  return (/^[A-Za-z]{2}$/.test(value ?? "") ? (value as string).toUpperCase() : DEFAULT_PHONE_COUNTRY) as CountryCode;
}

/**
 * Numer telefonu w formacie międzynarodowym (E.164, np. `+48600100200`). Numer bez prefiksu kraju traktujemy jako numer z kraju `defaultCountry`
 * (region użytkownika); numer z `+` lub `00` zachowuje własny kraj. Pusty tekst daje `null`; numer, którego nie da się rozpoznać, zostaje bez zmian
 * (odrzuca go `isValidPhone`).
 */
export function normalizePhone(raw: string, defaultCountry?: string | null): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = parsePhoneNumberFromString(trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed, country(defaultCountry));
  return parsed?.isPossible() ? parsed.number : trimmed;
}

/** Czy tekst jest numerem w formacie międzynarodowym o możliwej długości dla swojego kraju (wynik `normalizePhone`). */
export function isValidPhone(phone: string): boolean {
  return phone.startsWith("+") && (parsePhoneNumberFromString(phone)?.isPossible() ?? false);
}

/** Prefiks kraju do podpowiedzi w formularzu (np. `+44` dla `GB`). */
export function phonePrefix(defaultCountry?: string | null): string {
  return `+${getCountryCallingCode(country(defaultCountry))}`;
}
