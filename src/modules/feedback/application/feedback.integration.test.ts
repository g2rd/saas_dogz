import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { listFeedback, setFeedbackSeen, type AdminContext } from "@/modules/platform/application/admin";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import { submitFeedback } from "./feedback";

let owner: TestUser;
let clientUser: TestUser;
let stranger: TestUser;
let orgId: string;
let admin: AdminContext;
// Baza testowa zachowuje wpisy z poprzednich uruchomień, więc nazwa szkoły jest unikalna w każdym przebiegu
const ORG_NAME = `Szkoła Opinii ${Date.now()}`;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const scope = (user: TestUser) => ({ userId: user.id, organizationId: orgId, db: user.db });

beforeAll(async () => {
  [owner, clientUser, stranger] = await Promise.all([createTestUser("fb-owner"), createTestUser("fb-client"), createTestUser("fb-stranger")]);
  orgId = value(await createOrganization(owner.db, { name: ORG_NAME }));
  const ctx = contextFor(owner, orgId, "owner");
  const clientId = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska" })).id;
  await adminClient().from("client_access").insert({ organization_id: orgId, client_id: clientId, user_id: clientUser.id, relation: "owner" });
  admin = { adminId: owner.id, db: adminClient(), now: () => new Date() };
});

describe("zgłoszenia testerów", () => {
  it("personel i klient zgłaszają problem lub pomysł; ścieżka jest czyszczona z zapytania", async () => {
    value(await submitFeedback(scope(owner), "staff", "pl", { kind: "problem", message: "Nie widzę zajęć", page: "/app/sessions?client=abc" }));
    value(await submitFeedback(scope(clientUser), "client", "en", { kind: "idea", message: "Add a week view", page: "" }));

    const { data } = await adminClient().from("feedback").select("audience, kind, page, locale, status").eq("organization_id", orgId).order("created_at");
    expect(data).toEqual([
      { audience: "staff", kind: "problem", page: "/app/sessions", locale: "pl", status: "new" },
      { audience: "client", kind: "idea", page: null, locale: "en", status: "new" },
    ]);
  });

  it("pusty tekst i nieznany rodzaj kończą się błędem walidacji", async () => {
    const empty = await submitFeedback(scope(owner), "staff", "pl", { kind: "problem", message: "   " });
    expect(empty.ok).toBe(false);
    const badKind = await submitFeedback(scope(owner), "staff", "pl", { kind: "x", message: "ok" });
    expect(badKind.ok).toBe(false);
  });

  it("limit: pięć zgłoszeń na 10 minut, szóste dostaje komunikat o limicie, a inna osoba może pisać", async () => {
    const spammer = await createTestUser("fb-spammer");
    await adminClient().from("organization_members").insert({ organization_id: orgId, user_id: spammer.id, role: "trainer" });
    for (let i = 0; i < 5; i++) {
      value(await submitFeedback(scope(spammer), "staff", "pl", { kind: "other", message: `Zgłoszenie ${i}` }));
    }
    const sixth = await submitFeedback(scope(spammer), "staff", "pl", { kind: "other", message: "Za dużo" });
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error.message).toBe("errors.db.rate_limited");
    // Limit jest per osoba: właściciel szkoły dalej może zgłaszać
    value(await submitFeedback(scope(owner), "staff", "pl", { kind: "idea", message: "Mój pomysł po limicie spamera" }));
  });

  it("RLS: obca osoba nie zgłosi w cudzej szkole, a klient nie podszyje się pod personel", async () => {
    const foreign = await submitFeedback(scope(stranger), "staff", "pl", { kind: "idea", message: "Cudza szkoła" });
    expect(foreign.ok).toBe(false);
    const asStaff = await submitFeedback(scope(clientUser), "staff", "pl", { kind: "idea", message: "Klient jako personel" });
    expect(asStaff.ok).toBe(false);
  });

  it("każdy widzi tylko swoje zgłoszenia i nie może ich zmienić", async () => {
    const own = await clientUser.db.from("feedback").select("message");
    expect(own.data).toEqual([{ message: "Add a week view" }]);
    const strangerSees = await stranger.db.from("feedback").select("id");
    expect(strangerSees.data).toEqual([]);
    const update = await owner.db.from("feedback").update({ status: "seen" }).eq("organization_id", orgId);
    expect(update.error).not.toBeNull();
  });

  it("właściciel platformy widzi zgłoszenia z nazwą szkoły i adresem autora i oznacza je jako obejrzane", async () => {
    const all = value(await listFeedback(admin)).filter((row) => row.organizationName === ORG_NAME);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.map((row) => row.message)).toEqual(expect.arrayContaining(["Nie widzę zajęć", "Add a week view"]));
    const staffEntry = all.find((row) => row.message === "Nie widzę zajęć");
    expect(staffEntry).toMatchObject({ kind: "problem", message: "Nie widzę zajęć", authorEmail: owner.email, status: "new" });

    value(await setFeedbackSeen(admin, staffEntry!.id, true));
    const after = value(await listFeedback(admin)).find((row) => row.id === staffEntry!.id);
    expect(after?.status).toBe("seen");
    value(await setFeedbackSeen(admin, staffEntry!.id, false));
    expect(value(await listFeedback(admin)).find((row) => row.id === staffEntry!.id)?.status).toBe("new");
  });
});
