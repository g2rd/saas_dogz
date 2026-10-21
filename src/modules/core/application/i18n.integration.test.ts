import { describe, expect, it } from "vitest";
import { createSessionType } from "@/modules/scheduling/application/scheduling";
import { adminClient, anonClient, contextFor, createTestUser } from "@/shared/testing/supabase-test";
import { signUp } from "./auth";
import { createOrganization } from "./create-organization";

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

describe("język, waluta i strefa czasowa wykryte z urządzenia", () => {
  it("rejestracja zapisuje język preferowany przez użytkownika w profilu", async () => {
    const email = `i18n-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const result = await signUp(
      anonClient(),
      { email, password: "Haslo-Testowe-123", fullName: "Anna Test", acceptTerms: "on" },
      { siteUrl: "http://localhost:3000", locale: "en" },
    );
    expect(result.ok).toBe(true);

    const { data: users } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    const user = users.users.find((candidate) => candidate.email === email);
    const { data: profile } = await adminClient().from("profiles").select("locale, full_name").eq("id", user!.id).single();
    expect(profile).toMatchObject({ locale: "en", full_name: "Anna Test" });
  });

  it("nowa szkoła dostaje walutę, strefę i język z urządzenia, a rekordy z kwotami tę walutę", async () => {
    const owner = await createTestUser("i18n-owner");
    const orgId = value(
      await createOrganization(owner.db, { name: "Dog School London" }, { settings: { currency: "GBP", timezone: "Europe/London", locale: "en" } }),
    );

    const { data: settings } = await adminClient()
      .from("organization_settings")
      .select("currency, timezone, locale")
      .eq("organization_id", orgId)
      .single();
    expect(settings).toEqual({ currency: "GBP", timezone: "Europe/London", locale: "en" });

    const ctx = contextFor(owner, orgId, "owner");
    const type = value(await createSessionType(ctx, { name: "Training", durationMinutes: "60", defaultPrice: "50" }));
    const { data: row } = await adminClient().from("session_types").select("currency, default_price_minor").eq("id", type.id).single();
    expect(row).toMatchObject({ currency: "GBP", default_price_minor: 5000 });
  });

  it("niepoprawne wartości z urządzenia są pomijane, a szkoła zostaje z ustawieniami domyślnymi", async () => {
    const owner = await createTestUser("i18n-bad");
    const orgId = value(
      await createOrganization(owner.db, { name: "Szkoła Domyślna" }, { settings: { currency: "<x>", timezone: "Mars/Olympus", locale: "<script>" } }),
    );
    const { data: settings } = await adminClient()
      .from("organization_settings")
      .select("currency, timezone, locale")
      .eq("organization_id", orgId)
      .single();
    expect(settings).toEqual({ currency: "PLN", timezone: "Europe/Warsaw", locale: "pl" });
  });
});
