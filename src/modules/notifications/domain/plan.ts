import { formatIsoDate } from "@/shared/dates";
import { formatMoney, money } from "@/shared/money";
import { dateInZone, timeInZone } from "@/shared/time";
import {
  REQUEST_KINDS,
  type NotificationDraft,
  type OutboxEvent,
  type RequestKind,
} from "./notification";

/** Fakty potrzebne do ułożenia treści powiadomień; wczytuje je procesor outbox. */
export type EventFacts = {
  clientId: string | null;
  clientName: string;
  /** Konta z aktywnym dostępem do panelu klienta. */
  clientUserIds: string[];
  /** Personel do powiadomienia: przypisany trener albo właściciele i administratorzy. */
  staffUserIds: string[];
  timezone: string;
  package: { id: string; name: string; balance: number } | null;
  charge: { id: string; description: string; remainingMinor: number; currency: string; dueDate: string } | null;
  session: { id: string; startsAt: Date } | null;
  request: { id: string; kind: RequestKind; note: string | null; packageName: string | null } | null;
};

/** Zdarzenia, dla których procesor wczytuje fakty o kliencie; pozostałe są pomijane bez powiadomień. */
export const NOTIFIABLE_EVENT_TYPES = [
  "client_package.low_balance",
  "client_request.created",
  "charge.due",
  "charge.overdue",
  "training_session.reminder",
  "training_session.scheduled",
  "training_session.canceled",
  "payment.recorded",
  "invitation.accepted",
] as const;

export function isNotifiable(type: string): boolean {
  return (NOTIFIABLE_EVENT_TYPES as readonly string[]).includes(type);
}

/** Polska odmiana: 1 zajęcie, 2-4 zajęcia, 5+ zajęć (z wyjątkiem 12-14). */
export function sessionsWord(count: number): string {
  if (count === 1) return "zajęcie";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "zajęcia";
  return "zajęć";
}

function fullDateTime(at: Date, timezone: string): string {
  return `${formatIsoDate(dateInZone(at, timezone))} o ${timeInZone(at, timezone)}`;
}

const REQUEST_STAFF_TITLES: Record<RequestKind, (client: string) => string> = {
  renew: (client) => `${client} chce odnowić pakiet`,
  pay: (client) => `${client} zapłaci za pakiet`,
  end: (client) => `${client} kończy współpracę`,
};

type Base = Omit<NotificationDraft, "recipientUserId" | "audience" | "clientId" | "dedupeKey">;

/**
 * Zamienia zdarzenie z outbox na powiadomienia dla odbiorców. Czysta funkcja: treść, odbiorcy i klucze deduplikacji.
 * Klucz to identyfikator zdarzenia, więc ponowne przetworzenie tego samego zdarzenia niczego nie dubluje.
 */
export function planNotifications(event: OutboxEvent, facts: EventFacts): NotificationDraft[] {
  const toClient = (base: Base): NotificationDraft[] =>
    facts.clientUserIds.map((recipientUserId) => ({
      ...base,
      recipientUserId,
      audience: "client",
      clientId: facts.clientId,
      dedupeKey: event.id,
    }));
  const toStaff = (base: Base): NotificationDraft[] =>
    facts.staffUserIds.map((recipientUserId) => ({
      ...base,
      recipientUserId,
      audience: "staff",
      clientId: facts.clientId,
      dedupeKey: event.id,
    }));
  const clientLink = facts.clientId ? `/app/clients/${facts.clientId}` : "/app";

  switch (event.type) {
    case "client_package.low_balance": {
      const pkg = facts.package;
      if (!pkg) return [];
      const balance = pkg.balance;
      const left =
        balance <= 0
          ? "Pakiet się skończył"
          : balance === 1
            ? "Zostało Ci ostatnie zajęcie"
            : `Zostały Ci ${balance} ${sessionsWord(balance)}`;
      return [
        ...toClient({
          type: event.type,
          title: left,
          body: `W pakiecie „${pkg.name}” ${balance <= 0 ? "nie ma już wolnych zajęć" : `zostało ${balance} ${sessionsWord(balance)}`}. Co robisz dalej: odnawiasz, płacisz czy kończysz?`,
          link: "/portal",
          data: { packageId: pkg.id, balance, actions: [...REQUEST_KINDS] },
        }),
        ...toStaff({
          type: event.type,
          title: `Kończy się pakiet: ${facts.clientName}`,
          body: `W pakiecie „${pkg.name}” zostało ${Math.max(balance, 0)} ${sessionsWord(Math.max(balance, 0))}.`,
          link: clientLink,
          data: { packageId: pkg.id, balance },
        }),
      ];
    }

    case "client_request.created": {
      const request = facts.request;
      if (!request) return [];
      const parts = [request.packageName ? `Pakiet „${request.packageName}”.` : null, request.note].filter(Boolean);
      return toStaff({
        type: event.type,
        title: REQUEST_STAFF_TITLES[request.kind](facts.clientName),
        body: parts.join(" "),
        link: "/app/requests",
        data: { requestId: request.id, kind: request.kind },
      });
    }

    case "charge.due":
    case "charge.overdue": {
      const charge = facts.charge;
      if (!charge || charge.remainingMinor <= 0) return [];
      const amount = formatMoney(money(charge.remainingMinor, charge.currency));
      const label = charge.description || "Należność";
      const due = formatIsoDate(charge.dueDate);
      if (event.type === "charge.due") {
        return toClient({
          type: event.type,
          title: "Zbliża się termin płatności",
          body: `${label}: ${amount}, termin ${due}.`,
          link: "/portal/payments",
          data: { chargeId: charge.id, actions: ["pay"] },
        });
      }
      return [
        ...toClient({
          type: event.type,
          title: "Płatność po terminie",
          body: `${label}: ${amount}, termin minął ${due}.`,
          link: "/portal/payments",
          data: { chargeId: charge.id, actions: ["pay"] },
        }),
        ...toStaff({
          type: event.type,
          title: `Płatność po terminie: ${facts.clientName}`,
          body: `${label}: ${amount}, termin minął ${due}.`,
          link: clientLink,
          data: { chargeId: charge.id },
        }),
      ];
    }

    case "training_session.reminder": {
      if (!facts.session) return [];
      return toClient({
        type: event.type,
        title: "Przypomnienie o zajęciach",
        body: `Zajęcia ${fullDateTime(facts.session.startsAt, facts.timezone)}.`,
        link: "/portal/sessions",
        data: { sessionId: facts.session.id },
      });
    }

    case "training_session.scheduled": {
      if (!facts.session) return [];
      return toClient({
        type: event.type,
        title: "Zaplanowano zajęcia",
        body: `Zajęcia ${fullDateTime(facts.session.startsAt, facts.timezone)}.`,
        link: "/portal/sessions",
        data: { sessionId: facts.session.id },
      });
    }

    case "training_session.canceled": {
      if (!facts.session) return [];
      return toClient({
        type: event.type,
        title: "Zajęcia odwołane",
        body: `Zajęcia z ${fullDateTime(facts.session.startsAt, facts.timezone)} zostały odwołane.`,
        link: "/portal/sessions",
        data: { sessionId: facts.session.id },
      });
    }

    case "payment.recorded": {
      const amountMinor = Number(event.payload.amount_minor);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) return [];
      const currency = typeof event.payload.currency === "string" ? event.payload.currency : "PLN";
      return toClient({
        type: event.type,
        title: "Zaksięgowano wpłatę",
        body: `Trener zaksięgował wpłatę ${formatMoney(money(amountMinor, currency))}. Dziękujemy!`,
        link: "/portal/payments",
        data: {},
      });
    }

    case "invitation.accepted":
      return toStaff({
        type: event.type,
        title: `${facts.clientName} dołączył(a) do panelu klienta`,
        body: "Klient przyjął zaproszenie i ma już dostęp do panelu.",
        link: clientLink,
        data: {},
      });

    default:
      return [];
  }
}

/** Treść wiadomości zewnętrznej (e-mail, SMS, push) na podstawie powiadomienia. */
export function renderExternalMessage(
  draft: Pick<NotificationDraft, "title" | "body" | "link">,
  baseUrl: string,
): { subject: string; text: string; html: string; url: string | null } {
  const url = draft.link ? `${baseUrl}${draft.link}` : null;
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const text = [draft.title, draft.body, url].filter(Boolean).join("\n\n");
  const html =
    `<h2>${escape(draft.title)}</h2>` +
    (draft.body ? `<p>${escape(draft.body)}</p>` : "") +
    (url ? `<p><a href="${escape(url)}">Otwórz w aplikacji</a></p>` : "");
  return { subject: draft.title, text, html, url };
}
