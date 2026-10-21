import { describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { sellPackage } from "@/modules/packages/application/packages";
import { adminClient, contextFor, createTestUser } from "@/shared/testing/supabase-test";
import { createOrganization } from "./create-organization";
import { getSchoolSettings, updateSchoolSettings } from "./settings";

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const valid = {
  currency: "EUR",
  timezone: "Europe/Berlin",
  locale: "en",
  lateCancelHours: "12",
  lateCancelConsumesSession: "on",
};

async function newSchool(label: string) {
  const owner = await createTestUser(label);
  const orgId = value(await createOrganization(owner.db, { name: `Szkoła ${label}` }));
  return { owner, orgId, ctx: contextFor(owner, orgId, "owner") };
}

describe("ustawienia szkoły", () => {
  it("właściciel odczytuje i zapisuje ustawienia; zapis trafia do bazy i dziennika zmian", async () => {
    const { ctx, orgId } = await newSchool("settings-owner");
    const before = value(await getSchoolSettings(ctx));
    expect(before).toMatchObject({ currencyLocked: false, settings: { currency: "PLN", timezone: "Europe/Warsaw", locale: "pl" } });

    const saved = value(await updateSchoolSettings(ctx, valid, ["pl", "en"]));
    expect(saved).toMatchObject({ currency: "EUR", timezone: "Europe/Berlin", locale: "en", lateCancelHours: 12, lateCancelConsumesSession: true });

    const after = value(await getSchoolSettings(ctx));
    expect(after.settings).toMatchObject({ currency: "EUR", timezone: "Europe/Berlin", locale: "en", lateCancelHours: 12 });

    const { data: audit } = await adminClient()
      .from("audit_log")
      .select("changes")
      .eq("organization_id", orgId)
      .eq("action", "organization.settings_updated");
    expect(audit?.length).toBeGreaterThanOrEqual(1);
  });

  it("odznaczony „zużywa zajęcie” wyłącza zużycie przy późnym odwołaniu", async () => {
    const { ctx } = await newSchool("settings-consumes");
    const withoutCheckbox: Record<string, string> = { ...valid };
    delete withoutCheckbox.lateCancelConsumesSession;
    const saved = value(await updateSchoolSettings(ctx, withoutCheckbox, ["pl", "en"]));
    expect(saved.lateCancelConsumesSession).toBe(false);
  });

  it("odrzuca niepoprawne wartości i zostawia ustawienia bez zmian", async () => {
    const { ctx } = await newSchool("settings-invalid");
    for (const [field, bad] of [
      ["currency", "ZZZ9"],
      ["timezone", "Mars/Olympus"],
      ["locale", "de"],
      ["lateCancelHours", "9999"],
      ["lateCancelHours", "-1"],
    ] as const) {
      const result = await updateSchoolSettings(ctx, { ...valid, [field]: bad }, ["pl", "en"]);
      expect(result.ok, `${field}=${bad}`).toBe(false);
    }
    const after = value(await getSchoolSettings(ctx));
    expect(after.settings).toMatchObject({ currency: "PLN", timezone: "Europe/Warsaw", locale: "pl" });
  });

  it("język spoza włączonych jest odrzucony, a ten z listy przechodzi", async () => {
    const { ctx } = await newSchool("settings-locale");
    expect((await updateSchoolSettings(ctx, valid, ["pl"])).ok).toBe(false);
    expect((await updateSchoolSettings(ctx, valid, ["pl", "en"])).ok).toBe(true);
  });

  it("po sprzedaży pakietu waluta jest zablokowana, a pozostałe ustawienia można zmieniać", async () => {
    const { ctx } = await newSchool("settings-lock");
    const client = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska" }));
    value(await sellPackage(ctx, { clientId: client.id, name: "Pakiet 5", sessionsCount: "5", price: "400" }));

    expect(value(await getSchoolSettings(ctx)).currencyLocked).toBe(true);

    const blocked = await updateSchoolSettings(ctx, { ...valid, currency: "USD" }, ["pl", "en"]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatchObject({ code: "conflict", details: { reason: "currency_locked" } });

    // Ta sama waluta + inna strefa: przechodzi
    const same = await updateSchoolSettings(ctx, { ...valid, currency: "PLN", timezone: "Europe/London" }, ["pl", "en"]);
    expect(same.ok).toBe(true);
  });

  it("zmiana waluty przez API w obejściu aplikacji też jest blokowana przez bazę (DT018)", async () => {
    const { ctx, owner, orgId } = await newSchool("settings-bypass");
    const client = value(await createClient(ctx, { firstName: "Jan", lastName: "Nowak" }));
    value(await sellPackage(ctx, { clientId: client.id, name: "Pakiet 5", sessionsCount: "5", price: "400" }));

    const { error } = await owner.db.from("organization_settings").update({ currency: "USD" }).eq("organization_id", orgId);
    expect(error?.code).toBe("DT018");
  });

  it("trener i asystent nie widzą ani nie zmieniają ustawień szkoły", async () => {
    const { ctx } = await newSchool("settings-roles");
    for (const role of ["trainer", "assistant"]) {
      const asRole = { ...ctx, role };
      expect((await getSchoolSettings(asRole)).ok).toBe(false);
      expect((await updateSchoolSettings(asRole, valid, ["pl", "en"])).ok).toBe(false);
    }
  });
});
