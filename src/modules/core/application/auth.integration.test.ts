import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { LEGAL_VERSION } from "@/shared/legal";
import { emailCountTo, waitForEmailTo } from "@/shared/testing/mailpit";
import { adminClient } from "@/shared/testing/supabase-test";
import {
  exchangeAuthCode,
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from "./auth";

const API_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const freshClient = () =>
  createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const SITE_URL = "http://localhost:3000";
const email = `signup-${crypto.randomUUID().slice(0, 8)}@example.test`;
const password = `pw-${crypto.randomUUID()}`;
const newPassword = `new-${crypto.randomUUID()}`;

describe("auth use cases against a real database", () => {
  it("signs up a new user, stores the full name in the profile and starts a session", async () => {
    const db = freshClient();
    const result = await signUp(db, { fullName: "Jan Trener", email: email.toUpperCase(), password, acceptTerms: "on" }, { siteUrl: SITE_URL });
    expect(result).toEqual({ ok: true, value: "signed_in" });

    const user = await db.auth.getUser();
    expect(user.data.user?.email).toBe(email);

    const profile = await adminClient().from("profiles").select("full_name").eq("id", user.data.user!.id).single();
    expect(profile.data?.full_name).toBe("Jan Trener");

    // Zgoda na regulamin i politykę prywatności zapisana w bazie z wersją dokumentów
    const consents = await adminClient().from("consents").select("document, version").eq("user_id", user.data.user!.id).order("document");
    expect(consents.data).toEqual([
      { document: "privacy", version: LEGAL_VERSION },
      { document: "terms", version: LEGAL_VERSION },
    ]);
  });

  it("requires accepting the terms and the privacy policy", async () => {
    const result = await signUp(freshClient(), { email: `no-consent-${crypto.randomUUID().slice(0, 8)}@example.test`, password }, { siteUrl: SITE_URL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ acceptTerms: ["validation.accept_terms"] });
  });

  it("does not accept a forged consent version from outside the form", async () => {
    const forged = await freshClient().auth.signUp({
      email: `forged-${crypto.randomUUID().slice(0, 8)}@example.test`,
      password,
      options: { data: { consent_version: "jutro; drop table" } },
    });
    expect(forged.data.user).not.toBeNull();
    const consents = await adminClient().from("consents").select("id").eq("user_id", forged.data.user!.id);
    expect(consents.data).toEqual([]);
  });

  it("rejects a duplicate e-mail with a conflict error", async () => {
    const result = await signUp(freshClient(), { email, password, acceptTerms: "on" }, { siteUrl: SITE_URL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("conflict");
  });

  it("validates input before talking to Auth", async () => {
    const result = await signUp(freshClient(), { email: "nie-email", password: "x", acceptTerms: "on" }, { siteUrl: SITE_URL });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.details).toMatchObject({ email: expect.any(Array), password: expect.any(Array) });
    }
  });

  it("signs in with the right password and gives one generic error otherwise", async () => {
    const ok = await signIn(freshClient(), { email, password });
    expect(ok.ok).toBe(true);

    const wrongPassword = await signIn(freshClient(), { email, password: "zle-haslo" });
    const unknownUser = await signIn(freshClient(), { email: "nikt@example.test", password });
    expect(wrongPassword.ok || unknownUser.ok).toBe(false);
    if (!wrongPassword.ok && !unknownUser.ok) {
      expect(wrongPassword.error.code).toBe("unauthenticated");
      expect(wrongPassword.error.message).toBe(unknownUser.error.message);
    }
  });

  it("sends a reset e-mail pointing at the callback, and says nothing about unknown accounts", async () => {
    const known = await requestPasswordReset(freshClient(), { email }, { siteUrl: SITE_URL });
    expect(known.ok).toBe(true);

    const mail = await waitForEmailTo(email);
    const body = `${mail.text} ${mail.html}`;
    // Adres docelowy jest zakodowany w parametrze redirect_to linku weryfikacyjnego.
    expect(body).toMatch(/auth(%2F|\/)callback/i);
    expect(body).toMatch(/reset-password/);

    const unknownAddress = `nikt-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const unknown = await requestPasswordReset(freshClient(), { email: unknownAddress }, { siteUrl: SITE_URL });
    expect(unknown.ok).toBe(true);
    expect(await emailCountTo(unknownAddress)).toBe(0);
  });

  it("changes the password for a signed-in user, enforcing confirmation and difference", async () => {
    const db = freshClient();
    await signIn(db, { email, password });

    const mismatch = await updatePassword(db, { password: newPassword, confirmPassword: "inne-haslo-123" });
    expect(mismatch.ok).toBe(false);

    const same = await updatePassword(db, { password, confirmPassword: password });
    expect(same.ok).toBe(false);

    const changed = await updatePassword(db, { password: newPassword, confirmPassword: newPassword });
    expect(changed.ok).toBe(true);

    expect((await signIn(freshClient(), { email, password })).ok).toBe(false);
    expect((await signIn(freshClient(), { email, password: newPassword })).ok).toBe(true);
  });

  it("refuses to change a password without a session", async () => {
    const result = await updatePassword(freshClient(), { password: newPassword, confirmPassword: newPassword });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unauthenticated");
  });

  it("rejects missing and bogus auth codes", async () => {
    expect((await exchangeAuthCode(freshClient(), undefined)).ok).toBe(false);
    const bogus = await exchangeAuthCode(freshClient(), "nieistniejacy-kod");
    expect(bogus.ok).toBe(false);
  });
});
