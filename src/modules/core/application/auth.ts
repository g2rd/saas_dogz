import type { SupabaseClient } from "@supabase/supabase-js";
import { invitationHashSecret } from "@/shared/env";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../domain/auth";
import { hashBetaCode, normalizeBetaCode } from "../domain/beta-code";
import { safeNextPath } from "../domain/redirect";

/** Ścieżki, na które może wskazywać `next` w linkach z e-maili (callback). */
export const CALLBACK_NEXT_PREFIXES = ["/app", "/portal", "/invite", "/join", "/reset-password"] as const;

/** Ścieżki, na które może wskazywać `next` po zalogowaniu lub rejestracji. */
export const LOGIN_NEXT_PREFIXES = ["/app", "/portal", "/invite", "/join", "/admin"] as const;

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

/** Czy rejestracja jest otwarta dla każdego, czy tylko z kodem beta lub zaproszeniem (ustawia właściciel platformy). */
export async function getSignupMode(db: SupabaseClient): Promise<"open" | "closed"> {
  const { data, error } = await db.rpc("check_signup_allowed", { p_code_hash: null, p_invite_hash: null });
  // Przy błędzie zakładamy zamknięcie: lepiej zapytać o kod, niż wpuścić bez niego
  return !error && data === "ok" ? "open" : "closed";
}

const GATE_MESSAGES: Record<string, string> = {
  closed: "Rejestracja jest teraz zamknięta. Wpisz kod zaproszenia, który dostałeś(-aś) od zespołu DogTrainer.",
  invalid_code: "Ten kod jest nieprawidłowy, wygasł albo został już wykorzystany.",
  invalid_invitation: "To zaproszenie wygasło lub zostało już użyte.",
};

/**
 * Rejestracja konta. Przy zamkniętej rejestracji wymagany jest kod beta (formularz) albo dowód zaproszenia
 * (`options.inviteHash`, skrót z modułu invitations). Ostateczną blokadę wymusza wyzwalacz na auth.users;
 * tu sprawdzamy to wcześniej, żeby pokazać zrozumiały komunikat.
 */
export async function signUp(
  db: SupabaseClient,
  raw: unknown,
  options: { siteUrl: string; next?: unknown; inviteHash?: string | null },
): Promise<Result<SignupOutcome>> {
  const input = parseInput(signupSchema, raw);
  if (!input.ok) return err(input.error);

  const typedCode = String((raw as Record<string, unknown> | null)?.betaCode ?? "").trim();
  const betaCode = typedCode === "" ? null : normalizeBetaCode(typedCode);
  if (typedCode !== "" && betaCode === null) {
    return err(appError("validation", "Popraw zaznaczone pola.", { betaCode: [GATE_MESSAGES.invalid_code] }));
  }
  const codeHash = betaCode ? hashBetaCode(betaCode, invitationHashSecret()) : null;
  const inviteHash = options.inviteHash ?? null;

  const gate = await db.rpc("check_signup_allowed", { p_code_hash: codeHash, p_invite_hash: inviteHash });
  if (gate.error) return err(appError("internal", "Nie udało się utworzyć konta. Spróbuj ponownie.", gate.error.message));
  if (gate.data !== "ok") {
    const message = GATE_MESSAGES[String(gate.data)] ?? GATE_MESSAGES.closed;
    return err(appError("validation", "Popraw zaznaczone pola.", { betaCode: [message] }));
  }

  const next = safeNextPath(options.next, LOGIN_NEXT_PREFIXES);
  const { data, error } = await db.auth.signUp({
    email: input.value.email,
    password: input.value.password,
    options: {
      data: {
        ...(input.value.fullName ? { full_name: input.value.fullName } : {}),
        ...(codeHash ? { beta_code_hash: codeHash } : {}),
        ...(inviteHash ? { invite_hash: inviteHash } : {}),
      },
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
