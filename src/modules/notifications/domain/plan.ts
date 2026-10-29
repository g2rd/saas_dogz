import {
  type NotificationDraft,
  type NotificationParams,
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
  /** Ogłoszony wolny termin (kopia danych oferty) dla zdarzeń slot_offer.* i slot_claim.*. */
  offer: { typeName: string; note: string | null } | null;
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
  "slot_offer.created",
  "slot_claim.created",
  "slot_claim.accepted",
  "slot_claim.declined",
  "training_session.restored",
  "payment.voided",
  "organization.status_changed",
  "join_request.created",
  "join_request.approved",
] as const;

export function isNotifiable(type: string): boolean {
  return (NOTIFIABLE_EVENT_TYPES as readonly string[]).includes(type);
}

type Base = Omit<NotificationDraft, "recipientUserId" | "audience" | "clientId" | "dedupeKey">;

/** Czas zajęć jako parametry komunikatu: renderer składa z nich datę i godzinę w strefie szkoły i języku odbiorcy. */
const when = (at: Date, timezone: string): NotificationParams => ({ startsAt: at.toISOString(), timezone });

function paymentAmount(event: OutboxEvent): { amountMinor: number; currency: string } | null {
  const amountMinor = Number(event.payload.amount_minor);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return null;
  return { amountMinor, currency: typeof event.payload.currency === "string" ? event.payload.currency : "PLN" };
}

/**
 * Zamienia zdarzenie z outbox na powiadomienia dla odbiorców. Czysta funkcja: odbiorcy, klucze komunikatów z parametrami
 * i klucze deduplikacji; gotowy tekst powstaje później, w języku odbiorcy (`render.ts`).
 * Klucz deduplikacji to identyfikator zdarzenia, więc ponowne przetworzenie tego samego zdarzenia niczego nie dubluje.
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
      const left = Math.max(balance, 0);
      return [
        ...toClient({
          type: event.type,
          messageKey: "low_balance_client",
          params: { balance: left, package: pkg.name },
          link: "/portal",
          data: { packageId: pkg.id, balance, actions: ["renew", "pay", "end"] },
        }),
        ...toStaff({
          type: event.type,
          messageKey: "low_balance_staff",
          params: { client: facts.clientName, balance: left, package: pkg.name },
          link: clientLink,
          data: { packageId: pkg.id, balance },
        }),
      ];
    }

    case "client_request.created": {
      const request = facts.request;
      if (!request) return [];
      const session = request.kind === "cancel" ? facts.session : null;
      return toStaff({
        type: event.type,
        messageKey: "request_staff",
        params: {
          kind: request.kind,
          client: facts.clientName,
          hasPackage: request.packageName !== null,
          package: request.packageName ?? "",
          hasSession: session !== null,
          ...(session ? when(session.startsAt, facts.timezone) : {}),
          note: request.note ?? "",
        },
        link: "/app/requests",
        data: { requestId: request.id, kind: request.kind },
      });
    }

    case "charge.due":
    case "charge.overdue": {
      const charge = facts.charge;
      if (!charge || charge.remainingMinor <= 0) return [];
      const params: NotificationParams = {
        hasLabel: Boolean(charge.description),
        label: charge.description,
        amountMinor: charge.remainingMinor,
        currency: charge.currency,
        dueDate: charge.dueDate,
      };
      if (event.type === "charge.due") {
        return toClient({
          type: event.type,
          messageKey: "charge_due",
          params,
          link: "/portal/payments",
          data: { chargeId: charge.id, actions: ["pay"] },
        });
      }
      return [
        ...toClient({
          type: event.type,
          messageKey: "charge_overdue_client",
          params,
          link: "/portal/payments",
          data: { chargeId: charge.id, actions: ["pay"] },
        }),
        ...toStaff({
          type: event.type,
          messageKey: "charge_overdue_staff",
          params: { ...params, client: facts.clientName },
          link: clientLink,
          data: { chargeId: charge.id },
        }),
      ];
    }

    case "training_session.reminder":
    case "training_session.scheduled":
    case "training_session.canceled":
    case "training_session.restored": {
      if (!facts.session) return [];
      const key = {
        "training_session.reminder": "session_reminder",
        "training_session.scheduled": "session_scheduled",
        "training_session.canceled": "session_canceled",
        "training_session.restored": "session_restored",
      }[event.type];
      return toClient({
        type: event.type,
        messageKey: key,
        params: when(facts.session.startsAt, facts.timezone),
        link: "/portal/sessions",
        data: { sessionId: facts.session.id },
      });
    }

    case "payment.voided":
    case "payment.recorded": {
      const amount = paymentAmount(event);
      if (!amount) return [];
      return toClient({
        type: event.type,
        messageKey: event.type === "payment.voided" ? "payment_voided" : "payment_recorded",
        params: amount,
        link: "/portal/payments",
        data: {},
      });
    }

    case "slot_offer.created": {
      if (!facts.session || !facts.offer) return [];
      return toClient({
        type: event.type,
        messageKey: "slot_offer",
        params: {
          ...when(facts.session.startsAt, facts.timezone),
          typeName: facts.offer.typeName,
          hasNote: Boolean(facts.offer.note),
          note: facts.offer.note ?? "",
        },
        link: "/portal/sessions",
        data: { offerId: event.payload.offer_id },
      });
    }

    case "slot_claim.created": {
      if (!facts.session) return [];
      return toStaff({
        type: event.type,
        messageKey: "slot_claim_staff",
        params: { client: facts.clientName, ...when(facts.session.startsAt, facts.timezone) },
        link: "/app/sessions",
        data: { claimId: event.payload.claim_id, offerId: event.payload.offer_id },
      });
    }

    case "slot_claim.accepted": {
      if (!facts.session) return [];
      return toClient({
        type: event.type,
        messageKey: "slot_claim_accepted",
        params: when(facts.session.startsAt, facts.timezone),
        link: "/portal/sessions",
        data: { sessionId: facts.session.id },
      });
    }

    case "slot_claim.declined": {
      if (!facts.session) return [];
      return toClient({
        type: event.type,
        messageKey: "slot_claim_declined",
        params: when(facts.session.startsAt, facts.timezone),
        link: "/portal/sessions",
        data: { offerId: event.payload.offer_id },
      });
    }

    case "organization.status_changed": {
      const to = typeof event.payload.to === "string" ? event.payload.to : "";
      const reason = typeof event.payload.reason === "string" ? event.payload.reason : "";
      const until = typeof event.payload.access_until === "string" ? new Date(event.payload.access_until) : null;
      const validUntil = until !== null && !Number.isNaN(until.getTime());
      if (to === "suspended" || to === "read_only") {
        return toStaff({
          type: event.type,
          messageKey: to === "suspended" ? "org_suspended" : "org_read_only",
          params: { hasReason: reason !== "", reason },
          link: "/app",
          data: { status: to },
        });
      }
      if (to === "active" || to === "trial") {
        return toStaff({
          type: event.type,
          messageKey: "org_restored",
          params: { hasUntil: validUntil, accessUntil: validUntil ? until.toISOString() : "", timezone: facts.timezone },
          link: "/app",
          data: { status: to },
        });
      }
      return [];
    }

    case "join_request.created":
      return toStaff({
        type: event.type,
        messageKey: "join_request_created",
        params: { name: typeof event.payload.name === "string" ? event.payload.name : "" },
        link: "/app/join-requests",
        data: {},
      });

    case "join_request.approved":
      return toClient({
        type: event.type,
        messageKey: "join_request_approved",
        params: {},
        link: "/portal",
        data: {},
      });

    case "invitation.accepted":
      return toStaff({
        type: event.type,
        messageKey: "invitation_accepted",
        params: { client: facts.clientName },
        link: clientLink,
        data: {},
      });

    default:
      return [];
  }
}
