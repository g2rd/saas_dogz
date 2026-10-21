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
import { msg } from "@/shared/i18n/messages";

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
  if (error) return err(appError("unauthenticated", msg("errors.auth.invalid_credentials")));
  return ok(undefined);
}

/** Czy rejestracja jest otwarta dla każdego, czy tylko z kodem beta lub zaproszeniem (ustawia właściciel platformy). */
export async function getSignupMode(db: SupabaseClient): Promise<"open" | "closed"> {
  const { data, error } = await db.rpc("check_signup_allowed", { p_code_hash: null, p_invite_hash: null });
  // Przy błędzie zakładamy zamknięcie: lepiej zapytać o kod, niż wpuścić bez niego
  return !error && data === "ok" ? "open" : "closed";
}

const GATE_MESSAGES: Record<string, string> = {
  closed: msg("errors.auth.gate_closed"),
  invalid_code: msg("errors.auth.gate_invalid_code"),
  invalid_invitation: msg("errors.auth.gate_invalid_invitation"),
};

/**
 * Rejestracja konta. Przy zamkniętej rejestracji wymagany jest kod beta (formularz) albo dowód zaproszenia
 * (`options.inviteHash`, skrót z modułu invitations). Ostateczną blokadę wymusza wyzwalacz na auth.users;
 * tu sprawdzamy to wcześniej, żeby pokazać zrozumiały komunikat.
 */
export async function signUp(
  db: SupabaseClient,
  raw: unknown,
  options: { siteUrl: string; next?: unknown; inviteHash?: string | null; locale?: string },
): Promise<Result<SignupOutcome>> {
  const input = parseInput(signupSchema, raw);
  if (!input.ok) return err(input.error);

  const typedCode = String((raw as Record<string, unknown> | null)?.betaCode ?? "").trim();
  const betaCode = typedCode === "" ? null : normalizeBetaCode(typedCode);
  if (typedCode !== "" && betaCode === null) {
    return err(appError("validation", msg("validation.fix_fields"), { betaCode: [GATE_MESSAGES.invalid_code] }));
  }
  const codeHash = betaCode ? hashBetaCode(betaCode, invitationHashSecret()) : null;
  const inviteHash = options.inviteHash ?? null;

  const gate = await db.rpc("check_signup_allowed", { p_code_hash: codeHash, p_invite_hash: inviteHash });
  if (gate.error) return err(appError("internal", msg("errors.auth.signup_failed"), gate.error.message));
  if (gate.data !== "ok") {
    const message = GATE_MESSAGES[String(gate.data)] ?? GATE_MESSAGES.closed;
    return err(appError("validation", msg("validation.fix_fields"), { betaCode: [message] }));
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
        // Język preferowany przy rejestracji: trafia do profilu (powiadomienia w języku odbiorcy)
        ...(options.locale && /^[a-z]{2,3}$/.test(options.locale) ? { locale: options.locale } : {}),
      },
      emailRedirectTo: callbackUrl(options.siteUrl, next),
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return err(
        appError("conflict", msg("errors.auth.account_exists")),
      );
    }
    if (error.code === "weak_password") {
      return err(appError("validation", msg("errors.auth.password_weak"), { password: [msg("validation.password_weak_hint")] }));
    }
    return err(appError("internal", msg("errors.auth.signup_failed"), error.message));
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
      return err(appError("conflict", msg("errors.auth.too_many_attempts")));
    }
    return err(appError("internal", msg("errors.auth.email_not_sent"), error.message));
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
        appError("validation", msg("validation.fix_fields"), { password: [msg("validation.password_same_as_old")] }),
      );
    }
    if (error.code === "weak_password") {
      return err(appError("validation", msg("errors.auth.password_weak"), { password: [msg("validation.password_weak_hint")] }));
    }
    if (
      error.name === "AuthSessionMissingError" ||
      error.status === 401 ||
      error.code === "session_not_found"
    ) {
      return err(appError("unauthenticated", msg("errors.auth.link_expired")));
    }
    return err(appError("internal", msg("errors.auth.password_change_failed"), error.message));
  }
  return ok(undefined);
}

/** Wymienia kod z linku w e-mailu (PKCE) na sesję. */
export async function exchangeAuthCode(db: SupabaseClient, code: unknown): Promise<Result<void>> {
  if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
    return err(appError("validation", msg("errors.auth.link_invalid")));
  }
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return err(appError("unauthenticated", msg("errors.auth.link_used")));
  return ok(undefined);
}
