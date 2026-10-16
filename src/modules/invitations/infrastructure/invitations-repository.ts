import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { ClientAccessInfo, InvitationPreview } from "../domain/invitation";

type LookupRow = {
  status: "valid" | "not_found" | "used" | "revoked" | "expired";
  organization_name?: string;
  client_first_name?: string;
  email_required?: boolean;
  email_hint?: string | null;
  email_matches?: boolean | null;
  package?: { name: string; sessions_total: number; price_minor: number; currency: string } | null;
  expires_at?: string;
};

export type CreateInvitationCommand = {
  clientId: string;
  email: string | null;
  packageId: string | null;
  tokenHash: string;
  codeHash: string;
  expiresAt: Date;
};

export function invitationsRepository(db: SupabaseClient) {
  return {
    async create(organizationId: string, command: CreateInvitationCommand): Promise<Result<string>> {
      const { data, error } = await db.rpc("create_client_invitation", {
        p_org: organizationId,
        p_client: command.clientId,
        p_email: command.email,
        p_package: command.packageId,
        p_token_hash: command.tokenHash,
        p_code_hash: command.codeHash,
        p_expires_at: command.expiresAt.toISOString(),
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async lookup(secretHash: string, email: string | null): Promise<Result<InvitationPreview>> {
      const { data, error } = await db.rpc("lookup_invitation", { p_secret_hash: secretHash, p_email: email });
      if (error) return err(fromDbError(error));

      const row = data as LookupRow;
      if (row.status !== "valid") return ok({ status: row.status });
      return ok({
        status: "valid",
        organizationName: row.organization_name ?? "",
        clientFirstName: row.client_first_name ?? "",
        emailRequired: row.email_required ?? false,
        emailHint: row.email_hint ?? null,
        emailMatches: row.email_matches ?? null,
        package: row.package
          ? {
              name: row.package.name,
              sessionsTotal: row.package.sessions_total,
              priceMinor: row.package.price_minor,
              currency: row.package.currency,
            }
          : null,
        expiresAt: new Date(row.expires_at ?? Date.now()),
      });
    },

    async accept(secretHash: string): Promise<Result<{ clientId: string; organizationId: string }>> {
      const { data, error } = await db.rpc("accept_invitation", { p_secret_hash: secretHash });
      if (error) return err(fromDbError(error));
      const row = data as { client_id: string; organization_id: string };
      return ok({ clientId: row.client_id, organizationId: row.organization_id });
    },

    async revokeAccess(organizationId: string, clientId: string, userId: string): Promise<Result<void>> {
      const { error } = await db.rpc("revoke_client_access", {
        p_org: organizationId,
        p_client: clientId,
        p_user: userId,
      });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    /** Oczekujące zaproszenie klienta o danym skrócie tokenu (do wysyłki); null, gdy nieważne. */
    async findDeliverable(
      organizationId: string,
      clientId: string,
      tokenHash: string,
      now: Date,
    ): Promise<
      Result<{
        email: string | null;
        codeHash: string | null;
        expiresAt: Date;
        packageName: string | null;
        clientFirstName: string;
        clientEmail: string | null;
      } | null>
    > {
      const invitation = await db
        .from("invitations")
        .select("email, code_hash, expires_at, accepted_at, revoked_at, client_package_id")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("kind", "client")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (invitation.error) return err(fromDbError(invitation.error));
      const row = invitation.data as {
        email: string | null;
        code_hash: string | null;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
        client_package_id: string | null;
      } | null;
      if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at).getTime() <= now.getTime()) return ok(null);

      const client = await db
        .from("clients")
        .select("first_name, email")
        .eq("organization_id", organizationId)
        .eq("id", clientId)
        .maybeSingle();
      if (client.error) return err(fromDbError(client.error));
      const clientRow = client.data as { first_name: string; email: string | null } | null;
      if (!clientRow) return ok(null);

      let packageName: string | null = null;
      if (row.client_package_id) {
        const pkg = await db
          .from("client_packages")
          .select("name")
          .eq("organization_id", organizationId)
          .eq("id", row.client_package_id)
          .maybeSingle();
        packageName = (pkg.data as { name: string } | null)?.name ?? null;
      }

      return ok({
        email: row.email,
        codeHash: row.code_hash,
        expiresAt: new Date(row.expires_at),
        packageName,
        clientFirstName: clientRow.first_name,
        clientEmail: clientRow.email,
      });
    },

    async getAccessInfo(organizationId: string, clientId: string, now: Date): Promise<Result<ClientAccessInfo>> {
      const access = await db
        .from("client_access")
        .select("user_id, relation, created_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at");
      if (access.error) return err(fromDbError(access.error));

      const pending = await db
        .from("invitations")
        .select("id, email, client_package_id, created_at, expires_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("kind", "client")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending.error) return err(fromDbError(pending.error));

      let packageName: string | null = null;
      const pendingRow = pending.data as
        | { id: string; email: string | null; client_package_id: string | null; created_at: string; expires_at: string }
        | null;
      if (pendingRow?.client_package_id) {
        const pkg = await db
          .from("client_packages")
          .select("name")
          .eq("organization_id", organizationId)
          .eq("id", pendingRow.client_package_id)
          .maybeSingle();
        packageName = (pkg.data as { name: string } | null)?.name ?? null;
      }

      return ok({
        accounts: (access.data as { user_id: string; relation: "owner" | "family"; created_at: string }[]).map((row) => ({
          userId: row.user_id,
          relation: row.relation,
          since: new Date(row.created_at),
        })),
        pending: pendingRow
          ? {
              id: pendingRow.id,
              email: pendingRow.email,
              packageName,
              createdAt: new Date(pendingRow.created_at),
              expiresAt: new Date(pendingRow.expires_at),
              expired: new Date(pendingRow.expires_at).getTime() <= now.getTime(),
            }
          : null,
      });
    },
  };
}
