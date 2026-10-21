"use server";

import { redirect } from "next/navigation";
import { requireAdminUser } from "../../_lib/context";

export type EnrollState = { error?: string; factorId?: string; qrCode?: string; secret?: string };
export type CodeState = { error?: string };

const CODE_PATTERN = /^\d{6}$/;

/** Zaczyna zapis aplikacji uwierzytelniającej: usuwa porzucone, niepotwierdzone próby i tworzy nowy czynnik TOTP. */
export async function startMfaEnrollAction(): Promise<EnrollState> {
  const { db } = await requireAdminUser();

  const factors = await db.auth.mfa.listFactors();
  for (const factor of factors.data?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await db.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const enrolled = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `DogTrainer ${new Date().toISOString().slice(0, 10)}` });
  if (enrolled.error) return { error: `Nie udało się rozpocząć konfiguracji: ${enrolled.error.message}` };
  return { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret };
}

async function verify(factorId: string, formData: FormData): Promise<CodeState> {
  const { db } = await requireAdminUser();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_PATTERN.test(code)) return { error: "Wpisz 6 cyfr z aplikacji uwierzytelniającej." };

  const result = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (result.error) return { error: "Kod jest niepoprawny albo wygasł. Spróbuj ponownie z aktualnym kodem." };
  redirect("/admin");
}

/** Potwierdzenie nowo zapisanej aplikacji pierwszym kodem. */
export async function confirmMfaEnrollAction(factorId: string, _prev: CodeState, formData: FormData): Promise<CodeState> {
  return verify(factorId, formData);
}

/** Logowanie do panelu kodem z już zapisanej aplikacji. */
export async function verifyMfaAction(factorId: string, _prev: CodeState, formData: FormData): Promise<CodeState> {
  return verify(factorId, formData);
}
