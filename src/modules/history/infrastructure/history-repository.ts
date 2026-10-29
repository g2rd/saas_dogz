import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import { sameLocalDay, UNDO_BY_ACTION, type HistoryEntry, type HistorySubject } from "../domain/history";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

type PaymentRow = { id: string; client_id: string; amount_minor: number; currency: string; voided_at: string | null };
type PackageRow = { id: string; client_id: string; name: string; canceled_at: string | null };
type SessionRow = { id: string; starts_at: string; status: string; completed_at: string | null };
type AttendeeRow = { session_id: string; client_id: string };
type ClientRow = { id: string; first_name: string; last_name: string };
type ProfileRow = { id: string; full_name: string | null };

const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];

/** Wartość z mapy zapytań równoległych: pusta lista przy błędzie (historia nie może się wywrócić przez brakujący obiekt). */
async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  return error ? [] : ((data as T[] | null) ?? []);
}

export function historyRepository(db: SupabaseClient) {
  return {
    /**
     * Najnowsze wpisy dziennika audytu szkoły z opisem obiektu i informacją o możliwości cofnięcia. Audyt czytają tylko właściciel i administrator
     * (RLS); dane obiektów czytamy tym samym kontekstem. Cofnąć można tylko najnowszy wpis danego rodzaju dla obiektu, o ile stan obiektu
     * nadal na to pozwala (wpłata nie anulowana, pakiet nie anulowany, zajęcia nadal zakończone tego samego dnia lub nadal odwołane i jeszcze się nie odbyły).
     */
    async list(organizationId: string, limit: number, timeZone: string, now: Date): Promise<Result<HistoryEntry[]>> {
      const { data, error } = await db
        .from("audit_log")
        .select("id, actor_id, action, entity_type, entity_id, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return err(fromDbError(error));
      const audit = (data ?? []) as AuditRow[];

      const idsOf = (type: string) => unique(audit.filter((row) => row.entity_type === type).map((row) => row.entity_id));
      const [payments, packages, sessions, attendees, profiles] = await Promise.all([
        rows<PaymentRow>(db.from("payments").select("id, client_id, amount_minor, currency, voided_at").eq("organization_id", organizationId).in("id", idsOf("payment"))),
        rows<PackageRow>(db.from("client_packages").select("id, client_id, name, canceled_at").eq("organization_id", organizationId).in("id", idsOf("client_package"))),
        rows<SessionRow>(db.from("training_sessions").select("id, starts_at, status, completed_at").eq("organization_id", organizationId).in("id", idsOf("training_session"))),
        rows<AttendeeRow>(db.from("session_attendees").select("session_id, client_id").eq("organization_id", organizationId).in("session_id", idsOf("training_session"))),
        rows<ProfileRow>(db.from("profiles").select("id, full_name").in("id", unique(audit.map((row) => row.actor_id)))),
      ]);
      const clientIds = unique([...payments.map((p) => p.client_id), ...packages.map((p) => p.client_id), ...attendees.map((a) => a.client_id)]);
      const clients = await rows<ClientRow>(db.from("clients").select("id, first_name, last_name").eq("organization_id", organizationId).in("id", clientIds));

      const clientName = new Map(clients.map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(" ")]));
      const paymentById = new Map(payments.map((p) => [p.id, p]));
      const packageById = new Map(packages.map((p) => [p.id, p]));
      const sessionById = new Map(sessions.map((s) => [s.id, s]));
      const attendeeBySession = new Map(attendees.map((a) => [a.session_id, a.client_id]));
      const actorName = new Map(profiles.map((p) => [p.id, p.full_name]));

      // Wpisy są od najnowszego: pierwszy wpis danego rodzaju dla obiektu jest „ostatnią zmianą”, starsze nie dostają przycisku
      const seen = new Set<string>();
      const entries: HistoryEntry[] = audit.map((row) => {
        const subject: HistorySubject = { clientName: null, packageName: null, amountMinor: null, currency: null, startsAt: null };
        let undo: HistoryEntry["undo"] = null;
        const kind = UNDO_BY_ACTION[row.action];
        const key = `${row.action}:${row.entity_id}`;
        const latest = !seen.has(key);
        seen.add(key);

        if (row.entity_type === "payment" && row.entity_id) {
          const payment = paymentById.get(row.entity_id);
          if (payment) {
            subject.clientName = clientName.get(payment.client_id) ?? null;
            subject.amountMinor = payment.amount_minor;
            subject.currency = payment.currency;
            if (kind && latest && !payment.voided_at) undo = kind;
          }
        } else if (row.entity_type === "client_package" && row.entity_id) {
          const pkg = packageById.get(row.entity_id);
          if (pkg) {
            subject.clientName = clientName.get(pkg.client_id) ?? null;
            subject.packageName = pkg.name;
            if (kind && latest && !pkg.canceled_at) undo = kind;
          }
        } else if (row.entity_type === "training_session" && row.entity_id) {
          const session = sessionById.get(row.entity_id);
          if (session) {
            const attendee = attendeeBySession.get(session.id);
            subject.clientName = attendee ? (clientName.get(attendee) ?? null) : null;
            subject.startsAt = new Date(session.starts_at);
            if (kind === "undo_complete" && latest && session.status === "completed" && session.completed_at && sameLocalDay(new Date(session.completed_at), now, timeZone)) {
              undo = kind;
            }
            if (kind === "undo_cancel" && latest && session.status === "canceled" && new Date(session.starts_at) > now) undo = kind;
          }
        }

        return {
          id: row.id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          actorName: row.actor_id ? (actorName.get(row.actor_id) ?? null) : null,
          createdAt: new Date(row.created_at),
          subject,
          undo,
        };
      });
      return ok(entries);
    },
  };
}
