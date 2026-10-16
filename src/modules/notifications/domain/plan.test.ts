import { describe, expect, it } from "vitest";
import { enabledChannels } from "./notification";
import { isNotifiable, planNotifications, renderExternalMessage, sessionsWord, type EventFacts } from "./plan";

const facts = (overrides: Partial<EventFacts> = {}): EventFacts => ({
  clientId: "client-1",
  clientName: "Anna Kowalska",
  clientUserIds: ["client-user"],
  staffUserIds: ["trainer-1", "owner-1"],
  timezone: "Europe/Warsaw",
  package: { id: "pkg-1", name: "Pakiet 10", balance: 2 },
  charge: null,
  session: null,
  request: null,
  offer: null,
  ...overrides,
});

const event = (type: string, payload: Record<string, unknown> = {}) => ({
  id: "evt-1",
  organizationId: "org-1",
  type,
  payload,
  attempts: 1,
});

describe("sessionsWord", () => {
  it.each([
    [1, "zajęcie"],
    [2, "zajęcia"],
    [4, "zajęcia"],
    [5, "zajęć"],
    [12, "zajęć"],
    [22, "zajęcia"],
    [0, "zajęć"],
  ])("%i -> %s", (count, word) => expect(sessionsWord(count)).toBe(word));
});

describe("planNotifications: niski stan pakietu", () => {
  it("powiadamia klienta z akcjami i personel o kończącym się pakiecie", () => {
    const drafts = planNotifications(event("client_package.low_balance"), facts());
    const client = drafts.filter((d) => d.audience === "client");
    const staff = drafts.filter((d) => d.audience === "staff");

    expect(client).toHaveLength(1);
    expect(client[0].recipientUserId).toBe("client-user");
    expect(client[0].title).toBe("Zostały Ci 2 zajęcia");
    expect(client[0].data.actions).toEqual(["renew", "pay", "end"]);
    expect(client[0].link).toBe("/portal");
    expect(staff.map((d) => d.recipientUserId)).toEqual(["trainer-1", "owner-1"]);
    expect(staff[0].title).toBe("Kończy się pakiet: Anna Kowalska");
    expect(staff[0].link).toBe("/app/clients/client-1");
  });

  it("odmienia ostatnie zajęcie i koniec pakietu", () => {
    const last = planNotifications(event("client_package.low_balance"), facts({ package: { id: "p", name: "X", balance: 1 } }));
    expect(last[0].title).toBe("Zostało Ci ostatnie zajęcie");

    const empty = planNotifications(event("client_package.low_balance"), facts({ package: { id: "p", name: "X", balance: 0 } }));
    expect(empty[0].title).toBe("Pakiet się skończył");
    expect(empty[0].body).toContain("nie ma już wolnych zajęć");
  });

  it("używa identyfikatora zdarzenia jako klucza deduplikacji", () => {
    const drafts = planNotifications(event("client_package.low_balance"), facts());
    expect(new Set(drafts.map((d) => d.dedupeKey))).toEqual(new Set(["evt-1"]));
  });

  it("nie robi nic bez pakietu", () => {
    expect(planNotifications(event("client_package.low_balance"), facts({ package: null }))).toEqual([]);
  });
});

describe("planNotifications: prośby klienta", () => {
  it.each([
    ["renew", "Anna Kowalska chce odnowić pakiet"],
    ["pay", "Anna Kowalska zapłaci za pakiet"],
    ["end", "Anna Kowalska kończy współpracę"],
  ] as const)("prośba %s trafia tylko do personelu", (kind, title) => {
    const drafts = planNotifications(
      event("client_request.created"),
      facts({ request: { id: "r1", kind, note: "Dzięki!", packageName: "Pakiet 10" } }),
    );
    expect(drafts.every((d) => d.audience === "staff")).toBe(true);
    expect(drafts[0].title).toBe(title);
    expect(drafts[0].body).toBe("Pakiet „Pakiet 10”. Dzięki!");
    expect(drafts[0].link).toBe("/app/requests");
  });
});

describe("planNotifications: płatności", () => {
  const charge = { id: "ch1", description: "Pakiet 10", remainingMinor: 80000, currency: "PLN", dueDate: "2026-10-20" };

  it("termin płatności dotyczy tylko klienta", () => {
    const drafts = planNotifications(event("charge.due"), facts({ charge }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].audience).toBe("client");
    expect(drafts[0].body).toContain("20.10.2026");
    expect(drafts[0].body.replace(/\s/g, " ")).toContain("800,00");
  });

  it("zaległość dotyczy klienta i personelu", () => {
    const drafts = planNotifications(event("charge.overdue"), facts({ charge }));
    expect(drafts.map((d) => d.audience).sort()).toEqual(["client", "staff", "staff"]);
    expect(drafts.find((d) => d.audience === "staff")?.title).toBe("Płatność po terminie: Anna Kowalska");
  });

  it("pomija opłaconą należność", () => {
    expect(planNotifications(event("charge.overdue"), facts({ charge: { ...charge, remainingMinor: 0 } }))).toEqual([]);
  });

  it("wpłata trafia do klienta, niepoprawna kwota jest pomijana", () => {
    expect(planNotifications(event("payment.recorded", { amount_minor: 5000 }), facts())[0].title).toBe("Zaksięgowano wpłatę");
    expect(planNotifications(event("payment.recorded", { amount_minor: "abc" }), facts())).toEqual([]);
  });
});

describe("planNotifications: zajęcia", () => {
  const session = { id: "s1", startsAt: new Date("2026-10-20T08:00:00Z") };

  it("przypomina klientowi o zajęciach w jego strefie czasowej", () => {
    const [draft] = planNotifications(event("training_session.reminder"), facts({ session }));
    expect(draft.body).toBe("Zajęcia 20.10.2026 o 10:00.");
    expect(draft.link).toBe("/portal/sessions");
  });

  it("informuje o odwołaniu", () => {
    expect(planNotifications(event("training_session.canceled"), facts({ session }))[0].title).toBe("Zajęcia odwołane");
  });

  it("zaproszenie przyjęte powiadamia personel", () => {
    const drafts = planNotifications(event("invitation.accepted"), facts());
    expect(drafts.every((d) => d.audience === "staff")).toBe(true);
  });

  it("nieznane zdarzenia nie tworzą powiadomień", () => {
    expect(planNotifications(event("organization.created"), facts())).toEqual([]);
    expect(isNotifiable("organization.created")).toBe(false);
    expect(isNotifiable("charge.due")).toBe(true);
  });
});

describe("kanały i treść wiadomości", () => {
  it("domyślnie push i e-mail", () => {
    expect(enabledChannels(null)).toEqual(["push", "email"]);
    expect(enabledChannels({ push: false, email: true })).toEqual(["email"]);
  });

  it("buduje link bezwzględny i escapuje HTML", () => {
    const message = renderExternalMessage(
      { title: "Cześć <b>", body: "A & B", link: "/portal" },
      "https://app.example.pl",
    );
    expect(message.url).toBe("https://app.example.pl/portal");
    expect(message.html).toContain("Cześć &lt;b&gt;");
    expect(message.html).toContain("A &amp; B");
    expect(message.text).toContain("https://app.example.pl/portal");
  });
});

describe("planNotifications: wolne terminy", () => {
  const session = { id: "s1", startsAt: new Date("2030-03-01T09:00:00Z") };
  const offer = { typeName: "Trening", note: "Zwolnił się termin" };

  it("ogłoszenie trafia do klienta z datą, rodzajem zajęć i notatką trenera", () => {
    const [draft] = planNotifications(
      { ...event("slot_offer.created", { offer_id: "o1" }) },
      facts({ session, offer }),
    );
    expect(draft).toMatchObject({ audience: "client", recipientUserId: "client-user", link: "/portal/sessions" });
    expect(draft.title).toBe("Wolny termin: 01.03.2030 o 10:00");
    expect(draft.body).toContain("Trening. Zwolnił się termin.");
    expect(draft.body).toContain("trener wybierze osobę");
  });

  it("zgłoszenie „Biorę” informuje personel, wybór i odrzucenie klienta", () => {
    const claim = planNotifications(event("slot_claim.created", { claim_id: "c1", offer_id: "o1" }), facts({ session, offer }));
    expect(claim.every((d) => d.audience === "staff")).toBe(true);
    expect(claim[0].title).toBe("Anna Kowalska chce wolny termin");
    expect(claim[0].link).toBe("/app/sessions");

    const accepted = planNotifications(event("slot_claim.accepted", {}), facts({ session }));
    expect(accepted[0]).toMatchObject({ audience: "client", title: "Miejsce jest dla Ciebie!" });
    expect(accepted[0].body).toContain("01.03.2030 o 10:00");

    const declined = planNotifications(event("slot_claim.declined", {}), facts({ session, offer }));
    expect(declined[0]).toMatchObject({ audience: "client", title: "Termin został zajęty" });
  });

  it("bez danych terminu nic nie wysyła", () => {
    expect(planNotifications(event("slot_offer.created"), facts({ offer }))).toEqual([]);
    expect(planNotifications(event("slot_claim.accepted"), facts())).toEqual([]);
  });

  it("prośba „Nie mogę przyjść” trafia do personelu z terminem zajęć", () => {
    const [draft] = planNotifications(
      event("client_request.created"),
      facts({ session, request: { id: "r1", kind: "cancel", note: "Choroba", packageName: null } }),
    );
    expect(draft.title).toBe("Anna Kowalska nie może przyjść na zajęcia");
    expect(draft.body).toBe("Zajęcia 01.03.2030 o 10:00. Choroba");
    expect(draft.link).toBe("/app/requests");
  });
});
