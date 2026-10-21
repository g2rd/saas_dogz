import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { addDog } from "@/modules/dogs/application/dogs";
import { createClientRequest } from "@/modules/notifications/application/notifications";
import { listNotifications } from "@/modules/notifications/application/notifications";
import { processOutbox, type OutboxDeps } from "@/modules/notifications/application/process-outbox";
import { claimSlot, getPortalSlots, joinWaitlist, withdrawSlotClaim } from "@/modules/portal/application/slots";
import { systemClock } from "@/shared/clock";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import { acceptSlotClaim, closeSlotOffer, createSlotOffer, listOpenSlotOffers } from "./slots";
import { cancelSession, createSessionType, listClientSessions, scheduleSession } from "./scheduling";

let owner: TestUser;
let outsider: TestUser;
let userAnna: TestUser;
let userPiotr: TestUser;
let userMarta: TestUser;
let userOla: TestUser;
let orgA: string;
let orgB: string;
let ctx: RequestContext;
let annaId: string;
let piotrId: string;
let martaId: string;
let olaId: string;
let piotrDogId: string;
let sessionTypeId: string;
let canceledSessionId: string;

const pushSent: { endpoint: string; title: string }[] = [];
const deps = (): OutboxDeps => ({
  db: adminClient(),
  email: { send: async () => ({ status: "sent" }) },
  push: {
    send: async (target, payload) => {
      pushSent.push({ endpoint: target.endpoint, title: payload.title });
      return { status: "sent" };
    },
  },
  baseUrl: "http://localhost:3000",
  now: () => new Date(),
});

async function drain() {
  // Zdarzenia z akcji trenera czekają 30 s (okno „Cofnij”); w testach zdejmujemy to opóźnienie
  await adminClient().from("outbox_events").update({ not_before: null }).is("processed_at", null);
  for (let i = 0; i < 10; i++) {
    const run = await processOutbox(deps(), { limit: 100, runDailyRules: false });
    if (run.claimed === 0) return;
  }
}

/**
 * Przetwarza outbox i sprawdza warunek, ponawiając do skutku. Inny proces (np. pętla `outbox:run` albo `next dev`
 * uruchomione przez dewelopera) może w tym samym czasie zablokować zdarzenia, więc sam jednorazowy przebieg bywa za mało.
 */
async function eventually(check: () => Promise<void>, timeoutMs = 12_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      await drain();
      await check();
      return;
    } catch (error) {
      if (Date.now() > end) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const clientCtx = (user: TestUser, clientId: string, organizationId = orgA): ClientRequestContext => ({
  userId: user.id,
  organizationId,
  clientId,
  db: user.db,
  clock: systemClock,
});

const titlesFor = async (user: TestUser, clientId: string) =>
  value(await listNotifications(clientCtx(user, clientId))).map((n) => n.title);

async function newClientWithAccess(firstName: string, user: TestUser): Promise<string> {
  const id = value(await createClient(ctx, { firstName, lastName: "Test" })).id;
  await adminClient().from("client_access").insert({ organization_id: orgA, client_id: id, user_id: user.id, relation: "owner" });
  return id;
}

beforeAll(async () => {
  [owner, outsider, userAnna, userPiotr, userMarta, userOla] = await Promise.all([
    createTestUser("sl-owner"),
    createTestUser("sl-outsider"),
    createTestUser("sl-anna"),
    createTestUser("sl-piotr"),
    createTestUser("sl-marta"),
    createTestUser("sl-ola"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Wolnych Terminów" }));
  orgB = value(await createOrganization(outsider.db, { name: "Inna Szkoła" }));
  ctx = contextFor(owner, orgA, "owner");

  [annaId, piotrId, martaId, olaId] = await Promise.all([
    newClientWithAccess("Anna", userAnna),
    newClientWithAccess("Piotr", userPiotr),
    newClientWithAccess("Marta", userMarta),
    newClientWithAccess("Ola", userOla),
  ]);
  piotrDogId = value(await addDog(ctx, piotrId, { name: "Luna" })).id;
  sessionTypeId = value(await createSessionType(ctx, { name: "Trening", durationMinutes: "60", defaultPrice: "100" })).id;

  // Trener ma włączony push, żeby zobaczyć powiadomienia o zgłoszeniach
  await adminClient().from("push_subscriptions").insert({
    user_id: owner.id,
    endpoint: "https://push.example.test/trainer-slots",
    p256dh: "BKey",
    auth: "authkey",
  });
  await adminClient().from("outbox_events").update({ processed_at: new Date().toISOString() }).is("processed_at", null).neq("organization_id", orgA);
});

describe("ogłaszanie wolnego terminu", () => {
  it("tylko odwołane, przyszłe zajęcia można ogłosić, i tylko raz", async () => {
    value(await scheduleSession(ctx, { clientId: annaId, sessionTypeId, date: "2031-05-10", time: "17:00" }));
    const session = value(await listClientSessions(ctx, annaId)).upcoming[0];
    canceledSessionId = session.id;

    const tooEarly = await createSlotOffer(ctx, { sessionId: session.id, note: "" });
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.details).toMatchObject({ reason: "not_free_slot" });

    value(await cancelSession(ctx, session.id, { consume: "0" }));
    const offered = value(await createSlotOffer(ctx, { sessionId: session.id, note: "Zwolnił się termin" }));
    expect(offered.offerId).toBeTruthy();

    const twice = await createSlotOffer(ctx, { sessionId: session.id, note: "" });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.details).toMatchObject({ reason: "offer_exists" });
  });

  it("obca organizacja nie może ogłaszać ani widzieć ogłoszeń", async () => {
    const foreign = contextFor(outsider, orgB, "owner");
    expect((await createSlotOffer(foreign, { sessionId: canceledSessionId, note: "" })).ok).toBe(false);
    expect(value(await listOpenSlotOffers(foreign))).toEqual([]);
  });
});

describe("lista chętnych i powiadomienia", () => {
  it("klient poza listą nie widzi ofert ani nie może zgłosić „Biorę”", async () => {
    const slots = value(await getPortalSlots(clientCtx(userPiotr, piotrId)));
    expect(slots).toMatchObject({ onWaitlist: false, offers: [] });

    const [offer] = value(await listOpenSlotOffers(ctx));
    const attempt = await claimSlot(clientCtx(userPiotr, piotrId), { offerId: offer.id, dogId: "" });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe("forbidden");
  });

  it("zapisani dostają powiadomienie o wolnym terminie, a klient, który odwołał, nie", async () => {
    for (const [user, id] of [
      [userAnna, annaId],
      [userPiotr, piotrId],
      [userMarta, martaId],
    ] as const) {
      value(await joinWaitlist(clientCtx(user, id)));
    }
    // Ola nie jest na liście
    pushSent.length = 0;
    for (const user of [userPiotr, userMarta]) {
      await adminClient().from("push_subscriptions").insert({
        user_id: user.id,
        endpoint: `https://push.example.test/${user.id}`,
        p256dh: "BKey",
        auth: "authkey",
      });
    }

    // Ogłoszenie zostało utworzone przed zapisem na listę, więc przetwarzamy je od nowa
    await adminClient()
      .from("outbox_events")
      .update({ processed_at: null, locked_until: null, attempts: 0 })
      .eq("organization_id", orgA)
      .eq("type", "slot_offer.created");
    await eventually(async () => {
      expect(await titlesFor(userPiotr, piotrId)).toContain("Wolny termin: 10.05.2031 o 17:00");
      expect(await titlesFor(userMarta, martaId)).toContain("Wolny termin: 10.05.2031 o 17:00");
    });
    expect((await titlesFor(userAnna, annaId)).some((t) => t.startsWith("Wolny termin"))).toBe(false);
    expect((await titlesFor(userOla, olaId)).some((t) => t.startsWith("Wolny termin"))).toBe(false);
  });
});

describe("zgłoszenia „Biorę” i wybór trenera", () => {
  it("trener widzi kolejność zgłoszeń, a klient tylko własne", async () => {
    const [offer] = value(await listOpenSlotOffers(ctx));
    const slotsPiotr = value(await getPortalSlots(clientCtx(userPiotr, piotrId)));
    expect(slotsPiotr.offers).toHaveLength(1);
    expect(slotsPiotr.dogs).toEqual([{ id: piotrDogId, name: "Luna" }]);

    expect(value(await claimSlot(clientCtx(userPiotr, piotrId), { offerId: offer.id, dogId: piotrDogId }))).toMatchObject({ created: true });
    expect(value(await claimSlot(clientCtx(userPiotr, piotrId), { offerId: offer.id, dogId: piotrDogId }))).toMatchObject({ created: false });
    value(await claimSlot(clientCtx(userMarta, martaId), { offerId: offer.id, dogId: "" }));

    const [withClaims] = value(await listOpenSlotOffers(ctx));
    expect(withClaims.claims.map((c) => c.clientName)).toEqual(["Piotr Test", "Marta Test"]);
    expect(withClaims.claims[0].dogName).toBe("Luna");

    const mine = value(await getPortalSlots(clientCtx(userMarta, martaId)));
    expect(mine.offers[0].myClaim).not.toBeNull();

    await eventually(async () => {
      expect(value(await listNotifications(ctx)).filter((n) => n.type === "slot_claim.created").map((n) => n.title)).toEqual(
        expect.arrayContaining(["Piotr Test chce wolny termin", "Marta Test chce wolny termin"]),
      );
    });
  });

  it("klient nie może zgłosić się za kogoś innego, a zgłoszenie można wycofać i ponowić", async () => {
    const [offer] = value(await listOpenSlotOffers(ctx));
    const forged = await claimSlot({ ...clientCtx(userMarta, martaId), clientId: piotrId }, { offerId: offer.id, dogId: "" });
    expect(forged.ok).toBe(false);

    const marta = value(await getPortalSlots(clientCtx(userMarta, martaId))).offers[0].myClaim!;
    value(await withdrawSlotClaim(clientCtx(userMarta, martaId), marta.id));
    expect(value(await listOpenSlotOffers(ctx))[0].claims.map((c) => c.clientName)).toEqual(["Piotr Test"]);
    value(await claimSlot(clientCtx(userMarta, martaId), { offerId: offer.id, dogId: "" }));
    expect(value(await listOpenSlotOffers(ctx))[0].claims.map((c) => c.clientName)).toEqual(["Piotr Test", "Marta Test"]);
  });

  it("trener wybiera drugą osobę: powstają zajęcia, wybrana dostaje komunikat, pozostała informację o zajęciu", async () => {
    pushSent.length = 0;
    const [offer] = value(await listOpenSlotOffers(ctx));
    const marta = offer.claims.find((c) => c.clientName === "Marta Test")!;

    const outsiderTry = await acceptSlotClaim(contextFor(outsider, orgB, "owner"), marta.id);
    expect(outsiderTry.ok).toBe(false);

    const { sessionId } = value(await acceptSlotClaim(ctx, marta.id));
    const sessions = value(await listClientSessions(ctx, martaId)).upcoming;
    expect(sessions.map((s) => s.id)).toContain(sessionId);
    expect(sessions.find((s) => s.id === sessionId)).toMatchObject({ status: "scheduled" });

    expect(value(await listOpenSlotOffers(ctx))).toEqual([]);

    await eventually(async () => {
      expect(await titlesFor(userMarta, martaId)).toContain("Miejsce jest dla Ciebie!");
      expect(await titlesFor(userPiotr, piotrId)).toContain("Termin został zajęty");
    });

    const again = await acceptSlotClaim(ctx, marta.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "offer_closed" });
  });

  it("zamknięcie ogłoszenia odrzuca oczekujące zgłoszenia", async () => {
    value(await scheduleSession(ctx, { clientId: annaId, sessionTypeId, date: "2031-05-11", time: "17:00" }));
    const session = value(await listClientSessions(ctx, annaId)).upcoming.find((s) => s.startsAt.toISOString().startsWith("2031-05-11"))!;
    value(await cancelSession(ctx, session.id, { consume: "0" }));
    const { offerId } = value(await createSlotOffer(ctx, { sessionId: session.id, note: "" }));

    value(await claimSlot(clientCtx(userPiotr, piotrId), { offerId, dogId: "" }));
    value(await closeSlotOffer(ctx, offerId));
    expect(value(await listOpenSlotOffers(ctx))).toEqual([]);
    expect(value(await getPortalSlots(clientCtx(userPiotr, piotrId))).offers).toEqual([]);

    await eventually(async () => {
      expect((await titlesFor(userPiotr, piotrId)).filter((t) => t === "Termin został zajęty").length).toBe(2);
    });
  });

  it("ogłoszenie z minionym terminem znika z listy trenera, a wybór zgłoszenia zwraca błąd zamiast wyjątku", async () => {
    value(await scheduleSession(ctx, { clientId: annaId, sessionTypeId, date: "2031-05-13", time: "17:00" }));
    const session = value(await listClientSessions(ctx, annaId)).upcoming.find((s) => s.startsAt.toISOString().startsWith("2031-05-13"))!;
    value(await cancelSession(ctx, session.id, { consume: "0" }));
    const { offerId } = value(await createSlotOffer(ctx, { sessionId: session.id, note: "" }));
    value(await claimSlot(clientCtx(userPiotr, piotrId), { offerId, dogId: "" }));
    const claim = value(await listOpenSlotOffers(ctx)).find((o) => o.id === offerId)!.claims[0];

    // Termin mija, zanim trener zdąży wybrać zgłoszenie
    await adminClient()
      .from("slot_offers")
      .update({ starts_at: "2020-01-01T10:00:00Z", ends_at: "2020-01-01T11:00:00Z" })
      .eq("id", offerId);

    expect(value(await listOpenSlotOffers(ctx)).map((o) => o.id)).not.toContain(offerId);
    const late = await acceptSlotClaim(ctx, claim.id);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.details).toMatchObject({ reason: "offer_closed" });
    await closeSlotOffer(ctx, offerId);
  });
});

describe("„Nie mogę przyjść”", () => {
  it("klient zgłasza trenerowi, że nie może przyjść; trener dostaje powiadomienie z terminem", async () => {
    value(await scheduleSession(ctx, { clientId: olaId, sessionTypeId, date: "2031-05-12", time: "09:00" }));
    const session = value(await listClientSessions(ctx, olaId)).upcoming[0];

    const created = value(await createClientRequest(clientCtx(userOla, olaId), { kind: "cancel", sessionId: session.id, note: "Choroba" }));
    expect(created).toMatchObject({ created: true, kind: "cancel" });
    expect(value(await createClientRequest(clientCtx(userOla, olaId), { kind: "cancel", sessionId: session.id }))).toMatchObject({ created: false });

    await eventually(async () => {
      const forTrainer = value(await listNotifications(ctx));
      expect(forTrainer.find((n) => n.title === "Ola Test nie może przyjść na zajęcia")).toMatchObject({
        body: "Zajęcia 12.05.2031 o 09:00. Choroba",
        link: "/app/requests",
      });
    });
  });

  it("nie można zgłosić cudzych zajęć ani rodzaju bez zajęć", async () => {
    const [ola] = value(await listClientSessions(ctx, olaId)).upcoming;
    const foreign = await createClientRequest(clientCtx(userPiotr, piotrId), { kind: "cancel", sessionId: ola.id });
    expect(foreign.ok).toBe(false);

    const noSession = await createClientRequest(clientCtx(userPiotr, piotrId), { kind: "cancel" });
    expect(noSession.ok).toBe(false);
  });
});
