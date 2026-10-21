import { describe, expect, it } from "vitest";
import { enabledChannels } from "./notification";
import { isNotifiable, planNotifications, type EventFacts } from "./plan";
import { renderExternalMessage } from "./render";

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

describe("planNotifications: niski stan pakietu", () => {
  it("powiadamia klienta z akcjami i personel o kończącym się pakiecie", () => {
    const drafts = planNotifications(event("client_package.low_balance"), facts());
    const client = drafts.filter((d) => d.audience === "client");
    const staff = drafts.filter((d) => d.audience === "staff");

    expect(client).toHaveLength(1);
    expect(client[0].recipientUserId).toBe("client-user");
    expect(client[0].messageKey).toBe("low_balance_client");
    expect(client[0].params).toEqual({ balance: 2, package: "Pakiet 10" });
    expect(client[0].data.actions).toEqual(["renew", "pay", "end"]);
    expect(client[0].link).toBe("/portal");
    expect(staff.map((d) => d.recipientUserId)).toEqual(["trainer-1", "owner-1"]);
    expect(staff[0].messageKey).toBe("low_balance_staff");
    expect(staff[0].params).toMatchObject({ client: "Anna Kowalska", balance: 2 });
    expect(staff[0].link).toBe("/app/clients/client-1");
  });

  it("przekazuje liczbę zajęć bez ujemnych wartości (odmianę robi katalog), a surowe saldo zostaje w danych", () => {
    const empty = planNotifications(event("client_package.low_balance"), facts({ package: { id: "p", name: "X", balance: -1 } }));
    expect(empty[0].params.balance).toBe(0);
    expect(empty[0].data.balance).toBe(-1);
  });

  it("używa identyfikatora zdarzenia jako klucza deduplikacji", () => {
    const drafts = planNotifications(event("client_package.low_balance"), facts());
    expect(new Set(drafts.map((d) => d.dedupeKey))).toEqual(new Set(["evt-1"]));
  });

  it("nie robi nic bez pakietu", () => {
    expect(planNotifications(event("client_package.low_balance"), facts({ package: null }))).toEqual([]);
  });

  it("nie zapisuje gotowego tekstu: tylko klucz i parametry", () => {
    for (const draft of planNotifications(event("client_package.low_balance"), facts())) {
      expect(draft).not.toHaveProperty("title");
      expect(draft).not.toHaveProperty("body");
    }
  });
});

describe("planNotifications: prośby klienta", () => {
  it.each(["renew", "pay", "end"] as const)("prośba %s trafia tylko do personelu", (kind) => {
    const drafts = planNotifications(
      event("client_request.created"),
      facts({ request: { id: "r1", kind, note: "Dzięki!", packageName: "Pakiet 10" } }),
    );
    expect(drafts.every((d) => d.audience === "staff")).toBe(true);
    expect(drafts[0].messageKey).toBe("request_staff");
    expect(drafts[0].params).toMatchObject({ kind, client: "Anna Kowalska", hasPackage: true, package: "Pakiet 10", hasSession: false, note: "Dzięki!" });
    expect(drafts[0].link).toBe("/app/requests");
  });
});

describe("planNotifications: płatności", () => {
  const charge = { id: "ch1", description: "Pakiet 10", remainingMinor: 80000, currency: "PLN", dueDate: "2026-10-20" };

  it("termin płatności dotyczy tylko klienta", () => {
    const drafts = planNotifications(event("charge.due"), facts({ charge }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].audience).toBe("client");
    expect(drafts[0].messageKey).toBe("charge_due");
    expect(drafts[0].params).toMatchObject({ amountMinor: 80000, currency: "PLN", dueDate: "2026-10-20", label: "Pakiet 10", hasLabel: true });
  });

  it("zaległość dotyczy klienta i personelu", () => {
    const drafts = planNotifications(event("charge.overdue"), facts({ charge }));
    expect(drafts.map((d) => d.audience).sort()).toEqual(["client", "staff", "staff"]);
    expect(drafts.find((d) => d.audience === "staff")?.messageKey).toBe("charge_overdue_staff");
  });

  it("pomija opłaconą należność", () => {
    expect(planNotifications(event("charge.overdue"), facts({ charge: { ...charge, remainingMinor: 0 } }))).toEqual([]);
  });

  it("wpłata trafia do klienta z kwotą w groszach, niepoprawna kwota jest pomijana", () => {
    const [draft] = planNotifications(event("payment.recorded", { amount_minor: 5000 }), facts());
    expect(draft.messageKey).toBe("payment_recorded");
    expect(draft.params).toEqual({ amountMinor: 5000, currency: "PLN" });
    expect(planNotifications(event("payment.recorded", { amount_minor: "abc" }), facts())).toEqual([]);
  });
});

describe("planNotifications: zajęcia", () => {
  const session = { id: "s1", startsAt: new Date("2026-10-20T08:00:00Z") };

  it("przypomina klientowi o zajęciach: moment w UTC i strefa szkoły w parametrach", () => {
    const [draft] = planNotifications(event("training_session.reminder"), facts({ session }));
    expect(draft.messageKey).toBe("session_reminder");
    expect(draft.params).toEqual({ startsAt: "2026-10-20T08:00:00.000Z", timezone: "Europe/Warsaw" });
    expect(draft.link).toBe("/portal/sessions");
  });

  it("informuje o odwołaniu", () => {
    expect(planNotifications(event("training_session.canceled"), facts({ session }))[0].messageKey).toBe("session_canceled");
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

  it("podpis linku jest w języku odbiorcy", () => {
    const message = renderExternalMessage({ title: "Hi", body: "", link: "/portal" }, "https://app.example.pl", "Open in the app");
    expect(message.html).toContain(">Open in the app</a>");
  });
});

describe("planNotifications: wolne terminy", () => {
  const session = { id: "s1", startsAt: new Date("2030-03-01T09:00:00Z") };
  const offer = { typeName: "Trening", note: "Zwolnił się termin" };

  it("ogłoszenie trafia do klienta z terminem, rodzajem zajęć i notatką trenera", () => {
    const [draft] = planNotifications(
      { ...event("slot_offer.created", { offer_id: "o1" }) },
      facts({ session, offer }),
    );
    expect(draft).toMatchObject({ audience: "client", recipientUserId: "client-user", link: "/portal/sessions", messageKey: "slot_offer" });
    expect(draft.params).toMatchObject({ typeName: "Trening", hasNote: true, note: "Zwolnił się termin", startsAt: "2030-03-01T09:00:00.000Z" });
  });

  it("zgłoszenie „Biorę” informuje personel, wybór i odrzucenie klienta", () => {
    const claim = planNotifications(event("slot_claim.created", { claim_id: "c1", offer_id: "o1" }), facts({ session, offer }));
    expect(claim.every((d) => d.audience === "staff")).toBe(true);
    expect(claim[0].messageKey).toBe("slot_claim_staff");
    expect(claim[0].params).toMatchObject({ client: "Anna Kowalska" });
    expect(claim[0].link).toBe("/app/sessions");

    const accepted = planNotifications(event("slot_claim.accepted", {}), facts({ session }));
    expect(accepted[0]).toMatchObject({ audience: "client", messageKey: "slot_claim_accepted" });

    const declined = planNotifications(event("slot_claim.declined", {}), facts({ session, offer }));
    expect(declined[0]).toMatchObject({ audience: "client", messageKey: "slot_claim_declined" });
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
    expect(draft.messageKey).toBe("request_staff");
    expect(draft.params).toMatchObject({ kind: "cancel", hasPackage: false, hasSession: true, startsAt: "2030-03-01T09:00:00.000Z", note: "Choroba" });
    expect(draft.link).toBe("/app/requests");
  });

  it("termin zajęć dołącza do prośby tylko przy odwołaniu", () => {
    const [draft] = planNotifications(
      event("client_request.created"),
      facts({ session, request: { id: "r1", kind: "pay", note: null, packageName: null } }),
    );
    expect(draft.params).toMatchObject({ hasSession: false, note: "" });
    expect(draft.params).not.toHaveProperty("startsAt");
  });
});

describe("planNotifications: cofnięcia", () => {
  const session = { id: "s1", startsAt: new Date("2030-03-01T09:00:00Z") };

  it("przywrócone zajęcia informują klienta", () => {
    const [draft] = planNotifications(event("training_session.restored"), facts({ session }));
    expect(draft).toMatchObject({ audience: "client", messageKey: "session_restored", link: "/portal/sessions" });
  });

  it("anulowana wpłata informuje klienta o kwocie, a niepoprawna kwota jest pomijana", () => {
    const [draft] = planNotifications(event("payment.voided", { amount_minor: 5000, currency: "PLN" }), facts());
    expect(draft).toMatchObject({ audience: "client", messageKey: "payment_voided", link: "/portal/payments" });
    expect(draft.params).toEqual({ amountMinor: 5000, currency: "PLN" });
    expect(planNotifications(event("payment.voided", { amount_minor: 0 }), facts())).toEqual([]);
  });
});

describe("planNotifications: status szkoły", () => {
  it("zawieszenie i tryb tylko do odczytu trafiają do właścicieli z powodem", () => {
    const suspended = planNotifications(event("organization.status_changed", { to: "suspended", reason: "Brak płatności" }), facts());
    expect(suspended[0]).toMatchObject({ audience: "staff", messageKey: "org_suspended", params: { hasReason: true, reason: "Brak płatności" } });
    const readOnly = planNotifications(event("organization.status_changed", { to: "read_only" }), facts());
    expect(readOnly[0]).toMatchObject({ messageKey: "org_read_only", params: { hasReason: false, reason: "" } });
  });

  it("przywrócenie dostępu niesie termin tylko przy poprawnej dacie", () => {
    const withDate = planNotifications(event("organization.status_changed", { to: "active", access_until: "2026-12-31T22:59:00Z" }), facts());
    expect(withDate[0].params).toMatchObject({ hasUntil: true, accessUntil: "2026-12-31T22:59:00.000Z", timezone: "Europe/Warsaw" });
    const bad = planNotifications(event("organization.status_changed", { to: "trial", access_until: "nie data" }), facts());
    expect(bad[0].params).toMatchObject({ hasUntil: false, accessUntil: "" });
  });
});
