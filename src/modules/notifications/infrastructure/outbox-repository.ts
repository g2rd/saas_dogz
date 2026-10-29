import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelPreferences, Channel, NotificationDraft, OutboxEvent, RequestKind } from "../domain/notification";
import type { EventFacts } from "../domain/plan";
import type { PushTarget } from "../application/ports";

type EventRow = { id: string; organization_id: string | null; type: string; payload: Record<string, unknown>; attempts: number };

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * Repozytorium procesora outbox. Działa na kliencie service_role (omija RLS), więc każde zapytanie
 * jawnie zawęża dane do organizacji zdarzenia.
 */
export function outboxRepository(db: SupabaseClient) {
  return {
    async enqueueDaily(now: Date): Promise<number> {
      return must(await db.rpc("enqueue_daily_notification_events", { p_now: now.toISOString() }), "enqueue") as number;
    },

    /** Szkoły z upłyniętym terminem dostępu przechodzą w tryb „tylko do odczytu” (właściciele dostają powiadomienie). */
    async expireAccess(): Promise<number> {
      return must(await db.rpc("expire_organization_access"), "expireAccess") as number;
    },

    async claim(limit: number): Promise<OutboxEvent[]> {
      const rows = must(await db.rpc("claim_outbox_events", { p_limit: limit }), "claim") as EventRow[];
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        type: row.type,
        payload: row.payload ?? {},
        attempts: row.attempts,
      }));
    },

    async markProcessed(id: string): Promise<void> {
      must(
        await db.from("outbox_events").update({ processed_at: new Date().toISOString(), locked_until: null, last_error: null }).eq("id", id),
        "markProcessed",
      );
    },

    async markFailed(id: string, message: string): Promise<void> {
      must(await db.from("outbox_events").update({ last_error: message.slice(0, 500) }).eq("id", id), "markFailed");
    },

    /** Liczba zdarzeń, które wyczerpały próby (do alertu o zalegającym outbox). */
    async countStuck(): Promise<number> {
      const result = await db
        .from("outbox_events")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null)
        .gte("attempts", 5);
      return result.count ?? 0;
    },

    /** Fakty o kliencie, pakiecie, należności, zajęciach i prośbie potrzebne do ułożenia powiadomień. */
    async loadFacts(event: OutboxEvent): Promise<EventFacts | null> {
      const orgId = event.organizationId;
      if (!orgId) return null;
      const payload = event.payload;

      // Zmiana statusu szkoły przez właściciela platformy: wiadomość dla właścicieli i administratorów, bez klienta
      if (event.type === "organization.status_changed" || event.type === "organization.access_ending") {
        const staff = must(
          await db.from("organization_members").select("user_id, role").eq("organization_id", orgId).eq("status", "active"),
          "members",
        ) as { user_id: string; role: string }[];
        const settings = must(
          await db.from("organization_settings").select("timezone").eq("organization_id", orgId).maybeSingle(),
          "settings",
        ) as { timezone: string } | null;
        return {
          clientId: null,
          clientName: "",
          clientUserIds: [],
          staffUserIds: staff.filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.user_id),
          timezone: settings?.timezone ?? "Europe/Warsaw",
          package: null,
          charge: null,
          session: null,
          request: null,
          offer: null,
        };
      }

      let clientId = str(payload.client_id);
      let request: EventFacts["request"] = null;
      let requestSessionId: string | null = null;
      if (event.type === "client_request.created") {
        const row = must(
          await db
            .from("client_requests")
            .select("id, client_id, kind, note, client_package_id, session_id")
            .eq("organization_id", orgId)
            .eq("id", str(payload.request_id) ?? "")
            .maybeSingle(),
          "request",
        ) as { id: string; client_id: string; kind: RequestKind; note: string | null; client_package_id: string | null; session_id: string | null } | null;
        if (!row) return null;
        clientId = row.client_id;
        let packageName: string | null = null;
        if (row.client_package_id) {
          const pkg = must(
            await db.from("client_packages").select("name").eq("organization_id", orgId).eq("id", row.client_package_id).maybeSingle(),
            "request package",
          ) as { name: string } | null;
          packageName = pkg?.name ?? null;
        }
        request = { id: row.id, kind: row.kind, note: row.note, packageName };
        requestSessionId = row.session_id;
      }
      if (!clientId) return null;

      const client = must(
        await db
          .from("clients")
          .select("first_name, last_name, assigned_trainer_id")
          .eq("organization_id", orgId)
          .eq("id", clientId)
          .maybeSingle(),
        "client",
      ) as { first_name: string; last_name: string; assigned_trainer_id: string | null } | null;
      if (!client) return null;

      const settings = must(
        await db.from("organization_settings").select("timezone").eq("organization_id", orgId).maybeSingle(),
        "settings",
      ) as { timezone: string } | null;

      const access = must(
        await db.from("client_access").select("user_id").eq("organization_id", orgId).eq("client_id", clientId).eq("status", "active"),
        "access",
      ) as { user_id: string }[];

      const members = must(
        await db.from("organization_members").select("user_id, role").eq("organization_id", orgId).eq("status", "active"),
        "members",
      ) as { user_id: string; role: string }[];
      const assigned = client.assigned_trainer_id
        ? members.find((m) => m.user_id === client.assigned_trainer_id && ["owner", "admin", "trainer"].includes(m.role))
        : undefined;
      const staffUserIds = assigned
        ? [assigned.user_id]
        : members.filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.user_id);

      const packageId = str(payload.client_package_id) ?? str(payload.package_id);
      let pkg: EventFacts["package"] = null;
      if (packageId) {
        const row = must(
          await db.from("v_client_package_balance").select("id, name, balance").eq("organization_id", orgId).eq("id", packageId).maybeSingle(),
          "package",
        ) as { id: string; name: string; balance: number } | null;
        if (row) {
          const eventBalance = typeof payload.balance === "number" ? payload.balance : null;
          pkg = { id: row.id, name: row.name, balance: eventBalance ?? row.balance };
        }
      }

      let charge: EventFacts["charge"] = null;
      const chargeId = str(payload.charge_id);
      if (chargeId) {
        const row = must(
          await db
            .from("v_charge_balance")
            .select("id, description, amount_minor, allocated_minor, currency, due_date, voided_at")
            .eq("organization_id", orgId)
            .eq("id", chargeId)
            .maybeSingle(),
          "charge",
        ) as {
          id: string;
          description: string;
          amount_minor: number;
          allocated_minor: number;
          currency: string;
          due_date: string;
          voided_at: string | null;
        } | null;
        if (row) {
          charge = {
            id: row.id,
            description: row.description,
            remainingMinor: row.voided_at ? 0 : Math.max(row.amount_minor - row.allocated_minor, 0),
            currency: row.currency,
            dueDate: row.due_date,
          };
        }
      }

      let session: EventFacts["session"] = null;
      const sessionId = str(payload.session_id) ?? requestSessionId;
      if (sessionId) {
        const row = must(
          await db.from("training_sessions").select("id, starts_at, status").eq("organization_id", orgId).eq("id", sessionId).maybeSingle(),
          "session",
        ) as { id: string; starts_at: string; status: string } | null;
        // Przypomnienie o odwołanych lub już odbytych zajęciach nie ma sensu
        if (row && (event.type !== "training_session.reminder" || row.status === "scheduled")) {
          session = { id: row.id, startsAt: new Date(row.starts_at) };
        }
      }

      // Ogłoszony wolny termin: kopia danych oferty (czas i rodzaj zajęć); dla zdarzeń bez własnej sesji to też czas zajęć
      let offer: EventFacts["offer"] = null;
      const offerId = str(payload.offer_id);
      if (offerId) {
        const row = must(
          await db
            .from("slot_offers")
            .select("session_id, type_name, note, starts_at")
            .eq("organization_id", orgId)
            .eq("id", offerId)
            .maybeSingle(),
          "offer",
        ) as { session_id: string; type_name: string; note: string | null; starts_at: string } | null;
        if (row) {
          offer = { typeName: row.type_name, note: row.note };
          session ??= { id: row.session_id, startsAt: new Date(row.starts_at) };
        }
      }

      return {
        clientId,
        clientName: `${client.first_name} ${client.last_name}`.trim(),
        clientUserIds: access.map((a) => a.user_id),
        staffUserIds,
        timezone: settings?.timezone ?? "Europe/Warsaw",
        package: pkg,
        charge,
        session,
        request,
        offer,
      };
    },

    /** Klienci z listy chętnych (z aktywnym dostępem do panelu), poza wykluczonym; odbiorcy ogłoszenia wolnego terminu. */
    async waitlistClientIds(organizationId: string, excludeClientId: string | null): Promise<string[]> {
      const rows = must(
        await db.from("waitlist_entries").select("client_id").eq("organization_id", organizationId),
        "waitlist",
      ) as { client_id: string }[];
      return rows.map((r) => r.client_id).filter((id) => id !== excludeClientId);
    },

    /** Zapisuje powiadomienie; gdy już istnieje (ponowienie zdarzenia), zwraca istniejące z `created: false`. */
    async saveNotification(
      organizationId: string,
      draft: NotificationDraft,
      text: { title: string; body: string },
    ): Promise<{ id: string; created: boolean }> {
      const inserted = await db
        .from("notifications")
        .insert({
          organization_id: organizationId,
          recipient_user_id: draft.recipientUserId,
          audience: draft.audience,
          client_id: draft.clientId,
          type: draft.type,
          title: text.title,
          body: text.body,
          message_key: draft.messageKey,
          message_params: draft.params,
          link: draft.link,
          data: draft.data,
          dedupe_key: draft.dedupeKey,
        })
        .select("id")
        .single();
      if (!inserted.error) return { id: (inserted.data as { id: string }).id, created: true };
      if (inserted.error.code !== "23505") throw new Error(`notification: ${inserted.error.message}`);

      const existing = must(
        await db
          .from("notifications")
          .select("id")
          .eq("recipient_user_id", draft.recipientUserId)
          .eq("dedupe_key", draft.dedupeKey)
          .single(),
        "existing notification",
      ) as { id: string };
      return { id: existing.id, created: false };
    },

    async finishedChannels(notificationId: string): Promise<Set<Channel>> {
      const rows = must(
        await db.from("notification_log").select("channel, status").eq("notification_id", notificationId),
        "log",
      ) as { channel: Channel; status: string }[];
      return new Set(rows.filter((r) => r.status !== "failed").map((r) => r.channel));
    },

    async logDelivery(notificationId: string, channel: Channel, status: string, detail: string | null): Promise<void> {
      must(
        await db
          .from("notification_log")
          .upsert(
            { notification_id: notificationId, channel, status, detail: detail?.slice(0, 300) ?? null, updated_at: new Date().toISOString() },
            { onConflict: "notification_id,channel" },
          ),
        "logDelivery",
      );
    },

    async preferencesFor(userId: string): Promise<ChannelPreferences | null> {
      const row = must(
        await db.from("notification_preferences").select("push, email").eq("user_id", userId).maybeSingle(),
        "preferences",
      ) as ChannelPreferences | null;
      return row;
    },

    /** Język odbiorcy z profilu (`profiles.locale`); `null`, gdy brak profilu. */
    async localeFor(userId: string): Promise<string | null> {
      const row = must(await db.from("profiles").select("locale").eq("id", userId).maybeSingle(), "locale") as { locale: string } | null;
      return row?.locale ?? null;
    },

    async emailFor(userId: string): Promise<string | null> {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) throw new Error(`user: ${error.message}`);
      return data.user?.email ?? null;
    },

    async pushTargets(userId: string): Promise<PushTarget[]> {
      const rows = must(
        await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
        "push",
      ) as PushTarget[];
      return rows;
    },

    async deletePushTarget(id: string): Promise<void> {
      must(await db.from("push_subscriptions").delete().eq("id", id), "deletePush");
    },
  };
}
