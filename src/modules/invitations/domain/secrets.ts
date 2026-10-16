import { createHmac, randomBytes } from "node:crypto";

export const INVITATION_TTL_DAYS = 7;

/** 31 znaków bez mylących (0/O, 1/I/L); 10 znaków daje około 50 bitów entropii. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 10;

type RandomBytes = (size: number) => Buffer;

/** Długi, losowy token do linku i kodu QR (256 bitów, base64url, 43 znaki). */
export function generateToken(random: RandomBytes = randomBytes): string {
  return random(32).toString("base64url");
}

/** Krótki kod do ręcznego wpisania; losowanie bez obciążenia (odrzucanie bajtów poza pełnymi grupami alfabetu). */
export function generateCode(random: RandomBytes = randomBytes): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of random(CODE_LENGTH * 2)) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** `ABCDEFGHJK` -> `ABCDE-FGHJK` do wyświetlania. */
export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Sprowadza to, co wpisał lub wkleił użytkownik, do postaci kanonicznej: token zostaje bez zmian,
 * kod traci spacje i myślniki i jest zapisany wielkimi literami. Zwraca null dla niepoprawnego zapisu.
 */
export function normalizeSecret(input: string): string | null {
  const trimmed = input.trim();
  if (TOKEN_PATTERN.test(trimmed)) return trimmed;

  const code = trimmed.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((char) => CODE_ALPHABET.includes(char)) ? code : null;
}

/** HMAC-SHA256 (hex) sekretu z tajnym pieprzem; w bazie trzymamy tylko ten skrót. */
export function hashSecret(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
}
