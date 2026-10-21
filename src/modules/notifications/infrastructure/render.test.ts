import { describe, expect, it } from "vitest";
import { createFormats } from "@/shared/i18n/formats";
import { isNotifiable, NOTIFIABLE_EVENT_TYPES, planNotifications, type EventFacts } from "../domain/plan";
import { renderNotification } from "../domain/render";
import { translatorFor } from "@/shared/i18n/translator";

const facts = (overrides: Partial<EventFacts> = {}): EventFacts => ({
  clientId: "client-1",
  clientName: "Anna Kowalska",
  clientUserIds: ["client-user"],
  staffUserIds: ["trainer-1"],
  timezone: "Europe/Warsaw",
  package: { id: "pkg-1", name: "Pakiet 10", balance: 2 },
  charge: { id: "ch1", description: "Pakiet 10", remainingMinor: 80000, currency: "PLN", dueDate: "2026-10-20" },
  session: { id: "s1", startsAt: new Date("2026-10-20T08:00:00Z") },
  request: { id: "r1", kind: "cancel", note: "Choroba", packageName: "Pakiet 10" },
  offer: { typeName: "Trening", note: "Zwolnił się termin" },
  ...overrides,
});

const event = (type: string, payload: Record<string, unknown> = {}) => ({ id: "evt-1", organizationId: "org-1", type, payload, attempts: 1 });

async function render(type: string, payload: Record<string, unknown>, overrides: Partial<EventFacts> = {}, audience?: "client" | "staff") {
  const t = await translatorFor("pl");
  const drafts = planNotifications(event(type, payload), facts(overrides)).filter((d) => !audience || d.audience === audience);
  const draft = drafts[0];
  expect(draft, `brak powiadomienia dla ${type}`).toBeDefined();
  const text = renderNotification(t, createFormats("pl"), draft.messageKey, draft.params);
  expect(text, `brak klucza ${draft.messageKey} w katalogu`).not.toBeNull();
  return text!;
}

const plain = (value: string) => value.replace(/\s/g, " ");

describe("treść powiadomień po polsku (z katalogu notify)", () => {
  it.each([
    [0, "Pakiet się skończył", "nie ma już wolnych zajęć"],
    [1, "Zostało Ci ostatnie zajęcie", "zostało 1 zajęcie"],
    [2, "Zostały Ci 2 zajęcia", "zostało 2 zajęcia"],
    [5, "Zostały Ci 5 zajęć", "zostało 5 zajęć"],
    [12, "Zostały Ci 12 zajęć", "zostało 12 zajęć"],
    [22, "Zostały Ci 22 zajęcia", "zostało 22 zajęcia"],
  ])("kończący się pakiet klienta: saldo %i", async (balance, title, bodyPart) => {
    const text = await render("client_package.low_balance", {}, { package: { id: "p", name: "Pakiet 10", balance } }, "client");
    expect(text.title).toBe(title);
    expect(text.body).toContain(bodyPart);
    expect(text.body).toContain("„Pakiet 10”");
  });

  it("kończący się pakiet w panelu personelu", async () => {
    const text = await render("client_package.low_balance", {}, {}, "staff");
    expect(text.title).toBe("Kończy się pakiet: Anna Kowalska");
    expect(text.body).toBe("W pakiecie „Pakiet 10” zostało 2 zajęcia.");
  });

  it.each([
    ["renew", "Anna Kowalska chce odnowić pakiet"],
    ["pay", "Anna Kowalska zapłaci za pakiet"],
    ["end", "Anna Kowalska kończy współpracę"],
    ["cancel", "Anna Kowalska nie może przyjść na zajęcia"],
  ])("prośba %s", async (kind, title) => {
    const text = await render("client_request.created", {}, { request: { id: "r", kind: kind as never, note: "Dzięki!", packageName: "Pakiet 10" } });
    expect(text.title).toBe(title);
  });

  it("treść prośby składa pakiet, termin zajęć i notatkę bez zbędnych odstępów", async () => {
    const withSession = await render("client_request.created", {}, { request: { id: "r", kind: "cancel", note: "Choroba", packageName: null } });
    expect(withSession.body).toBe("Zajęcia 20.10.2026 o 10:00. Choroba");
    const onlyPackage = await render("client_request.created", {}, { request: { id: "r", kind: "pay", note: null, packageName: "Pakiet 10" } });
    expect(onlyPackage.body).toBe("Pakiet „Pakiet 10”.");
    const both = await render("client_request.created", {}, { request: { id: "r", kind: "renew", note: "Dzięki!", packageName: "Pakiet 10" } });
    expect(both.body).toBe("Pakiet „Pakiet 10”. Dzięki!");
  });

  it("płatności: kwota i termin w zapisie języka odbiorcy", async () => {
    const due = await render("charge.due", {}, {}, "client");
    expect(due.title).toBe("Zbliża się termin płatności");
    expect(due.body).toContain("20.10.2026");
    expect(plain(due.body)).toContain("800,00");
    const overdue = await render("charge.overdue", {}, {}, "staff");
    expect(overdue.title).toBe("Płatność po terminie: Anna Kowalska");
    expect(overdue.body).toContain("termin minął 20.10.2026");
    const noLabel = await render("charge.due", {}, { charge: { id: "c", description: "", remainingMinor: 1000, currency: "PLN", dueDate: "2026-10-20" } });
    expect(noLabel.body.startsWith("Należność: ")).toBe(true);
  });

  it("wpłaty i zajęcia", async () => {
    expect((await render("payment.recorded", { amount_minor: 5000 })).title).toBe("Zaksięgowano wpłatę");
    expect(plain((await render("payment.voided", { amount_minor: 5000, currency: "PLN" })).body)).toContain("50,00");
    expect((await render("training_session.reminder", {})).body).toBe("Zajęcia 20.10.2026 o 10:00.");
    expect((await render("training_session.canceled", {})).title).toBe("Zajęcia odwołane");
    expect((await render("training_session.restored", {})).body).toContain("20.10.2026 o 10:00");
  });

  it("wolne terminy", async () => {
    const offer = await render("slot_offer.created", { offer_id: "o1" });
    expect(offer.title).toBe("Wolny termin: 20.10.2026 o 10:00");
    expect(offer.body).toContain("Trening. Zwolnił się termin.");
    expect(offer.body).toContain("trener wybierze osobę");
    const noNote = await render("slot_offer.created", { offer_id: "o1" }, { offer: { typeName: "Trening", note: null } });
    expect(noNote.body.startsWith("Trening. Chcesz go wziąć?")).toBe(true);
    expect((await render("slot_claim.created", {}, {}, "staff")).title).toBe("Anna Kowalska chce wolny termin");
    expect((await render("slot_claim.accepted", {})).title).toBe("Miejsce jest dla Ciebie!");
    expect((await render("slot_claim.declined", {})).title).toBe("Termin został zajęty");
  });

  it("status szkoły z powodem i terminem dostępu", async () => {
    const suspended = await render("organization.status_changed", { to: "suspended", reason: "Brak płatności" });
    expect(suspended.title).toBe("Konto zawieszone");
    expect(suspended.body).toContain("Powód: Brak płatności.");
    const noReason = await render("organization.status_changed", { to: "read_only" });
    expect(noReason.body).not.toContain("Powód");
    const restored = await render("organization.status_changed", { to: "active", access_until: "2026-12-31T22:59:00Z" });
    expect(restored.body).toContain("Dostęp jest przyznany do 31.12.2026.");
  });

  it("zaproszenie przyjęte", async () => {
    expect((await render("invitation.accepted", {})).title).toBe("Anna Kowalska dołączył(a) do panelu klienta");
  });

  it("dane wpisane przez użytkownika nie są interpretowane jako szablon", async () => {
    const text = await render("client_request.created", {}, { request: { id: "r", kind: "pay", note: "{kind, select, other {x}} <b>", packageName: null } });
    expect(text.body).toBe("{kind, select, other {x}} <b>");
  });
});

describe("pokrycie katalogu", () => {
  it("każde zdarzenie powiadamiające ma w katalogu tytuł (i treść) dla każdego klucza, który planuje", async () => {
    const t = await translatorFor("pl");
    const keys = new Set<string>();
    for (const type of NOTIFIABLE_EVENT_TYPES) {
      const payloads: Record<string, unknown>[] = [
        { amount_minor: 100, currency: "PLN", to: "suspended" },
        { to: "read_only" },
        { to: "active" },
      ];
      for (const payload of payloads) {
        for (const draft of planNotifications(event(type, payload), facts())) keys.add(draft.messageKey);
      }
    }
    expect(keys.size).toBeGreaterThan(15);
    for (const key of keys) {
      expect(t.has(`notify.${key}.title`), `notify.${key}.title`).toBe(true);
      expect(t.has(`notify.${key}.body`), `notify.${key}.body`).toBe(true);
    }
    expect(NOTIFIABLE_EVENT_TYPES.every(isNotifiable)).toBe(true);
  });

  it("język bez własnych przestrzeni (en) korzysta z polskiego zapasu, więc powiadomienie nigdy nie jest puste", async () => {
    const t = await translatorFor("en");
    const [draft] = planNotifications(event("payment.recorded", { amount_minor: 5000 }), facts());
    const text = renderNotification(t, createFormats("en"), draft.messageKey, draft.params);
    expect(text?.title).toBeTruthy();
  });

  it("nieznany klucz daje null (dzwonek pokaże zapisany tekst)", async () => {
    const t = await translatorFor("pl");
    expect(renderNotification(t, createFormats("pl"), "nie_ma_takiego", {})).toBeNull();
  });
});
