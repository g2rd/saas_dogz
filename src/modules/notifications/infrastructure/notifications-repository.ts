import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import {
  DEFAULT_PREFERENCES,
  type Audience,
  type ChannelPreferences,
  type ClientRequest,
  type CreateRequestInput,
  type Notification,
  type PushSubscriptionInput,
  type RequestKind,
} from "../domain/notification";

type NotificationRow = {
  id: string;
  audience: Audience;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type RequestRow = {
  id: string;
  client_id: string;
  client_package_id: string | null;
  charge_id: string | null;
  kind: RequestKind;
  status: "new" | "seen";
  note: string | null;
  created_at: string;
};

/** Repozytorium w kontekście użytkownika: skrzynka, preferencje, subskrypcje push i prośby klienta (RLS obowiązuje). */
export function notificationsRepository(db: SupabaseClient, userId: string, organizationId: string) {
  return {
    async list(limit: number): Promise<Result<Notification[]>> {
      const { data, error } = await db
        .from("notifications")
        .select("id, audience, type, title, body, link, data, read_at, created_at")
        .eq("recipient_user_id", userId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return err(fromDbError(error));
      return ok(
        (data as NotificationRow[]).map((row) => ({
          id: row.id,
          audience: row.audience,
          type: row.type,
          title: row.title,
          body: row.body,
          link: row.link,
          data: row.data ?? {},
          read: row.read_at !== null,
          createdAt: new Date(row.created_at),
        })),
      );
    },

    async unreadCount(): Promise<Result<number>> {
      const { count, error } = await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .eq("organization_id", organizationId)
        .is("read_at", null);
      if (error) return err(fromDbError(error));
      return ok(count ?? 0);
    },

    async markRead(id: string, at: Date): Promise<Result<void>> {
      const { error } = await db
        .from("notifications")
        .update({ read_at: at.toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userId)
        .is("read_at", null);
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async markAllRead(at: Date): Promise<Result<void>> {
      const { error } = await db
        .from("notifications")
        .update({ read_at: at.toISOString() })
        .eq("recipient_user_id", userId)
        .eq("organization_id", organizationId)
        .is("read_at", null);
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async getPreferences(): Promise<Result<ChannelPreferences>> {
      const { data, error } = await db
        .from("notification_preferences")
        .select("push, email")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      return ok((data as ChannelPreferences | null) ?? DEFAULT_PREFERENCES);
    },

    async savePreferences(preferences: ChannelPreferences): Promise<Result<void>> {
      const { error } = await db.from("notification_preferences").upsert({ user_id: userId, ...preferences });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async countSubscriptions(): Promise<Result<number>> {
      const { count, error } = await db
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) return err(fromDbError(error));
      return ok(count ?? 0);
    },

    async savePushSubscription(input: PushSubscriptionInput): Promise<Result<void>> {
      // Brak polityki UPDATE: odświeżenie to usunięcie i ponowne dodanie tego samego punktu końcowego
      const removed = await db.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", input.endpoint);
      if (removed.error) return err(fromDbError(removed.error));
      const { error } = await db.from("push_subscriptions").insert({
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: input.userAgent ?? null,
      });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async removePushSubscription(endpoint: string): Promise<Result<void>> {
      const { error } = await db.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    // Prośby klienta ------------------------------------------------------------------------------------------------

    async createRequest(clientId: string, input: CreateRequestInput): Promise<Result<{ id: string; created: boolean }>> {
      const { data, error } = await db.rpc("create_client_request", {
        p_org: organizationId,
        p_client: clientId,
        p_kind: input.kind,
        p_package: input.packageId,
        p_charge: input.chargeId,
        p_note: input.note || null,
      });
      if (error) return err(fromDbError(error));
      const row = data as { id: string; created: boolean };
      return ok({ id: row.id, created: row.created });
    },

    /** Prośby widoczne dla zalogowanego (personel: wszystkie z organizacji, klient: własne). */
    async listRequests(options: { status?: "new" | "seen"; clientId?: string; limit: number }): Promise<Result<ClientRequest[]>> {
      let query = db
        .from("client_requests")
        .select("id, client_id, client_package_id, charge_id, kind, status, note, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(options.limit);
      if (options.status) query = query.eq("status", options.status);
      if (options.clientId) query = query.eq("client_id", options.clientId);
      const requests = await query;
      if (requests.error) return err(fromDbError(requests.error));
      const rows = requests.data as RequestRow[];
      if (rows.length === 0) return ok([]);

      const clientIds = [...new Set(rows.map((r) => r.client_id))];
      const packageIds = [...new Set(rows.flatMap((r) => (r.client_package_id ? [r.client_package_id] : [])))];
      const chargeIds = [...new Set(rows.flatMap((r) => (r.charge_id ? [r.charge_id] : [])))];

      const [clients, packages, charges] = await Promise.all([
        db.from("clients").select("id, first_name, last_name").eq("organization_id", organizationId).in("id", clientIds),
        packageIds.length
          ? db.from("client_packages").select("id, name").eq("organization_id", organizationId).in("id", packageIds)
          : Promise.resolve({ data: [], error: null }),
        chargeIds.length
          ? db.from("charges").select("id, description").eq("organization_id", organizationId).in("id", chargeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clients.error) return err(fromDbError(clients.error));
      if (packages.error) return err(fromDbError(packages.error));
      if (charges.error) return err(fromDbError(charges.error));

      const clientNames = new Map(
        (clients.data as { id: string; first_name: string; last_name: string }[]).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]),
      );
      const packageNames = new Map((packages.data as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      const chargeNames = new Map((charges.data as { id: string; description: string }[]).map((c) => [c.id, c.description]));

      return ok(
        rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          clientName: clientNames.get(row.client_id) ?? "Klient",
          kind: row.kind,
          status: row.status,
          packageId: row.client_package_id,
          chargeId: row.charge_id,
          packageName: row.client_package_id ? (packageNames.get(row.client_package_id) ?? null) : null,
          chargeDescription: row.charge_id ? (chargeNames.get(row.charge_id) ?? null) : null,
          note: row.note,
          createdAt: new Date(row.created_at),
        })),
      );
    },

    async countNewRequests(): Promise<Result<number>> {
      const { count, error } = await db
        .from("client_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "new");
      if (error) return err(fromDbError(error));
      return ok(count ?? 0);
    },

    async markRequestSeen(id: string, at: Date): Promise<Result<void>> {
      const { data, error } = await db
        .from("client_requests")
        .update({ status: "seen", seen_at: at.toISOString(), seen_by: userId })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .eq("status", "new")
        .select("id");
      if (error) return err(fromDbError(error));
      // Brak zmienionego wiersza: prośba już obejrzana albo niewidoczna dla użytkownika (RLS)
      void data;
      return ok(undefined);
    },
  };
}
