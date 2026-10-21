import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { AttendanceStatus, Session, SessionStatus } from "../domain/session";
import { msg } from "@/shared/i18n/messages";

const COLUMNS =
  "id, session_type_id, type_name, duration_minutes, default_price_minor, currency, trainer_id, trainer_name, starts_at, ends_at, location, status, client_summary, attendee_id, client_id, client_first_name, client_last_name, dog_id, dog_name, attendance, client_package_id, completed_at";

type Row = {
  id: string;
  session_type_id: string;
  type_name: string;
  duration_minutes: number;
  default_price_minor: number;
  currency: string;
  trainer_id: string;
  trainer_name: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: SessionStatus;
  client_summary: string | null;
  attendee_id: string | null;
  client_id: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  dog_id: string | null;
  dog_name: string | null;
  attendance: AttendanceStatus | null;
  client_package_id: string | null;
  completed_at: string | null;
};

function toSession(row: Row): Session {
  return {
    id: row.id,
    sessionTypeId: row.session_type_id,
    typeName: row.type_name,
    durationMinutes: row.duration_minutes,
    defaultPriceMinor: row.default_price_minor,
    currency: row.currency,
    trainerId: row.trainer_id,
    trainerName: row.trainer_name,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    location: row.location,
    status: row.status,
    clientSummary: row.client_summary,
    attendeeId: row.attendee_id,
    clientId: row.client_id,
    clientName: [row.client_first_name, row.client_last_name].filter(Boolean).join(" "),
    dogId: row.dog_id,
    dogName: row.dog_name,
    attendance: row.attendance,
    clientPackageId: row.client_package_id,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export type ListSessionsOptions = {
  /** Początek przedziału (włącznie), moment UTC. */
  from?: Date;
  /** Koniec przedziału (wyłącznie), moment UTC. */
  to?: Date;
  status?: SessionStatus;
  clientId?: string;
  newestFirst?: boolean;
  limit?: number;
};

export type CompleteCommand = {
  sessionId: string;
  packageId: string | null;
  note: string | null;
  withoutPackage: boolean;
};

export type CompleteResult = {
  packageId: string | null;
  packageName: string | null;
  balanceAfter: number | null;
  chargeId: string | null;
};

export type CancelResult = { consumed: boolean; packageId: string | null; balanceAfter: number | null };

export type ScheduleCommand = {
  sessionTypeId: string;
  trainerId: string;
  startsAt: Date;
  location: string | null;
  clientId: string;
  dogId: string | null;
};

export function sessionsRepository(db: SupabaseClient) {
  return {
    async list(organizationId: string, options: ListSessionsOptions = {}): Promise<Result<Session[]>> {
      let query = db
        .from("v_session_details")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .order("starts_at", { ascending: !options.newestFirst })
        .limit(options.limit ?? 200);
      if (options.from) query = query.gte("starts_at", options.from.toISOString());
      if (options.to) query = query.lt("starts_at", options.to.toISOString());
      if (options.status) query = query.eq("status", options.status);
      if (options.clientId) query = query.eq("client_id", options.clientId);

      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok((data as Row[]).map(toSession));
    },

    async get(organizationId: string, id: string): Promise<Result<Session>> {
      const { data, error } = await db
        .from("v_session_details")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(appError("not_found", msg("errors.not_found.session")));
      return ok(toSession(data as Row));
    },

    async schedule(organizationId: string, command: ScheduleCommand): Promise<Result<string>> {
      const { data, error } = await db.rpc("schedule_session", {
        p_org: organizationId,
        p_type: command.sessionTypeId,
        p_trainer: command.trainerId,
        p_starts_at: command.startsAt.toISOString(),
        p_location: command.location,
        p_client: command.clientId,
        p_dog: command.dogId,
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async complete(organizationId: string, command: CompleteCommand): Promise<Result<CompleteResult>> {
      const { data, error } = await db.rpc("complete_session", {
        p_org: organizationId,
        p_session: command.sessionId,
        p_package: command.packageId,
        p_note: command.note,
        p_without_package: command.withoutPackage,
      });
      if (error) return err(fromDbError(error));
      const row = data as { package_id: string | null; package_name: string | null; balance_after: number | null; charge_id: string | null };
      return ok({
        packageId: row.package_id,
        packageName: row.package_name,
        balanceAfter: row.balance_after,
        chargeId: row.charge_id,
      });
    },

    async cancel(organizationId: string, sessionId: string, consume: boolean): Promise<Result<CancelResult>> {
      const { data, error } = await db.rpc("cancel_session", {
        p_org: organizationId,
        p_session: sessionId,
        p_consume: consume,
      });
      if (error) return err(fromDbError(error));
      const row = data as { consumed: boolean; package_id: string | null; balance_after: number | null };
      return ok({ consumed: row.consumed, packageId: row.package_id, balanceAfter: row.balance_after });
    },

    /** Cofnięcie zakończenia zajęć (do końca dnia). */
    async undoComplete(organizationId: string, sessionId: string): Promise<Result<void>> {
      const { error } = await db.rpc("undo_complete_session", { p_org: organizationId, p_session: sessionId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    /** Przywrócenie odwołanych zajęć (przed ich rozpoczęciem). */
    async restore(organizationId: string, sessionId: string): Promise<Result<void>> {
      const { error } = await db.rpc("undo_cancel_session", { p_org: organizationId, p_session: sessionId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },
  };
}
