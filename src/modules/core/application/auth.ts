import type { SupabaseClient } from "@supabase/supabase-js";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../domain/auth";
import { safeNextPath } from "../domain/redirect";

/** Ścieżki, na które może wskazywać `next` w linkach z e-maili (callback). */
export const CALLBACK_NEXT_PREFIXES = ["/app", "/portal", "/invite", "/join", "/reset-password"] as const;

/** Ścieżki, na które może wskazywać `next` po zalogowaniu lub rejestracji. */
export const LOGIN_NEXT_PREFIXES = ["/app", "/portal", "/invite", "/join"] as const;

export type SignupOutcome = "signed_in" | "confirmation_required";

function callbackUrl(siteUrl: string, next: string): string {
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(db: SupabaseClient, raw: unknown): Promise<Result<void>> {
  const input = parseInput(loginSchema, raw);
  if (!input.ok) return err(input.error);

  const { error } = await db.auth.signInWithPassword(input.value);
  // Jeden komunikat dla złego e-maila i złego hasła, żeby nie ujawniać, które konta istnieją.
  if (error) return err(appError("unauthenticated", "Nieprawidłowy e-mail lub hasło."));
  return ok(undefined);
}

export async function signUp(
  db: SupabaseClient,
  raw: unknown,
  options: { siteUrl: string; next?: unknown },
): Promise<Result<SignupOutcome>> {
  const input = parseInput(signupSchema, raw);
  if (!input.ok) return err(input.error);

  const next = safeNextPath(options.next, LOGIN_NEXT_PREFIXES);
  const { data, error } = await db.auth.signUp({
    email: input.value.email,
    password: input.value.password,
    options: {
      data: input.value.fullName ? { full_name: input.value.fullName } : undefined,
      emailRedirectTo: callbackUrl(options.siteUrl, next),
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return err(
        appError("conflict", "Konto z tym adresem już istnieje. Zaloguj się lub zresetuj hasło."),
      );
    }
    if (error.code === "weak_password") {
      return err(appError("validation", "Hasło jest zbyt słabe.", { password: ["Wybierz mocniejsze hasło"] }));
    }
    return err(appError("internal", "Nie udało się utworzyć konta. Spróbuj ponownie.", error.message));
  }

  // Bez potwierdzenia e-mail (lokalnie) sesja jest od razu; z potwierdzeniem trzeba kliknąć link.
  return ok(data.session ? "signed_in" : "confirmation_required");
}

/** Zawsze kończy się sukcesem dla poprawnego e-maila, nawet gdy konto nie istnieje (brak wycieku kont). */
export async function requestPasswordReset(
  db: SupabaseClient,
  raw: unknown,
  options: { siteUrl: string },
): Promise<Result<void>> {
  const input = parseInput(forgotPasswordSchema, raw);
  if (!input.ok) return err(input.error);

  const { error } = await db.auth.resetPasswordForEmail(input.value.email, {
    redirectTo: callbackUrl(options.siteUrl, "/reset-password"),
  });
  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return err(appError("conflict", "Za dużo prób. Spróbuj ponownie za kilka minut."));
    }
    return err(appError("internal", "Nie udało się wysłać wiadomości. Spróbuj ponownie.", error.message));
  }
  return ok(undefined);
}

/** Ustawia nowe hasło dla zalogowanego użytkownika (sesja z linku resetującego). */
export async function updatePassword(db: SupabaseClient, raw: unknown): Promise<Result<void>> {
  const input = parseInput(resetPasswordSchema, raw);
  if (!input.ok) return err(input.error);

  const { error } = await db.auth.updateUser({ password: input.value.password });
  if (error) {
    if (error.code === "same_password") {
      return err(
        appError("validation", "Popraw zaznaczone pola.", { password: ["Nowe hasło musi różnić się od obecnego"] }),
      );
    }
    if (error.code === "weak_password") {
      return err(appError("validation", "Hasło jest zbyt słabe.", { password: ["Wybierz mocniejsze hasło"] }));
    }
    if (
      error.name === "AuthSessionMissingError" ||
      error.status === 401 ||
      error.code === "session_not_found"
    ) {
      return err(appError("unauthenticated", "Link wygasł. Poproś o nowy."));
    }
    return err(appError("internal", "Nie udało się zmienić hasła. Spróbuj ponownie.", error.message));
  }
  return ok(undefined);
}

/** Wymienia kod z linku w e-mailu (PKCE) na sesję. */
export async function exchangeAuthCode(db: SupabaseClient, code: unknown): Promise<Result<void>> {
  if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
    return err(appError("validation", "Nieprawidłowy link."));
  }
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return err(appError("unauthenticated", "Link wygasł lub został już użyty."));
  return ok(undefined);
}
