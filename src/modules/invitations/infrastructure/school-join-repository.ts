import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { JoinRequest, JoinRequestInput, JoinRequestStatus } from "../domain/school-join";

type JoinRequestRow = {
  id: string;
  organization_name: string;
  status: JoinRequestStatus;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  client_id: string | null;
  created_at: string;
  decided_at: string | null;
};

const COLUMNS = "id, organization_name, status, first_name, last_name, email, phone, note, client_id, created_at, decided_at";

const toRequest = (row: JoinRequestRow): JoinRequest => ({
  id: row.id,
  organizationName: row.organization_name,
  status: row.status,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
  note: row.note,
  clientId: row.client_id,
  createdAt: new Date(row.created_at),
  decidedAt: row.decided_at ? new Date(row.decided_at) : null,
});

export function schoolJoinRepository(db: SupabaseClient) {
  return {
    /** Aktywny token linku szkoły (RLS: tylko właściciel i administrator); `null`, gdy link jeszcze nie powstał. */
    async activeToken(organizationId: string): Promise<Result<string | null>> {
      const { data, error } = await db
        .from("school_join_links")
        .select("token")
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      return ok((data as { token: string } | null)?.token ?? null);
    },

    async rotate(organizationId: string, token: string): Promise<Result<void>> {
      const { error } = await db.rpc("rotate_school_join_link", { p_org: organizationId, p_token: token });
      return error ? err(fromDbError(error)) : ok(undefined);
    },

    /** Nazwa szkoły dla aktywnego linku (publiczne, bez logowania); `null` dla nieznanego lub wycofanego linku. */
    async lookup(token: string): Promise<Result<{ name: string } | null>> {
      const { data, error } = await db.rpc("lookup_school_join", { p_token: token });
      if (error) return err(fromDbError(error));
      return ok((data as { name: string } | null) ?? null);
    },

    async request(input: JoinRequestInput): Promise<Result<string>> {
      const { data, error } = await db.rpc("request_school_join", {
        p_token: input.token,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_phone: input.phone,
        p_note: input.note,
      });
      return error ? err(fromDbError(error)) : ok(data as string);
    },

    /** Oczekujące prośby szkoły (od najstarszej). */
    async pending(organizationId: string): Promise<Result<JoinRequest[]>> {
      const { data, error } = await db
        .from("join_requests")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at");
      if (error) return err(fromDbError(error));
      return ok((data as JoinRequestRow[]).map(toRequest));
    },

    /** Prośby zalogowanej osoby we wszystkich szkołach (najnowsze pierwsze). */
    async mine(userId: string): Promise<Result<JoinRequest[]>> {
      const { data, error } = await db
        .from("join_requests")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok((data as JoinRequestRow[]).map(toRequest));
    },

    async decide(organizationId: string, requestId: string, approve: boolean, clientId: string | null): Promise<Result<string | null>> {
      const { data, error } = await db.rpc("decide_join_request", {
        p_org: organizationId,
        p_request: requestId,
        p_approve: approve,
        p_client: clientId,
      });
      return error ? err(fromDbError(error)) : ok((data as string | null) ?? null);
    },
  };
}
