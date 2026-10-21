import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { findAccessNotice, loadOrgAccess } from "@/modules/core/infrastructure/org-access";
import { signUp } from "@/modules/core/application/auth";
import { adminClient, anonClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import {
  createBetaCode,
  extendOrganizationAccess,
  getOrganizationOverview,
  getSignupMode,
  getStatusHistory,
  listBetaCodes,
  listOrganizations,
  revokeBetaCode,
  setOrganizationNotes,
  setOrganizationStatus,
  setSignupMode,
  type AdminContext,
} from "./admin";

let owner: TestUser;
let staffAdmin: TestUser;
let stranger: TestUser;
let portalUser: TestUser;
let orgId: string;
let admin: AdminContext;

const DAY_MS = 86_400_000;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

beforeAll(async () => {
  [owner, staffAdmin, stranger, portalUser] = await Promise.all([
    createTestUser("pa-owner"),
    createTestUser("pa-admin"),
    createTestUser("pa-stranger"),
    createTestUser("pa-portal"),
  ]);
  await adminClient().from("platform_admins").insert({ user_id: staffAdmin.id, note: "test" });
  admin = { adminId: staffAdmin.id, db: adminClient(), now: () => new Date() };
  orgId = value(await createOrganization(owner.db, { name: "Szkoła Testowa Panelu" }));
});

afterAll(async () => {
  await adminClient().from("platform_admins").delete().eq("user_id", staffAdmin.id);
});

describe("przegląd szkół", () => {
  it("pokazuje szkołę z właścicielem i metrykami, bez danych klientów", async () => {
    const client = value(await createClient(contextFor(owner, orgId, "owner"), { firstName: "Anna", lastName: "Panelowa" }));
    await adminClient().from("client_access").insert({ organization_id: orgId, client_id: client.id, user_id: portalUser.id, relation: "owner" });
    const overview = value(await getOrganizationOverview(admin, orgId));
    expect(overview).toMatchObject({
      name: "Szkoła Testowa Panelu",
      status: "trial",
      ownerEmail: owner.email,
      staffCount: 1,
      clientsCount: 1,
      newClients7d: 1,
      portalClientsCount: 1,
    });
    expect(value(await listOrganizations(admin)).map((o) => o.id)).toContain(orgId);
    expect(JSON.stringify(overview)).not.toContain("Panelowa");
  });

  it("notatka właściciela jest widoczna tylko w przeglądzie", async () => {
    value(await setOrganizationNotes(admin, orgId, { notes: "  Telefon 600 000 000, cena założycielska 49 zł " }));
    expect(value(await getOrganizationOverview(admin, orgId)).notes).toBe("Telefon 600 000 000, cena założycielska 49 zł");
    // Trener nie może odczytać tabeli z notatkami
    const read = await owner.db.from("organization_admin_info").select("notes").eq("organization_id", orgId);
    expect(read.data ?? []).toEqual([]);
  });
});

describe("status i blokada dostępu", () => {
  it("tylko administrator platformy może zmieniać status", async () => {
    const outsider: AdminContext = { ...admin, adminId: stranger.id };
    const result = await setOrganizationStatus(outsider, orgId, { status: "suspended", reason: "x", accessUntil: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
  });

  it("blokada wymaga powodu, a niepoprawne dane są odrzucane", async () => {
    const noReason = await setOrganizationStatus(admin, orgId, { status: "read_only", reason: "", accessUntil: "" });
    expect(noReason.ok).toBe(false);
    const badStatus = await setOrganizationStatus(admin, orgId, { status: "banned", reason: "x", accessUntil: "" });
    expect(badStatus.ok).toBe(false);
    const badDate = await setOrganizationStatus(admin, orgId, { status: "active", reason: "", accessUntil: "2026-02-31" });
    expect(badDate.ok).toBe(false);
  });

  it("tryb „tylko do odczytu”: trener czyta, ale zapis jest odrzucany z czytelnym komunikatem", async () => {
    value(await setOrganizationStatus(admin, orgId, { status: "read_only", reason: "Koniec testów", accessUntil: "" }));
    const ctx = contextFor(owner, orgId, "owner");

    const states = await loadOrgAccess(owner.db, [orgId]);
    expect(states.get(orgId)?.access).toMatchObject({ status: "read_only", reason: "Koniec testów" });

    const write = await createClient(ctx, { firstName: "Nowy", lastName: "Klient" });
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.error.code).toBe("forbidden");
      expect(write.error.details).toMatchObject({ reason: "read_only" });
    }
    const history = value(await getStatusHistory(admin, orgId));
    expect(history[0]).toMatchObject({ from: "trial", to: "read_only", reason: "Koniec testów" });
  });

  it("zawieszenie odcina trenera od danych, ale zostawia mu komunikat", async () => {
    value(await setOrganizationStatus(admin, orgId, { status: "suspended", reason: "Brak płatności", accessUntil: "" }));

    const clients = await owner.db.from("clients").select("id").eq("organization_id", orgId);
    expect(clients.data ?? []).toEqual([]);

    const states = await loadOrgAccess(owner.db, [orgId]);
    expect(states.get(orgId)).toMatchObject({ status: "suspended", access: null, reason: "Brak płatności" });
    expect(await findAccessNotice(owner.db, owner.id)).toMatchObject({
      kind: "staff",
      organizationName: "Szkoła Testowa Panelu",
      reason: "Brak płatności",
    });
    // Klient zawieszonej szkoły nie widzi danych, ale dostaje komunikat o niedostępności szkoły
    expect((await portalUser.db.from("clients").select("id")).data ?? []).toEqual([]);
    expect(await findAccessNotice(portalUser.db, portalUser.id)).toMatchObject({ kind: "client", organizationName: "Szkoła Testowa Panelu" });
    // Obca osoba nie widzi nawet nazwy zawieszonej szkoły
    expect((await loadOrgAccess(stranger.db, [orgId])).size).toBe(0);
  });

  it("przywrócenie i przedłużenie dostępu zdejmują blokadę", async () => {
    value(await setOrganizationStatus(admin, orgId, { status: "active", reason: "", accessUntil: "" }));
    value(await extendOrganizationAccess(admin, orgId, { days: "30" }));

    const overview = value(await getOrganizationOverview(admin, orgId));
    expect(overview.status).toBe("active");
    expect(overview.accessUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);

    expect(await findAccessNotice(owner.db, owner.id)).toBeNull();
    value(await createClient(contextFor(owner, orgId, "owner"), { firstName: "Po", lastName: "Odblokowaniu" }));
  });

  it("trener nie zmieni statusu ani terminu dostępu własnej szkoły przez API", async () => {
    const attempt = await owner.db.from("organizations").update({ status: "active", access_until: null }).eq("id", orgId).select();
    expect(attempt.error).not.toBeNull();
    expect(value(await getOrganizationOverview(admin, orgId)).status).toBe("active");
  });

  it("automat wygaszania przestawia szkołę z upłyniętym terminem w tryb „tylko do odczytu”", async () => {
    await adminClient()
      .from("organizations")
      .update({ access_until: new Date(Date.now() - DAY_MS).toISOString() })
      .eq("id", orgId);
    const { data } = await adminClient().rpc("expire_organization_access");
    expect(data).toBeGreaterThanOrEqual(1);
    expect(value(await getOrganizationOverview(admin, orgId)).status).toBe("read_only");
    value(await setOrganizationStatus(admin, orgId, { status: "active", reason: "", accessUntil: "" }));
  });
});

describe("kody beta i zamknięta rejestracja", () => {
  it("kod można utworzyć, zobaczyć na liście (bez jawnego kodu) i unieważnić", async () => {
    const created = value(await createBetaCode(admin, { label: "Anna K., Łapa", maxUses: "1", validDays: "14" }));
    expect(created.code).toHaveLength(12);
    const list = value(await listBetaCodes(admin));
    const row = list.find((c) => c.label === "Anna K., Łapa")!;
    expect(row).toMatchObject({ maxUses: 1, usedCount: 0, revokedAt: null });
    expect(JSON.stringify(list)).not.toContain(created.code);

    value(await revokeBetaCode(admin, row.id));
    expect(value(await listBetaCodes(admin)).find((c) => c.id === row.id)!.revokedAt).toBeInstanceOf(Date);
  });

  it("przy zamkniętej rejestracji konto powstaje tylko z ważnym kodem, a kod jednorazowy działa raz", async () => {
    const original = value(await getSignupMode(admin));
    try {
      value(await setSignupMode(admin, { mode: "closed" }));
      const anon = anonClient();
      const options = { siteUrl: "http://localhost:3000" };
      const stamp = Date.now();

      const noCode = await signUp(anon, { email: `no-code-${stamp}@example.test`, password: "Haslo-Testowe-123" }, options);
      expect(noCode.ok).toBe(false);
      if (!noCode.ok) expect(noCode.error.details).toMatchObject({ betaCode: [expect.stringContaining("zamknięta")] });

      const created = value(await createBetaCode(admin, { label: "Rejestracja testowa", maxUses: "1", validDays: "1" }));
      const first = await signUp(
        anonClient(),
        { email: `with-code-${stamp}@example.test`, password: "Haslo-Testowe-123", betaCode: created.display },
        options,
      );
      expect(first.ok).toBe(true);

      const reused = await signUp(
        anonClient(),
        { email: `reused-${stamp}@example.test`, password: "Haslo-Testowe-123", betaCode: created.display },
        options,
      );
      expect(reused.ok).toBe(false);
      if (!reused.ok) expect(reused.error.details).toMatchObject({ betaCode: [expect.stringContaining("wykorzystany")] });

      const used = value(await listBetaCodes(admin)).find((c) => c.label === "Rejestracja testowa")!;
      expect(used.usedCount).toBe(1);

      // Bezpośrednie wywołanie API Supabase z pominięciem aplikacji też jest blokowane w bazie
      const direct = await anonClient().auth.signUp({ email: `direct-${stamp}@example.test`, password: "Haslo-Testowe-123" });
      expect(direct.error).not.toBeNull();
    } finally {
      value(await setSignupMode(admin, { mode: original }));
    }
  });
});
