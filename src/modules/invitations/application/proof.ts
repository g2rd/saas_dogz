import { invitationHashSecret } from "@/shared/env";
import { hashSecret, normalizeSecret } from "../domain/secrets";

/**
 * Dowód zaproszenia do rejestracji przy zamkniętym naborze: skrót tokenu lub kodu (ten sam, który jest w bazie).
 * Znają go tylko osoby z linkiem lub kodem, więc nie da się go odgadnąć; baza sprawdza, czy zaproszenie jest ważne.
 */
export function invitationProofHash(rawSecret: string): string | null {
  const secret = normalizeSecret(rawSecret);
  return secret ? hashSecret(secret, invitationHashSecret()) : null;
}
