import { describe, expect, it } from "vitest";
import { validateEnv } from "../../../scripts/env-check-lib.mjs";

// Wartości testowe o poprawnym kształcie (nie są prawdziwymi sekretami)
const jwt = (payload: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJl`;

const valid = (): Record<string, string> => ({
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", role: "anon" }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase", role: "service_role" }),
  NEXT_PUBLIC_SITE_URL: "https://app.example.org",
  INVITATION_HASH_SECRET: "a".repeat(32),
  CRON_SECRET: "b".repeat(32),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "B".repeat(87),
  VAPID_PRIVATE_KEY: "c".repeat(43),
  VAPID_SUBJECT: "mailto:pomoc@example.org",
  RESEND_API_KEY: "re_1234567890abcdef",
  EMAIL_FROM: "DogTrainer <powiadomienia@example.org>",
  NEXT_PUBLIC_SUPPORT_EMAIL: "pomoc@example.org",
  SENTRY_DSN: "https://abc123@o1.ingest.de.sentry.io/4500000000000001",
  NEXT_PUBLIC_OPERATOR_NAME: "Firma Sp. z o.o.",
  NEXT_PUBLIC_OPERATOR_ADDRESS: "ul. Testowa 1, 00-001 Warszawa",
  ENABLED_LOCALES: "pl,en",
});

const errorsFor = (overrides: Record<string, string | undefined>, target?: "staging" | "production") =>
  validateEnv({ ...valid(), ...overrides }, { target }).errors.map((e: string) => e.split(":")[0]);

describe("validateEnv", () => {
  it("poprawna konfiguracja nie ma błędów ani ostrzeżeń", () => {
    const result = validateEnv(valid());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok.length).toBeGreaterThan(10);
  });

  it("pusta konfiguracja zgłasza każdą wymaganą zmienną", () => {
    const names = validateEnv({}).errors.map((e: string) => e.split(":")[0]);
    for (const required of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
      "INVITATION_HASH_SECRET",
      "CRON_SECRET",
      "VAPID",
      "VAPID_SUBJECT",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "NEXT_PUBLIC_SUPPORT_EMAIL",
    ]) {
      expect(names, required).toContain(required);
    }
  });

  it("odrzuca lokalny Supabase i klucze demo", () => {
    expect(errorsFor({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(errorsFor({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase-demo", role: "anon" }) })).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(errorsFor({ SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase-demo", role: "service_role" }) })).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("wykrywa pomylone klucze (service_role równy anon)", () => {
    const same = valid().NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(errorsFor({ SUPABASE_SERVICE_ROLE_KEY: same })).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("wymaga adresu https bez ścieżki i bez localhost", () => {
    expect(errorsFor({ NEXT_PUBLIC_SITE_URL: "http://app.example.org" })).toContain("NEXT_PUBLIC_SITE_URL");
    expect(errorsFor({ NEXT_PUBLIC_SITE_URL: "https://localhost:3000" })).toContain("NEXT_PUBLIC_SITE_URL");
    expect(errorsFor({ NEXT_PUBLIC_SITE_URL: "https://app.example.org/panel" })).toContain("NEXT_PUBLIC_SITE_URL");
    const trailing = validateEnv({ ...valid(), NEXT_PUBLIC_SITE_URL: "https://app.example.org/" });
    expect(trailing.errors).toEqual([]);
    expect(trailing.warnings.some((w: string) => w.startsWith("NEXT_PUBLIC_SITE_URL"))).toBe(true);
  });

  it("pilnuje długości sekretów i wartości deweloperskiej", () => {
    expect(errorsFor({ INVITATION_HASH_SECRET: "krotki" })).toContain("INVITATION_HASH_SECRET");
    expect(errorsFor({ INVITATION_HASH_SECRET: "dev-only-invitation-secret-change-me-0000" })).toContain("INVITATION_HASH_SECRET");
    expect(errorsFor({ CRON_SECRET: "krotki" })).toContain("CRON_SECRET");
  });

  it("sprawdza format kluczy VAPID, temat i klucz Resend", () => {
    expect(errorsFor({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "za-krotki" })).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(errorsFor({ VAPID_PRIVATE_KEY: "za-krotki" })).toContain("VAPID_PRIVATE_KEY");
    expect(errorsFor({ VAPID_SUBJECT: "mailto:kontakt@dogtrainer.local" })).toContain("VAPID_SUBJECT");
    expect(errorsFor({ RESEND_API_KEY: "klucz-bez-prefiksu" })).toContain("RESEND_API_KEY");
    expect(errorsFor({ EMAIL_FROM: "DogTrainer <powiadomienia@dogtrainer.local>" })).toContain("EMAIL_FROM");
  });

  it("zmienne tylko lokalne na wdrożeniu są błędem", () => {
    expect(errorsFor({ DEV_TUNNEL: "1" })).toContain("DEV_TUNNEL");
    expect(errorsFor({ OUTBOX_DEV_POLL: "on" })).toContain("OUTBOX_DEV_POLL");
    expect(errorsFor({ MAILPIT_URL: "http://127.0.0.1:54324" })).toContain("MAILPIT_URL");
  });

  it("brak danych operatora i angielskiego to ostrzeżenia, a wyłączone MFA blokuje tylko produkcję", () => {
    const result = validateEnv({ ...valid(), NEXT_PUBLIC_OPERATOR_NAME: "", ENABLED_LOCALES: "" });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w: string) => w.split(":")[0])).toEqual(["NEXT_PUBLIC_OPERATOR_NAME", "ENABLED_LOCALES"]);

    expect(errorsFor({ ADMIN_REQUIRE_MFA: "0" }, "staging")).toEqual([]);
    expect(errorsFor({ ADMIN_REQUIRE_MFA: "0" }, "production")).toContain("ADMIN_REQUIRE_MFA");
  });

  it("komunikaty nigdy nie zawierają wartości zmiennych", () => {
    const secret = "SEKRET-NIE-DO-WYPISANIA-123456789012";
    const result = validateEnv({ ...valid(), CRON_SECRET: "x", RESEND_API_KEY: secret, INVITATION_HASH_SECRET: secret.slice(0, 10) });
    const text = [...result.errors, ...result.warnings, ...result.ok].join("\n");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(secret.slice(0, 10));
  });
});
