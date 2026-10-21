import { createHmac, randomBytes } from "node:crypto";

/** 31 znaków bez mylących (0/O, 1/I/L), jak w kodach zaproszeń. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const BETA_CODE_LENGTH = 12;

type RandomBytes = (size: number) => Buffer;

/** Kod beta: 12 znaków (około 59 bitów entropii), losowanie bez obciążenia. */
export function generateBetaCode(random: RandomBytes = randomBytes): string {
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";
  while (code.length < BETA_CODE_LENGTH) {
    for (const byte of random(BETA_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < BETA_CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

/** `ABCDEFGHJKMN` -> `ABCD-EFGH-JKMN` do wyświetlania i przepisywania. */
export function formatBetaCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

/** Sprowadza wpisany kod do postaci kanonicznej; `null`, gdy zapis jest niepoprawny. */
export function normalizeBetaCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== BETA_CODE_LENGTH) return null;
  return [...code].every((char) => ALPHABET.includes(char)) ? code : null;
}

/** HMAC-SHA256 (hex) z tajnym pieprzem; w bazie trzymamy tylko ten skrót. */
export function hashBetaCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`beta:${code}`).digest("hex");
}
