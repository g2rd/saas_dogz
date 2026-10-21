import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { listNotifications } from "@/modules/notifications/application/notifications";
import { processOutbox, type OutboxDeps } from "@/modules/notifications/application/process-outbox";
import { cancelPackage, listClientPackages, sellPackage } from "@/modules/packages/application/packages";
import { getClientBalance, listClientCharges, listClientPayments, recordPayment, voidPayment } from "@/modules/payments/application/payments";
import { systemClock } from "@/shared/clock";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { addDaysIso, isoDate } from "@/shared/dates";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import {
  cancelSession,
  completeSession,
  createSessionType,
  listClientSessions,
  restoreCanceledSession,
  scheduleSession,
  undoCompleteSession,
} from "./scheduling";

let owner: TestUser;
let userAnna: TestUser;
let userPiotr: TestUser;
let orgA: string;
let ctx: RequestContext;
let annaId: string;
let piotrId: string;
let sessionTypeId: string;
let packageId: string;

const deps = (): OutboxDeps => ({
  db: adminClient(),
  email: { send: async () => ({ status: "sent" }) },
  push: { send: async () => ({ status: "skipped", detail: "test" }) },
  baseUrl: "http://localhost:3000",
  now: () => new Date(),
});

/** Zdejmuje 30-sekundowe opóźnienie (okno „Cofnij”) i przetwarza outbox, jakby okno minęło. */
async function afterUndoWindow() {
  await adminClient().from("outbox_events").update({ not_before: null }).is("processed_at", null);
  for (let i = 0; i < 10; i++) {
    const run = await processOutbox(deps(), { limit: 100, runDailyRules: false });
    if (run.claimed === 0) return;
  }
}

async function pendingEvents(type: string, key: string, id: string) {
  const { data } = await adminClient()
    .from("outbox_events")
    .select("id, payload")
    .eq("organization_id", orgA)
    .eq("type", type)
    .is("processed_at", null);
  return (data ?? []).filter((e) => (e.payload as Record<string, unknown>)[key] === id);
}

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const clientCtx = (user: TestUser, clientId: string): ClientRequestContext => ({
  userId: user.id,
  organizationId: orgA,
  clientId,
  db: user.db,
  clock: systemClock,
});

const balanceOf = async () => value(await listClientPackages(ctx, annaId)).find((p) => p.id === packageId)!.balance;
const titlesFor = async (user: TestUser, clientId: string) => value(await listNotifications(clientCtx(user, clientId))).map((n) => n.title);

async function schedule(clientId: string, date: string, time = "10:00") {
  value(await scheduleSession(ctx, { clientId, sessionTypeId, date, time }));
  const found = value(await listClientSessions(ctx, clientId)).upcoming.find((s) => s.startsAt.toISOString().startsWith(date));
  return found!.id;
}

beforeAll(async () => {
  [owner, userAnna, userPiotr] = await Promise.all([createTestUser("un-owner"), createTestUser("un-anna"), createTestUser("un-piotr")]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Cofania" }));
  ctx = contextFor(owner, orgA, "owner");
  annaId = value(await createClient(ctx, { firstName: "Anna", lastName: "Cofanie" })).id;
  piotrId = value(await createClient(ctx, { firstName: "Piotr", lastName: "Cofanie" })).id;
  await adminClient().from("client_access").insert([
    { organization_id: orgA, client_id: annaId, user_id: userAnna.id, relation: "owner" },
    { organization_id: orgA, client_id: piotrId, user_id: userPiotr.id, relation: "owner" },
  ]);
  sessionTypeId = value(await createSessionType(ctx, { name: "Trening", durationMinutes: "60", defaultPrice: "100" })).id;
  packageId = value(await sellPackage(ctx, { clientId: annaId, name: "Pakiet 5", sessionsCount: "5", price: "500", dueDate: addDaysIso(isoDate(new Date()), 7) }));
  await adminClient().from("outbox_events").update({ processed_at: new Date().toISOString() }).is("processed_at", null).neq("organization_id", orgA);
});

describe("cofnięcie zakończenia zajęć", () => {
  it("zajęcie wraca do pakietu, a niewysłane powiadomienie o niskim saldzie jest wycofane", async () => {
    const id = await schedule(annaId, "2031-06-01");
    expect(await balanceOf()).toBe(5);
    value(await completeSession(ctx, id, {}));
    expect(await balanceOf()).toBe(4);

    value(await undoCompleteSession(ctx, id));
    expect(await balanceOf()).toBe(5);
    const [session] = value(await listClientSessions(ctx, annaId)).upcoming.filter((s) => s.id === id);
    expect(session).toMatchObject({ status: "scheduled", attendance: "planned" });

    const again = await undoCompleteSession(ctx, id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "not_scheduled" });
  });

  it("zajęcia bez pakietu: należność jest anulowana, a opłaconej nie da się cofnąć, dopóki nie ma storna wpłaty", async () => {
    const id = await schedule(piotrId, "2031-06-02");
    value(await completeSession(ctx, id, { withoutPackage: "1" }));
    expect(value(await listClientCharges(ctx, piotrId))[0]).toMatchObject({ remainingMinor: 10000 });

    value(await undoCompleteSession(ctx, id));
    expect(value(await listClientCharges(ctx, piotrId))[0].status).toBe("void");

    value(await completeSession(ctx, id, { withoutPackage: "1" }));
    const paid = value(await recordPayment(ctx, { clientId: piotrId, amount: "100", method: "cash" }));

    const blocked = await undoCompleteSession(ctx, id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.details).toMatchObject({ reason: "charge_paid" });

    value(await voidPayment(ctx, paid.paymentId));
    value(await undoCompleteSession(ctx, id));
  });

  it("po północy (inny dzień) cofnięcie jest zablokowane i kieruje do korekty salda", async () => {
    const id = await schedule(annaId, "2031-06-03");
    value(await completeSession(ctx, id, {}));
    await adminClient().from("training_sessions").update({ completed_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("id", id);

    const late = await undoCompleteSession(ctx, id);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.details).toMatchObject({ reason: "undo_window" });
  });
});

describe("przywrócenie odwołanych zajęć i okno 30 sekund", () => {
  it("w oknie klient nie dostaje żadnego powiadomienia; po wysłaniu odwołania dostaje „Zajęcia przywrócone”", async () => {
    const quiet = await schedule(annaId, "2031-06-10");
    value(await cancelSession(ctx, quiet, { consume: "1" }));
    const balanceAfterCancel = await balanceOf();
    value(await restoreCanceledSession(ctx, quiet));
    expect(await balanceOf()).toBe(balanceAfterCancel + 1);
    await afterUndoWindow();
    const quietTitles = await titlesFor(userAnna, annaId);
    expect(quietTitles).not.toContain("Zajęcia odwołane");
    expect(quietTitles).not.toContain("Zajęcia przywrócone");

    const loud = await schedule(annaId, "2031-06-11");
    await afterUndoWindow(); // klient dostaje „Zaplanowano zajęcia”
    value(await cancelSession(ctx, loud, { consume: "0" }));
    await afterUndoWindow(); // okno minęło: klient dostaje „Zajęcia odwołane”
    expect(await titlesFor(userAnna, annaId)).toContain("Zajęcia odwołane");

    value(await restoreCanceledSession(ctx, loud));
    await afterUndoWindow();
    expect(await titlesFor(userAnna, annaId)).toContain("Zajęcia przywrócone");
  });

  it("zaplanowanie i odwołanie w oknie znoszą się: klient nie dowiaduje się o niczym", async () => {
    const id = await schedule(piotrId, "2031-06-12");
    value(await cancelSession(ctx, id, { consume: "0" }));
    expect(await pendingEvents("training_session.scheduled", "session_id", id)).toHaveLength(0);
    expect(await pendingEvents("training_session.canceled", "session_id", id)).toHaveLength(0);
    await afterUndoWindow();
    const titles = await titlesFor(userPiotr, piotrId);
    expect(titles.filter((t) => t.includes("12.06.2031"))).toEqual([]);
  });

  it("opóźnienie 30 s: zdarzenie z akcji trenera nie może być pobrane od razu", async () => {
    const id = await schedule(piotrId, "2031-06-13");
    const events = await pendingEvents("training_session.scheduled", "session_id", id);
    expect(events).toHaveLength(1);
    const run = await processOutbox(deps(), { limit: 100, runDailyRules: false });
    expect(run.processed).toBe(0);
    expect(await pendingEvents("training_session.scheduled", "session_id", id)).toHaveLength(1);
  });

  it("nie można przywrócić zajęć, które się już rozpoczęły, ani przywrócić nieodwołanych", async () => {
    const id = await schedule(piotrId, "2031-06-14");
    const notCanceled = await restoreCanceledSession(ctx, id);
    expect(notCanceled.ok).toBe(false);
  });
});

describe("storno wpłaty i anulowanie pakietu", () => {
  it("storno zdejmuje wpłatę z należności, zostawia ją w historii i wycofuje niewysłane powiadomienie", async () => {
    const before = value(await getClientBalance(ctx, annaId));
    const recorded = value(await recordPayment(ctx, { clientId: annaId, amount: "200", method: "cash" }));
    expect(value(await getClientBalance(ctx, annaId)).paidMinor).toBe(before.paidMinor + 20000);

    value(await voidPayment(ctx, recorded.paymentId));
    const after = value(await getClientBalance(ctx, annaId));
    expect(after.paidMinor).toBe(before.paidMinor);
    expect(after.allocatedMinor).toBe(before.allocatedMinor);

    const history = value(await listClientPayments(ctx, annaId));
    expect(history.find((p) => p.id === recorded.paymentId)?.voidedAt).toBeInstanceOf(Date);

    await afterUndoWindow();
    const titles = await titlesFor(userAnna, annaId);
    expect(titles).not.toContain("Zaksięgowano wpłatę");
    expect(titles).not.toContain("Wpłata anulowana");

    const twice = await voidPayment(ctx, recorded.paymentId);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.details).toMatchObject({ reason: "already_voided" });
  });

  it("storno po wysłaniu „Zaksięgowano wpłatę” informuje klienta o anulowaniu", async () => {
    const recorded = value(await recordPayment(ctx, { clientId: annaId, amount: "50", method: "blik" }));
    await afterUndoWindow();
    expect(await titlesFor(userAnna, annaId)).toContain("Zaksięgowano wpłatę");

    value(await voidPayment(ctx, recorded.paymentId));
    await afterUndoWindow();
    expect(await titlesFor(userAnna, annaId)).toContain("Wpłata anulowana");
  });

  it("nieużywany pakiet można anulować (z należnością), użyty nie", async () => {
    const unused = value(
      await sellPackage(ctx, { clientId: piotrId, name: "Pakiet testowy", sessionsCount: "3", price: "300", dueDate: addDaysIso(isoDate(new Date()), 7) }),
    );
    value(await cancelPackage(ctx, unused));
    const [canceled] = value(await listClientPackages(ctx, piotrId)).filter((p) => p.id === unused);
    expect(canceled.status).toBe("canceled");

    const used = await cancelPackage(ctx, packageId);
    expect(used.ok).toBe(false);
    if (!used.ok) expect(used.error.details).toMatchObject({ reason: "package_used" });
  });
});
