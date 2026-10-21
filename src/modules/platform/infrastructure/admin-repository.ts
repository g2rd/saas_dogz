import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { BetaCodeRow, OrganizationOverview, OrgStatus, StatusHistoryEntry } from "../domain/overview";

type OverviewRow = {
  organization_id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  access_until: string | null;
  status_reason: string | null;
  created_at: string;
  owner_email: string | null;
  owner_name: string | null;
  staff_count: number;
  active_staff_7d: number;
  clients_count: number;
  new_clients_7d: number;
  portal_clients_count: number;
  sessions_7d: number;
  sessions_30d: number;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  notifications_30d: number;
  push_devices: number;
  notes: string | null;
};

const date = (value: string | null) => (value ? new Date(value) : null);

function toOverview(row: OverviewRow): OrganizationOverview {
  return {
    id: row.organization_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    accessUntil: date(row.access_until),
    statusReason: row.status_reason,
    createdAt: new Date(row.created_at),
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    staffCount: row.staff_count,
    activeStaff7d: row.active_staff_7d,
    clientsCount: row.clients_count,
    newClients7d: row.new_clients_7d,
    portalClientsCount: row.portal_clients_count,
    sessions7d: row.sessions_7d,
    sessions30d: row.sessions_30d,
    lastSignInAt: date(row.last_sign_in_at),
    lastActivityAt: date(row.last_activity_at),
    notifications30d: row.notifications_30d,
    pushDevices: row.push_devices,
    notes: row.notes,
  };
}

/** Repozytorium panelu właściciela. Klient `db` musi być kluczem service_role (funkcje admin_* nie są dostępne dla innych ról). */
export function adminRepository(db: SupabaseClient, actorId: string) {
  return {
    async overview(): Promise<Result<OrganizationOverview[]>> {
      const { data, error } = await db.rpc("admin_organizations_overview");
      if (error) return err(fromDbError(error));
      return ok(((data ?? []) as OverviewRow[]).map(toOverview));
    },

    async setStatus(orgId: string, status: string, reason: string | null, accessUntil: Date | null): Promise<Result<void>> {
      const { error } = await db.rpc("admin_set_organization_status", {
        p_org: orgId,
        p_status: status,
        p_reason: reason,
        p_access_until: accessUntil?.toISOString() ?? null,
        p_actor: actorId,
      });
      return error ? err(fromDbError(error)) : ok(undefined);
    },

    async setNotes(orgId: string, notes: string): Promise<Result<void>> {
      const { error } = await db.rpc("admin_set_organization_notes", { p_org: orgId, p_notes: notes, p_actor: actorId });
      return error ? err(fromDbError(error)) : ok(undefined);
    },

    async history(orgId: string): Promise<Result<StatusHistoryEntry[]>> {
      const { data, error } = await db
        .from("audit_log")
        .select("id, action, created_at, changes")
        .eq("organization_id", orgId)
        .in("action", ["organization.status_changed", "organization.access_expired"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return err(fromDbError(error));
      type Row = { id: string; action: string; created_at: string; changes: Record<string, unknown> | null };
      return ok(
        ((data ?? []) as Row[]).map((row) => ({
          id: row.id,
          action: row.action,
          at: new Date(row.created_at),
          from: typeof row.changes?.from === "string" ? row.changes.from : null,
          to: typeof row.changes?.to === "string" ? row.changes.to : row.action === "organization.access_expired" ? "read_only" : null,
          reason: typeof row.changes?.reason === "string" ? row.changes.reason : null,
        })),
      );
    },

    async getSignupMode(): Promise<Result<"open" | "closed">> {
      const { data, error } = await db.from("platform_settings").select("value").eq("key", "signup_mode").maybeSingle();
      if (error) return err(fromDbError(error));
      return ok(data?.value === "closed" ? "closed" : "open");
    },

    async setSignupMode(mode: "open" | "closed"): Promise<Result<void>> {
      const { error } = await db.rpc("admin_set_signup_mode", { p_mode: mode, p_actor: actorId });
      return error ? err(fromDbError(error)) : ok(undefined);
    },

    async createBetaCode(codeHash: string, label: string, maxUses: number, expiresAt: Date | null): Promise<Result<string>> {
      const { data, error } = await db.rpc("admin_create_beta_code", {
        p_code_hash: codeHash,
        p_label: label,
        p_max_uses: maxUses,
        p_expires_at: expiresAt?.toISOString() ?? null,
        p_actor: actorId,
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async revokeBetaCode(codeId: string): Promise<Result<void>> {
      const { error } = await db.rpc("admin_revoke_beta_code", { p_code: codeId, p_actor: actorId });
      return error ? err(fromDbError(error)) : ok(undefined);
    },

    async listBetaCodes(): Promise<Result<BetaCodeRow[]>> {
      const { data, error } = await db
        .from("beta_codes")
        .select("id, label, max_uses, used_count, expires_at, revoked_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return err(fromDbError(error));
      type Row = {
        id: string;
        label: string;
        max_uses: number;
        used_count: number;
        expires_at: string | null;
        revoked_at: string | null;
        created_at: string;
      };
      return ok(
        ((data ?? []) as Row[]).map((row) => ({
          id: row.id,
          label: row.label,
          maxUses: row.max_uses,
          usedCount: row.used_count,
          expiresAt: date(row.expires_at),
          revokedAt: date(row.revoked_at),
          createdAt: new Date(row.created_at),
        })),
      );
    },
  };
}
