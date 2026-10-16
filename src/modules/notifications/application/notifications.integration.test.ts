import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import { acceptInvitation, createClientInvitation } from "@/modules/invitations/application/invitations";
import { sellPackage } from "@/modules/packages/application/packages";
import { completeSession, createSessionType, scheduleSession, listClientSessions } from "@/modules/scheduling/application/scheduling";
import { systemClock } from "@/shared/clock";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { addDaysIso, isoDate } from "@/shared/dates";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import { emailCountTo, waitForEmailTo } from "@/shared/testing/mailpit";
import { createEmailSender } from "../infrastructure/senders";
import type { EmailMessage, EmailSender, PushSender } from "./ports";
import {
  countNewClientRequests,
  countUnreadNotifications,
  createClientRequest,
  getNotificationPreferences,
  listClientRequests,
  listMyOpenRequests,
  listNotifications,
  markAllNotificationsRead,
  markClientRequestSeen,
  markNotificationRead,
  saveNotificationPreferences,
  savePushSubscription,
} from "./notifications";
import { processOutbox, type OutboxDeps } from "./process-outbox";

let owner: TestUser;
let clientUser: TestUser;
let familyUser: TestUser;
let otherOwner: TestUser;
let orgA: string;
let orgB: string;
let ctx: RequestContext;
let annaId: string;
let packageId: string;
let sessionTypeId: string;

const emails: EmailMessage[] = [];
let failEmailTo: string | null = null;

const fakeEmail: EmailSender = {
  async send(message) {
    if (failEmailTo === message.to) throw new Error("smtp down");
    emails.push(message);
    return { status: "sent" };
  },
};
const pushSent: { endpoint: string; title: string }[] = [];
const fakePush: PushSender = {
  async send(target, payload) {
    if (target.endpoint.includes("gone")) return { status: "skipped", gone: true, detail: "wygasła" };
    pushSent.push({ endpoint: target.endpoint, title: payload.title });
    return { status: "sent" };
  },
};

const deps = (overrides: Partial<OutboxDeps> = {}): OutboxDeps => ({
  db: adminClient(),
  email: fakeEmail,
  push: fakePush,
  baseUrl: "http://localhost:3000",
  now: () => new Date(),
  ...overrides,
});

/** Przetwarza outbox, aż nie będzie nic do pobrania (zdarzenia zablokowane po błędzie czekają na odblokowanie). */
async function drain(overrides: Partial<OutboxDeps> = {}, runDailyRules = false) {
  for (let i = 0; i < 12; i++) {
    const run = await processOutbox(deps(overrides), { limit: 100, runDailyRules: runDailyRules && i === 0 });
    if (run.claimed === 0) return;
  }
}

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const clientCtx = (user: TestUser): ClientRequestContext => ({
  userId: user.id,
  organizationId: orgA,
  clientId: annaId,
  db: user.db,
  clock: systemClock,
});

const titles = async (scope: RequestContext | ClientRequestContext) => value(await listNotifications(scope)).map((n) => n.title);

async function eventsFor(type: string) {
  const { data } = await adminClient().from("outbox_events").select("*").eq("organization_id", orgA).eq("type", type).order("created_at");
  return (data ?? []) as { id: string; processed_at: string | null; attempts: number; last_error: string | null; payload: Record<string, unknown> }[];
}

beforeAll(async () => {
  [owner, clientUser, familyUser, otherOwner] = await Promise.all([
    createTestUser("nt-owner"),
    createTestUser("nt-client"),
    createTestUser("nt-family"),
    createTestUser("nt-other"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Powiadomień" }));
  orgB = value(await createOrganization(otherOwner.db, { name: "Inna Szkoła" }));
  ctx = contextFor(owner, orgA, "owner");

  annaId = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska", email: clientUser.email, phone: "600100200" })).id;
  await adminClient().from("client_access").insert([
    { organization_id: orgA, client_id: annaId, user_id: clientUser.id, relation: "owner" },
    { organization_id: orgA, client_id: annaId, user_id: familyUser.id, relation: "family" },
  ]);
  packageId = value(
    await sellPackage(ctx, { clientId: annaId, name: "Pakiet 3", sessionsCount: "3", price: "240", dueDate: addDaysIso(isoDate(new Date()), 7) }),
  );
  sessionTypeId = value(await createSessionType(ctx, { name: "Trening", durationMinutes: "60", defaultPrice: "80" })).id;

  // Zdarzenia z innych testów i danych deweloperskich nie mogą zakłócać przebiegu
  await adminClient().from("outbox_events").update({ processed_at: new Date().toISOString() }).is("processed_at", null).neq("organization_id", orgA);
});

describe("niski stan pakietu: powiadomienia do obu stron", () => {
  it("klient dostaje powiadomienie z akcjami, trener informację, a e-mail trafia do Mailpit", async () => {
    value(await scheduleSession(ctx, { clientId: annaId, sessionTypeId, date: "2030-06-17", time: "10:00" }));
    const session = value(await listClientSessions(ctx, annaId)).upcoming[0];
    value(await completeSession(ctx, session.id, {}));

    // Prawdziwy nadawca e-mail (Mailpit); pozostałe kanały atrapy
    await drain({ email: createEmailSender() });

    const forClient = value(await listNotifications(clientCtx(clientUser)));
    const lowBalance = forClient.find((n) => n.type === "client_package.low_balance");
    expect(lowBalance).toMatchObject({ title: "Zostały Ci 2 zajęcia", audience: "client", link: "/portal", read: false });
    expect(lowBalance?.data).toMatchObject({ packageId, balance: 2, actions: ["renew", "pay", "end"] });

    // Konto rodzinne też dostaje powiadomienie; obcy nic nie widzi
    expect(await titles(clientCtx(familyUser))).toContain("Zostały Ci 2 zajęcia");
    expect(value(await listNotifications({ ...ctx, userId: otherOwner.id, organizationId: orgB, db: otherOwner.db }))).toEqual([]);

    const forTrainer = value(await listNotifications(ctx));
    expect(forTrainer.find((n) => n.type === "client_package.low_balance")).toMatchObject({
      title: "Kończy się pakiet: Anna Kowalska",
      audience: "staff",
    });

    const mail = await waitForEmailTo(clientUser.email);
    expect(mail.subject).toBe("Zostały Ci 2 zajęcia");
    expect(mail.text).toContain("http://localhost:3000/portal");

    const [event] = await eventsFor("client_package.low_balance");
    expect(event.processed_at).not.toBeNull();
  });

  it("jest idempotentne: ponowne przetworzenie nie dubluje powiadomień ani wiadomości", async () => {
    const before = value(await listNotifications(clientCtx(clientUser))).length;
    const mailsBefore = await emailCountTo(clientUser.email);

    await adminClient().from("outbox_events").update({ processed_at: null, locked_until: null, attempts: 0 }).eq("organization_id", orgA);
    await drain({ email: createEmailSender() });

    expect(value(await listNotifications(clientCtx(clientUser))).length).toBe(before);
    expect(await emailCountTo(clientUser.email)).toBe(mailsBefore);
  });

  it("oznacza jako przeczytane pojedynczo i zbiorczo, a cudzych nie rusza", async () => {
    const [first] = value(await listNotifications(clientCtx(clientUser)));
    expect(value(await countUnreadNotifications(clientCtx(clientUser)))).toBeGreaterThan(0);

    value(await markNotificationRead(clientCtx(familyUser), first.id)); // cudze: bez efektu
    expect(value(await listNotifications(clientCtx(clientUser))).find((n) => n.id === first.id)?.read).toBe(false);

    value(await markNotificationRead(clientCtx(clientUser), first.id));
    expect(value(await listNotifications(clientCtx(clientUser))).find((n) => n.id === first.id)?.read).toBe(true);

    value(await markAllNotificationsRead(clientCtx(clientUser)));
    expect(value(await countUnreadNotifications(clientCtx(clientUser)))).toBe(0);
    expect(value(await countUnreadNotifications(clientCtx(familyUser)))).toBeGreaterThan(0);
  });
});

describe("prośby klienta", () => {
  it("klient odpowiada „Odnów pakiet”, trener dostaje powiadomienie, a powtórka nie tworzy duplikatu", async () => {
    const created = value(await createClientRequest(clientCtx(clientUser), { kind: "renew", packageId, note: "Chcę kolejne 10" }));
    expect(created).toMatchObject({ created: true, kind: "renew" });

    const again = value(await createClientRequest(clientCtx(familyUser), { kind: "renew", packageId }));
    expect(again).toMatchObject({ created: false, id: created.id });

    expect(value(await listMyOpenRequests(clientCtx(clientUser))).map((r) => r.kind)).toEqual(["renew"]);

    await drain();
    const forTrainer = value(await listNotifications(ctx));
    expect(forTrainer.find((n) => n.type === "client_request.created")).toMatchObject({
      title: "Anna Kowalska chce odnowić pakiet",
      body: "Pakiet „Pakiet 3”. Chcę kolejne 10",
      link: "/app/requests",
    });

    const requests = value(await listClientRequests(ctx, { status: "new" }));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ clientName: "Anna Kowalska", kind: "renew", packageName: "Pakiet 3", note: "Chcę kolejne 10" });
    expect(value(await countNewClientRequests(ctx))).toBe(1);
  });

  it("walidacja: odnowienie wymaga pakietu, nieznany rodzaj jest odrzucony", async () => {
    const noPackage = await createClientRequest(clientCtx(clientUser), { kind: "renew" });
    expect(noPackage.ok).toBe(false);
    const bad = await createClientRequest(clientCtx(clientUser), { kind: "refund" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("validation");
  });

  it("klient nie może odpowiadać za cudzy pakiet ani w cudzej organizacji", async () => {
    const foreignPackage = await createClientRequest(clientCtx(clientUser), {
      kind: "renew",
      packageId: "99999999-9999-4999-8999-999999999999",
    });
    expect(foreignPackage.ok).toBe(false);

    const otherOrg = await createClientRequest({ ...clientCtx(clientUser), organizationId: orgB }, { kind: "end" });
    expect(otherOrg.ok).toBe(false);
    if (!otherOrg.ok) expect(otherOrg.error.code).toBe("forbidden");
  });

  it("trener oznacza prośbę jako obejrzaną; obca organizacja jej nie widzi", async () => {
    const foreign = contextFor(otherOwner, orgB, "owner");
    expect(value(await listClientRequests(foreign))).toEqual([]);

    const [request] = value(await listClientRequests(ctx, { status: "new" }));
    value(await markClientRequestSeen(foreign, request.id)); // bez efektu
    expect(value(await countNewClientRequests(ctx))).toBe(1);

    value(await markClientRequestSeen(ctx, request.id));
    expect(value(await countNewClientRequests(ctx))).toBe(0);
    expect(value(await listClientRequests(ctx, { status: "seen" }))).toHaveLength(1);
    expect(value(await listMyOpenRequests(clientCtx(clientUser)))).toEqual([]);
  });
});

describe("kanały i preferencje", () => {
  it("domyślnie push i e-mail; zapis preferencji zmienia kanały", async () => {
    expect(value(await getNotificationPreferences(ctx))).toMatchObject({ preferences: { push: true, email: true }, pushDevices: 0 });

    value(await saveNotificationPreferences(clientCtx(clientUser), { push: true, email: false }));
    expect(value(await getNotificationPreferences(clientCtx(clientUser))).preferences).toEqual({ push: true, email: false });

    const invalid = await saveNotificationPreferences(ctx, { push: "tak" });
    expect(invalid.ok).toBe(false);
  });

  it("wysyła push na urządzenia, usuwa wygasłe, a e-mail nie wychodzi przy wyłączonym kanale", async () => {
    value(
      await savePushSubscription(clientCtx(clientUser), {
        endpoint: "https://push.example.test/alive",
        keys: { p256dh: "BKey", auth: "authkey" },
      }),
    );
    value(
      await savePushSubscription(clientCtx(clientUser), {
        endpoint: "https://push.example.test/gone",
        keys: { p256dh: "BKey", auth: "authkey" },
      }),
    );
    expect(value(await getNotificationPreferences(clientCtx(clientUser))).pushDevices).toBe(2);

    emails.length = 0;
    value(await createClientRequest(clientCtx(familyUser), { kind: "end", note: "" }));
    value(await scheduleSession(ctx, { clientId: annaId, sessionTypeId, date: "2030-06-20", time: "09:00" }));
    await drain();

    const toClient = emails.filter((m) => m.to === clientUser.email);
    expect(toClient).toEqual([]);
    expect(pushSent.some((p) => p.endpoint.endsWith("/alive") && p.title === "Zaplanowano zajęcia")).toBe(true);
    // Wygasła subskrypcja jest usuwana
    expect(value(await getNotificationPreferences(clientCtx(clientUser))).pushDevices).toBe(1);
  });
});

describe("niepowodzenia i ponowienia", () => {
  it("błąd kanału zostawia zdarzenie do ponowienia i nie wysyła ponownie tego, co już dotarło", async () => {
    value(await saveNotificationPreferences(clientCtx(clientUser), { push: false, email: true }));
    value(await saveNotificationPreferences(ctx, { push: false, email: true }));

    emails.length = 0;
    failEmailTo = owner.email;
    value(await createClientRequest(clientCtx(clientUser), { kind: "pay", packageId }));
    await drain();

    const [event] = (await eventsFor("client_request.created")).filter((e) => e.payload.kind === "pay");
    expect(event.processed_at).toBeNull();
    expect(event.attempts).toBe(1);
    expect(event.last_error).toContain("smtp down");

    const { data: failedLog } = await adminClient().from("notification_log").select("status, channel").eq("status", "failed");
    expect(failedLog?.some((row) => row.channel === "email")).toBe(true);

    // Awaria ustąpiła; po wygaśnięciu blokady zdarzenie jest ponawiane
    failEmailTo = null;
    await adminClient().from("outbox_events").update({ locked_until: null }).eq("id", event.id);
    await drain();

    const [retried] = (await eventsFor("client_request.created")).filter((e) => e.payload.kind === "pay");
    expect(retried.processed_at).not.toBeNull();
    expect(retried.attempts).toBe(2);
    expect(emails.filter((m) => m.to === owner.email)).toHaveLength(1);
  });

  it("po 5 nieudanych próbach zdarzenie zalega i jest liczone do alertu", async () => {
    failEmailTo = owner.email;
    value(await createClientRequest(clientCtx(clientUser), { kind: "pay" }));
    for (let i = 0; i < 6; i++) {
      await adminClient().from("outbox_events").update({ locked_until: null }).eq("organization_id", orgA).is("processed_at", null);
      await processOutbox(deps(), { limit: 100, runDailyRules: false });
    }
    failEmailTo = null;

    const stuck = (await eventsFor("client_request.created")).filter((e) => e.payload.kind === "pay" && !e.payload.client_package_id);
    expect(stuck[0].processed_at).toBeNull();
    expect(stuck[0].attempts).toBe(5);

    const run = await processOutbox(deps(), { limit: 100, runDailyRules: false });
    expect(run.stuck).toBeGreaterThanOrEqual(1);
    await adminClient().from("outbox_events").update({ processed_at: new Date().toISOString() }).eq("id", stuck[0].id);
  });
});

describe("reguły dzienne", () => {
  it("zaległa należność powiadamia klienta i trenera tylko raz na tydzień zaległości", async () => {
    const { data: charge } = await adminClient()
      .from("charges")
      .insert({
        organization_id: orgA,
        client_id: annaId,
        amount_minor: 12000,
        due_date: addDaysIso(isoDate(new Date()), -3),
        description: "Zaległy trening",
      })
      .select("id")
      .single();
    expect(charge).not.toBeNull();

    await drain({}, true);
    await drain({}, true);

    const overdueForClient = value(await listNotifications(clientCtx(clientUser))).filter((n) => n.type === "charge.overdue");
    expect(overdueForClient.filter((n) => n.body.includes("Zaległy trening"))).toHaveLength(1);
    expect(overdueForClient[0].link).toBe("/portal/payments");
    expect(value(await listNotifications(ctx)).some((n) => n.title === "Płatność po terminie: Anna Kowalska")).toBe(true);
  });
});

describe("zaproszenie przyjęte przez klienta", () => {
  it("trener dostaje powiadomienie w aplikacji, push i e-mail, gdy klient zakłada konto po zeskanowaniu QR", async () => {
    const newClientId = value(await createClient(ctx, { firstName: "Ola", lastName: "Skaner" })).id;
    const invitation = value(await createClientInvitation(ctx, { clientId: newClientId, packageId: "", email: "" }));
    const newcomer = await createTestUser("nt-scan");

    // Trener ma włączony push na telefonie
    value(await saveNotificationPreferences(ctx, { push: true, email: true }));
    value(await savePushSubscription(ctx, { endpoint: "https://push.example.test/trainer-phone", keys: { p256dh: "BKey", auth: "authkey" } }));

    pushSent.length = 0;
    emails.length = 0;
    value(await acceptInvitation(newcomer.db, invitation.link.split("/invite/")[1]));
    await drain();

    const forTrainer = value(await listNotifications(ctx));
    expect(forTrainer.find((n) => n.type === "invitation.accepted" && n.title.startsWith("Ola Skaner"))).toMatchObject({
      title: "Ola Skaner dołączył(a) do panelu klienta",
      audience: "staff",
      link: `/app/clients/${newClientId}`,
    });
    expect(pushSent.some((p) => p.endpoint.endsWith("/trainer-phone") && p.title.startsWith("Ola Skaner"))).toBe(true);
    expect(emails.some((m) => m.to === owner.email && m.subject.startsWith("Ola Skaner"))).toBe(true);
  });
});

describe("izolacja", () => {
  it("personel innej organizacji nie dostaje powiadomień o klientach organizacji A", async () => {
    const foreign = value(await listNotifications({ ...ctx, userId: otherOwner.id, organizationId: orgB, db: otherOwner.db }));
    expect(foreign).toEqual([]);
    // Trener A nie widzi skrzynki klienta nawet z podmienionym identyfikatorem odbiorcy
    const { data } = await owner.db.from("notifications").select("id").eq("recipient_user_id", clientUser.id);
    expect(data).toEqual([]);
  });
});
