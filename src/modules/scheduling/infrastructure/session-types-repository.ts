import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { SessionType, SessionTypeInput } from "../domain/session-type";

const COLUMNS = "id, organization_id, name, duration_minutes, default_price_minor, currency, archived_at";

type Row = {
  id: string;
  organization_id: string;
  name: string;
  duration_minutes: number;
  default_price_minor: number;
  currency: string;
  archived_at: string | null;
};

function toType(row: Row): SessionType {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    defaultPriceMinor: row.default_price_minor,
    currency: row.currency,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
  };
}

const notFound = () => appError("not_found", "Nie znaleziono rodzaju zajęć.");

export function sessionTypesRepository(db: SupabaseClient) {
  return {
    async list(organizationId: string, includeArchived = false): Promise<Result<SessionType[]>> {
      let query = db.from("session_types").select(COLUMNS).eq("organization_id", organizationId).order("name");
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok((data as Row[]).map(toType));
    },

    async get(organizationId: string, id: string): Promise<Result<SessionType>> {
      const { data, error } = await db
        .from("session_types")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toType(data as Row));
    },

    async insert(organizationId: string, userId: string, input: SessionTypeInput): Promise<Result<SessionType>> {
      const { data, error } = await db
        .from("session_types")
        .insert({
          organization_id: organizationId,
          name: input.name,
          duration_minutes: input.durationMinutes,
          default_price_minor: input.defaultPriceMinor,
          created_by: userId,
        })
        .select(COLUMNS)
        .single();
      if (error) return err(fromDbError(error));
      return ok(toType(data as Row));
    },

    async update(organizationId: string, id: string, input: SessionTypeInput): Promise<Result<SessionType>> {
      const { data, error } = await db
        .from("session_types")
        .update({
          name: input.name,
          duration_minutes: input.durationMinutes,
          default_price_minor: input.defaultPriceMinor,
        })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toType(data as Row));
    },

    async setArchived(organizationId: string, id: string, archivedAt: Date | null): Promise<Result<SessionType>> {
      const { data, error } = await db
        .from("session_types")
        .update({ archived_at: archivedAt ? archivedAt.toISOString() : null })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toType(data as Row));
    },
  };
}
