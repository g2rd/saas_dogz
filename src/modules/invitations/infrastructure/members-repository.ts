import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { MemberInvitationPreview, MemberRole, TeamOverview } from "../domain/invitation";

type LookupRow = {
  status: "valid" | "not_found" | "used" | "revoked" | "expired";
  organization_name?: string;
  role?: MemberRole;
  email_hint?: string;
  email_matches?: boolean | null;
  expires_at?: string;
};

/** Repozytorium zaproszeń personelu i listy zespołu (kontekst użytkownika, RLS obowiązuje). */
export function membersRepository(db: SupabaseClient) {
  return {
    async create(
      organizationId: string,
      command: { email: string; role: MemberRole; tokenHash: string; expiresAt: Date },
    ): Promise<Result<string>> {
      const { data, error } = await db.rpc("create_member_invitation", {
        p_org: organizationId,
        p_email: command.email,
        p_role: command.role,
        p_token_hash: command.tokenHash,
        p_expires_at: command.expiresAt.toISOString(),
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async lookup(tokenHash: string, email: string | null): Promise<Result<MemberInvitationPreview>> {
      const { data, error } = await db.rpc("lookup_member_invitation", { p_token_hash: tokenHash, p_email: email });
      if (error) return err(fromDbError(error));
      const row = data as LookupRow;
      if (row.status !== "valid") return ok({ status: row.status });
      return ok({
        status: "valid",
        organizationName: row.organization_name ?? "",
        role: row.role ?? "assistant",
        emailHint: row.email_hint ?? "",
        emailMatches: row.email_matches ?? null,
        expiresAt: new Date(row.expires_at ?? Date.now()),
      });
    },

    async accept(tokenHash: string): Promise<Result<{ organizationId: string; role: MemberRole }>> {
      const { data, error } = await db.rpc("accept_member_invitation", { p_token_hash: tokenHash });
      if (error) return err(fromDbError(error));
      const row = data as { organization_id: string; role: MemberRole };
      return ok({ organizationId: row.organization_id, role: row.role });
    },

    async revoke(organizationId: string, invitationId: string): Promise<Result<void>> {
      const { error } = await db.rpc("revoke_member_invitation", { p_org: organizationId, p_invitation: invitationId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async team(organizationId: string, currentUserId: string, includePending: boolean, now: Date): Promise<Result<TeamOverview>> {
      const members = await db
        .from("organization_members")
        .select("user_id, role, status")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (members.error) return err(fromDbError(members.error));
      const rows = members.data as { user_id: string; role: TeamOverview["members"][number]["role"]; status: "active" | "suspended" }[];

      const profiles = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", rows.map((m) => m.user_id));
      if (profiles.error) return err(fromDbError(profiles.error));
      const names = new Map((profiles.data as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));

      let pending: TeamOverview["pending"] = [];
      if (includePending) {
        const invitations = await db
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("organization_id", organizationId)
          .eq("kind", "member")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false });
        if (invitations.error) return err(fromDbError(invitations.error));
        pending = (invitations.data as { id: string; email: string; role: MemberRole; expires_at: string }[]).map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: new Date(row.expires_at),
          expired: new Date(row.expires_at).getTime() <= now.getTime(),
        }));
      }

      return ok({
        members: rows.map((m) => ({
          userId: m.user_id,
          name: names.get(m.user_id) || (m.user_id === currentUserId ? "Ty" : "Użytkownik bez imienia"),
          role: m.role,
          status: m.status,
          isYou: m.user_id === currentUserId,
        })),
        pending,
      });
    },
  };
}
