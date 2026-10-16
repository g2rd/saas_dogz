import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { addDog } from "@/modules/dogs/application/dogs";
import { listClientCharges } from "@/modules/payments/application/payments";
import { listClientPackages, listPackageLedger, sellPackage } from "@/modules/packages/application/packages";
import { fixedClock } from "@/shared/clock";
import type { RequestContext } from "@/shared/context";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import {
  archiveSessionType,
  cancelSession,
  completeSession,
  createSessionType,
  getSessionAgenda,
  listClientSessions,
  listSessionTypes,
  scheduleSession,
  updateSessionType,
} from "./scheduling";

// Stały „teraz”: 2030-06-15 11:00 czasu warszawskiego (09:00 UTC).
const NOW = "2030-06-15T09:00:00Z";

let owner: TestUser;
let trainer2: TestUser;
let assistant: TestUser;
let clientUser: TestUser;
let other: TestUser;
let orgA: string;
let ctx: RequestContext;
let assistantCtx: RequestContext;
let annaId: string;
let piotrId: string;
let dogId: string;
let typeId: string;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const withClock = (c: RequestContext): RequestContext => ({ ...c, clock: fixedClock(NOW) });

async function schedule(c: RequestContext, clientId: string, date: string, time: string, extra: Record<string, unknown> = {}) {
  return scheduleSession(c, { clientId, sessionTypeId: typeId, date, time, ...extra });
}

async function newClient(name: string): Promise<string> {
  return value(await createClient(ctx, { firstName: name })).id;
}

beforeAll(async () => {
  [owner, trainer2, assistant, clientUser, other] = await Promise.all([
    createTestUser("sc-owner"),
    createTestUser("sc-trainer2"),
    createTestUser("sc-assistant"),
    createTestUser("sc-client"),
    createTestUser("sc-other"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Zajęć" }));
  ctx = withClock(contextFor(owner, orgA, "owner"));
  assistantCtx = withClock(contextFor(assistant, orgA, "assistant"));

  const admin = adminClient();
  await admin.from("organization_members").insert([
    { organization_id: orgA, user_id: trainer2.id, role: "trainer" },
    { organization_id: orgA, user_id: assistant.id, role: "assistant" },
  ]);

  annaId = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska" })).id;
  piotrId = value(await createClient(ctx, { firstName: "Piotr", lastName: "Nowak" })).id;
  dogId = value(await addDog(ctx, annaId, { name: "Burek" })).id;
  await admin
    .from("client_access")
    .insert({ organization_id: orgA, client_id: annaId, user_id: clientUser.id, relation: "owner" });

  value(await sellPackage(ctx, { clientId: annaId, name: "Pakiet 3", sessionsCount: "3", price: "300" }));
});

describe("session types", () => {
  it("creates, lists, updates and archives a session type", async () => {
    const created = value(await createSessionType(ctx, { name: "Trening indywidualny", durationMinutes: "60", defaultPrice: "100" }));
    typeId = created.id;
    expect(created).toMatchObject({ durationMinutes: 60, defaultPriceMinor: 10000, currency: "PLN" });

    const updated = value(await updateSessionType(ctx, typeId, { name: "Trening indywidualny", durationMinutes: "45", defaultPrice: "90,50" }));
    expect(updated).toMatchObject({ durationMinutes: 45, defaultPriceMinor: 9050 });
    // Wracamy do 60 min, żeby kolejne testy miały przewidywalne czasy.
    value(await updateSessionType(ctx, typeId, { name: "Trening indywidualny", durationMinutes: "60", defaultPrice: "100" }));

    const temp = value(await createSessionType(ctx, { name: "Do archiwum", durationMinutes: "30", defaultPrice: "0" }));
    value(await archiveSessionType(ctx, temp.id));
    expect(value(await listSessionTypes(ctx)).map((t) => t.id)).not.toContain(temp.id);
    expect(value(await listSessionTypes(ctx, { includeArchived: true })).map((t) => t.id)).toContain(temp.id);
  });

  it("lets only trainers manage types, the assistant can read them", async () => {
    const result = await createSessionType(assistantCtx, { name: "X", durationMinutes: "30", defaultPrice: "0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
    expect((await listSessionTypes(assistantCtx)).ok).toBe(true);
  });

  it("validates input", async () => {
    const result = await createSessionType(ctx, { name: "", durationMinutes: "2", defaultPrice: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({ name: expect.any(Array), durationMinutes: expect.any(Array), defaultPrice: expect.any(Array) });
    }
  });
});

describe("scheduling", () => {
  it("interprets date and time in the organization time zone and computes the end", async () => {
    value(await schedule(ctx, annaId, "2030-07-10", "10:00", { dogId, location: "Park" }));

    const { upcoming } = value(await listClientSessions(ctx, annaId));
    const session = upcoming.find((s) => s.startsAt.toISOString() === "2030-07-10T08:00:00.000Z");
    expect(session).toMatchObject({ status: "scheduled", dogName: "Burek", location: "Park", durationMinutes: 60 });
    expect(session?.endsAt.toISOString()).toBe("2030-07-10T09:00:00.000Z");
  });

  it("refuses overlapping sessions for the same trainer but allows another trainer or back-to-back", async () => {
    const clash = await schedule(ctx, piotrId, "2030-07-10", "10:30");
    expect(clash.ok).toBe(false);
    if (!clash.ok) {
      expect(clash.error.code).toBe("validation");
      expect(clash.error.details).toMatchObject({ time: expect.any(Array) });
    }

    expect((await schedule(ctx, piotrId, "2030-07-10", "10:30", { trainerId: trainer2.id })).ok).toBe(true);
    expect((await schedule(ctx, piotrId, "2030-07-10", "11:00")).ok).toBe(true);
  });

  it("validates dates, times and unknown ids", async () => {
    const bad = await schedule(ctx, annaId, "2030-02-31", "25:00");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.details).toMatchObject({ date: expect.any(Array), time: expect.any(Array) });

    const unknownDog = await schedule(ctx, annaId, "2030-07-20", "10:00", { dogId: "30000000-0000-4000-8000-000000000001" });
    expect(unknownDog.ok).toBe(false);
    if (!unknownDog.ok) expect(unknownDog.error.code).toBe("not_found");
  });

  it("builds the Today and Upcoming agenda in the organization time zone", async () => {
    const lena = await newClient("Lena");
    value(await schedule(ctx, lena, "2030-06-15", "18:00"));
    value(await schedule(ctx, lena, "2030-06-16", "09:00"));
    value(await schedule(ctx, lena, "2030-06-29", "09:00"));
    value(await schedule(ctx, lena, "2030-07-05", "09:00")); // poza oknem 14 dni

    const agenda = value(await getSessionAgenda(ctx));
    expect(agenda).toMatchObject({ timezone: "Europe/Warsaw", today: "2030-06-15" });

    const todayForLena = agenda.todaySessions.filter((s) => s.clientId === lena);
    expect(todayForLena).toHaveLength(1);
    expect(todayForLena[0].startsAt.toISOString()).toBe("2030-06-15T16:00:00.000Z");

    const upcomingForLena = agenda.upcoming.filter((s) => s.clientId === lena).map((s) => s.startsAt.toISOString());
    expect(upcomingForLena).toEqual(["2030-06-16T07:00:00.000Z", "2030-06-29T07:00:00.000Z"]);
  });
});

describe("completing sessions", () => {
  it("consumes one package session atomically and reports the balance", async () => {
    value(await schedule(ctx, annaId, "2030-08-01", "09:00"));
    const session = value(await listClientSessions(ctx, annaId)).upcoming.find((s) => s.startsAt.toISOString() === "2030-08-01T07:00:00.000Z")!;

    const outcome = value(await completeSession(ctx, session.id, { note: "Świetny postęp" }));
    expect(outcome).toMatchObject({ packageName: "Pakiet 3", balanceAfter: 2, chargeCreated: false });

    const [pkg] = value(await listClientPackages(ctx, annaId));
    expect(pkg.balance).toBe(2);
    const ledger = value(await listPackageLedger(ctx, pkg.id));
    expect(ledger.find((e) => e.reason === "session")).toMatchObject({ delta: -1 });

    const { recent } = value(await listClientSessions(ctx, annaId));
    expect(recent[0]).toMatchObject({ id: session.id, status: "completed", attendance: "attended", clientSummary: "Świetny postęp" });

    const again = await completeSession(ctx, session.id, {});
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "not_scheduled" });
  });

  it("refuses to complete without a package, then charges the session price when asked", async () => {
    value(await schedule(ctx, piotrId, "2030-08-02", "09:00"));
    const session = value(await listClientSessions(ctx, piotrId)).upcoming.find((s) => s.startsAt.toISOString() === "2030-08-02T07:00:00.000Z")!;

    const refused = await completeSession(ctx, session.id, {});
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.details).toMatchObject({ reason: "no_package" });

    const outcome = value(await completeSession(ctx, session.id, { withoutPackage: "1" }));
    expect(outcome).toMatchObject({ packageId: null, chargeCreated: true });

    const charge = value(await listClientCharges(ctx, piotrId)).find((c) => c.sourceType === "session" && c.sourceId === session.id);
    expect(charge).toMatchObject({ amountMinor: 10000, description: "Trening indywidualny", status: expect.stringMatching(/unpaid|overdue/) });
  });

  it("lets the assistant settle from a package but not charge", async () => {
    const klara = await newClient("Klara");
    value(await sellPackage(ctx, { clientId: klara, name: "Mały", sessionsCount: "2", price: "100" }));
    value(await schedule(ctx, klara, "2030-08-03", "09:00"));
    value(await schedule(ctx, klara, "2030-08-04", "09:00"));
    const sessions = value(await listClientSessions(ctx, klara)).upcoming;

    expect((await completeSession(assistantCtx, sessions[0].id, {})).ok).toBe(true);

    const klaraNoPackage = await newClient("Brak");
    value(await schedule(ctx, klaraNoPackage, "2030-08-05", "09:00"));
    const noPkgSession = value(await listClientSessions(ctx, klaraNoPackage)).upcoming[0];
    const charge = await completeSession(assistantCtx, noPkgSession.id, { withoutPackage: "1" });
    expect(charge.ok).toBe(false);
    if (!charge.ok) expect(charge.error.code).toBe("forbidden");
  });

  it("uses the package chosen by the trainer instead of the automatic one", async () => {
    const maria = await newClient("Maria");
    const first = value(await sellPackage(ctx, { clientId: maria, name: "Stary", sessionsCount: "2", price: "100", validityDays: "30" }));
    const second = value(await sellPackage(ctx, { clientId: maria, name: "Nowy", sessionsCount: "2", price: "100" }));
    expect(first).not.toBe(second);

    value(await schedule(ctx, maria, "2030-08-06", "09:00"));
    const session = value(await listClientSessions(ctx, maria)).upcoming[0];
    const outcome = value(await completeSession(ctx, session.id, { packageId: second }));
    expect(outcome.packageId).toBe(second);
  });

  it("never over-consumes a package when completions race for the last session", async () => {
    const zofia = await newClient("Zofia");
    value(await sellPackage(ctx, { clientId: zofia, name: "Ostatnie", sessionsCount: "1", price: "50" }));
    value(await schedule(ctx, zofia, "2030-09-01", "09:00"));
    value(await schedule(ctx, zofia, "2030-09-02", "09:00"));
    value(await schedule(ctx, zofia, "2030-09-03", "09:00"));
    const sessions = value(await listClientSessions(ctx, zofia)).upcoming;
    expect(sessions).toHaveLength(3);

    const results = await Promise.all(sessions.map((s) => completeSession(ctx, s.id, {})));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const failed of results.filter((r) => !r.ok)) {
      if (!failed.ok) expect(failed.error.details).toMatchObject({ reason: "no_package" });
    }

    const [pkg] = value(await listClientPackages(ctx, zofia));
    expect(pkg.balance).toBe(0);
  });

  it("settles a single session only once when completed twice in parallel", async () => {
    const olga = await newClient("Olga");
    value(await sellPackage(ctx, { clientId: olga, name: "Dwa", sessionsCount: "5", price: "100" }));
    value(await schedule(ctx, olga, "2030-09-10", "09:00"));
    const session = value(await listClientSessions(ctx, olga)).upcoming[0];

    const results = await Promise.all([completeSession(ctx, session.id, {}), completeSession(ctx, session.id, {}), completeSession(ctx, session.id, {})]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const [pkg] = value(await listClientPackages(ctx, olga));
    expect(pkg.balance).toBe(4);
  });
});

describe("canceling sessions", () => {
  it("applies the late-cancellation policy by default: late costs a session, early is free", async () => {
    const ewa = await newClient("Ewa");
    value(await sellPackage(ctx, { clientId: ewa, name: "Pakiet", sessionsCount: "5", price: "100" }));

    value(await schedule(ctx, ewa, "2030-06-15", "16:00")); // za 5 h względem NOW: późne
    value(await schedule(ctx, ewa, "2030-06-25", "16:00")); // za 10 dni: wczesne
    const [late, early] = value(await listClientSessions(ctx, ewa)).upcoming;

    expect(value(await cancelSession(ctx, late.id, {}))).toMatchObject({ consumed: true, balanceAfter: 4 });
    expect(value(await cancelSession(ctx, early.id, {}))).toMatchObject({ consumed: false });

    const [pkg] = value(await listClientPackages(ctx, ewa));
    expect(pkg.balance).toBe(4);
    expect(value(await listPackageLedger(ctx, pkg.id)).some((e) => e.reason === "late_cancel")).toBe(true);
  });

  it("lets the trainer waive or force the charge, and refuses to cancel twice", async () => {
    const iga = await newClient("Iga");
    value(await sellPackage(ctx, { clientId: iga, name: "Pakiet", sessionsCount: "5", price: "100" }));
    value(await schedule(ctx, iga, "2030-06-15", "19:30")); // nie nakłada się na zajęcia z 16:00 i 18:00
    value(await schedule(ctx, iga, "2030-06-30", "10:00"));
    const [soon, later] = value(await listClientSessions(ctx, iga)).upcoming;

    expect(value(await cancelSession(ctx, soon.id, { consume: "0" })).consumed).toBe(false);
    expect(value(await cancelSession(ctx, later.id, { consume: "1" })).consumed).toBe(true);

    const again = await cancelSession(ctx, soon.id, {});
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "not_scheduled" });
  });

  it("drops canceled sessions from the agenda and frees the trainer's time", async () => {
    const jan = await newClient("Jan");
    value(await schedule(ctx, jan, "2030-06-20", "12:00"));
    const session = value(await listClientSessions(ctx, jan)).upcoming[0];
    value(await cancelSession(ctx, session.id, { consume: "0" }));

    expect(value(await getSessionAgenda(ctx)).upcoming.some((s) => s.id === session.id)).toBe(false);
    expect((await schedule(ctx, jan, "2030-06-20", "12:00")).ok).toBe(true);
  });
});

describe("access control", () => {
  it("keeps other organizations out", async () => {
    const tampered = withClock(contextFor(other, orgA, "owner"));
    const result = await schedule(tampered, annaId, "2030-10-01", "10:00");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");

    const agenda = value(await getSessionAgenda(tampered));
    expect(agenda.todaySessions).toHaveLength(0);
    expect(agenda.upcoming).toHaveLength(0);
  });

  it("shows a client only their own sessions and lets them change nothing", async () => {
    const own = await clientUser.db.from("v_session_details").select("client_id, id");
    expect(own.data?.length).toBeGreaterThan(0);
    expect(new Set(own.data?.map((s) => s.client_id))).toEqual(new Set([annaId]));

    const sessionId = own.data![0].id;
    const forge = await clientUser.db.rpc("complete_session", {
      p_org: orgA,
      p_session: sessionId,
      p_package: null,
      p_note: null,
      p_without_package: false,
    });
    expect(forge.error?.code).toBe("42501");

    const direct = await clientUser.db.from("training_sessions").update({ status: "canceled" }).eq("id", sessionId).select();
    expect(direct.data ?? []).toHaveLength(0);
  });
});
