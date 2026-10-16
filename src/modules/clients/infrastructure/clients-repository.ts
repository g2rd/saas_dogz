import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { Client, ClientInput, ClientStatus } from "../domain/client";

const COLUMNS =
  "id, organization_id, first_name, last_name, email, phone, assigned_trainer_id, status, archived_at, created_at";

type ClientRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  assigned_trainer_id: string | null;
  status: ClientStatus;
  archived_at: string | null;
  created_at: string;
};

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    assignedTrainerId: row.assigned_trainer_id,
    status: row.status,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
  };
}

function toColumns(input: ClientInput) {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    status: input.status,
    assigned_trainer_id: input.assignedTrainerId,
  };
}

const notFound = () => appError("not_found", "Nie znaleziono klienta.");

export type ListClientsOptions = {
  /** Fraza już oczyszczona przez sanitizeSearch. */
  search?: string;
  includeArchived?: boolean;
  limit?: number;
};

export function clientsRepository(db: SupabaseClient) {
  return {
    async list(organizationId: string, options: ListClientsOptions = {}): Promise<Result<Client[]>> {
      let query = db
        .from("clients")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .order("last_name")
        .order("first_name")
        .limit(options.limit ?? 500);

      if (!options.includeArchived) query = query.is("archived_at", null);
      if (options.search) {
        const q = `%${options.search}%`;
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok((data as ClientRow[]).map(toClient));
    },

    async get(organizationId: string, id: string): Promise<Result<Client>> {
      const { data, error } = await db
        .from("clients")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toClient(data as ClientRow));
    },

    async insert(organizationId: string, userId: string, input: ClientInput): Promise<Result<Client>> {
      const { data, error } = await db
        .from("clients")
        .insert({ ...toColumns(input), organization_id: organizationId, created_by: userId })
        .select(COLUMNS)
        .single();
      if (error) return err(fromDbError(error));
      return ok(toClient(data as ClientRow));
    },

    async update(organizationId: string, id: string, input: ClientInput): Promise<Result<Client>> {
      const { data, error } = await db
        .from("clients")
        .update(toColumns(input))
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toClient(data as ClientRow));
    },

    async setArchived(organizationId: string, id: string, archivedAt: Date | null): Promise<Result<Client>> {
      const { data, error } = await db
        .from("clients")
        .update({ archived_at: archivedAt ? archivedAt.toISOString() : null })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toClient(data as ClientRow));
    },
  };
}
