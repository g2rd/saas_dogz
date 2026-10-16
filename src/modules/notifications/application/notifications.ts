import { authorize } from "@/modules/core";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import {
  createRequestInputSchema,
  preferencesInputSchema,
  pushSubscriptionSchema,
  type ChannelPreferences,
  type ClientRequest,
  type Notification,
} from "../domain/notification";
import { notificationsRepository } from "../infrastructure/notifications-repository";

/** Minimalny kontekst potrzebny do skrzynki: spełniają go zarówno kontekst personelu, jak i klienta. */
export type InboxScope = Pick<RequestContext, "userId" | "organizationId" | "db" | "clock">;

const repoFor = (scope: InboxScope) => notificationsRepository(scope.db, scope.userId, scope.organizationId);

export async function listNotifications(scope: InboxScope, limit = 30): Promise<Result<Notification[]>> {
  return repoFor(scope).list(limit);
}

export async function countUnreadNotifications(scope: InboxScope): Promise<Result<number>> {
  return repoFor(scope).unreadCount();
}

export async function markNotificationRead(scope: InboxScope, id: string): Promise<Result<void>> {
  return repoFor(scope).markRead(id, scope.clock.now());
}

export async function markAllNotificationsRead(scope: InboxScope): Promise<Result<void>> {
  return repoFor(scope).markAllRead(scope.clock.now());
}

export async function getNotificationPreferences(
  scope: InboxScope,
): Promise<Result<{ preferences: ChannelPreferences; pushDevices: number }>> {
  const repo = repoFor(scope);
  const [preferences, devices] = await Promise.all([repo.getPreferences(), repo.countSubscriptions()]);
  if (!preferences.ok) return preferences;
  if (!devices.ok) return devices;
  return ok({ preferences: preferences.value, pushDevices: devices.value });
}

export async function saveNotificationPreferences(scope: InboxScope, raw: unknown): Promise<Result<void>> {
  const input = parseInput(preferencesInputSchema, raw);
  if (!input.ok) return err(input.error);
  return repoFor(scope).savePreferences(input.value);
}

export async function savePushSubscription(scope: InboxScope, raw: unknown): Promise<Result<void>> {
  const input = parseInput(pushSubscriptionSchema, raw);
  if (!input.ok) return err(input.error);
  return repoFor(scope).savePushSubscription(input.value);
}

export async function removePushSubscription(scope: InboxScope, endpoint: string): Promise<Result<void>> {
  return repoFor(scope).removePushSubscription(endpoint);
}

/**
 * Klient odpowiada na powiadomienie: „Odnów pakiet”, „Zapłacę” albo „Kończę współpracę”. Prośba jest tylko
 * informacją dla trenera (bez akceptacji). Powtórne kliknięcie nie tworzy duplikatu.
 */
export async function createClientRequest(
  ctx: ClientRequestContext,
  raw: unknown,
): Promise<Result<{ id: string; created: boolean; kind: ClientRequest["kind"] }>> {
  const input = parseInput(createRequestInputSchema, raw);
  if (!input.ok) return err(input.error);
  if (input.value.kind === "renew" && !input.value.packageId) {
    return err(appError("validation", "Wskaż pakiet, który chcesz odnowić."));
  }

  const created = await notificationsRepository(ctx.db, ctx.userId, ctx.organizationId).createRequest(ctx.clientId, input.value);
  if (!created.ok) return created;
  return ok({ ...created.value, kind: input.value.kind });
}

/** Otwarte (nieobejrzane) prośby zalogowanego klienta, żeby panel nie pokazywał ponownie tych samych przycisków. */
export async function listMyOpenRequests(ctx: ClientRequestContext): Promise<Result<ClientRequest[]>> {
  return notificationsRepository(ctx.db, ctx.userId, ctx.organizationId).listRequests({
    status: "new",
    clientId: ctx.clientId,
    limit: 20,
  });
}

/** Prośby klientów dla trenera. */
export async function listClientRequests(
  ctx: RequestContext,
  options: { status?: "new" | "seen" } = {},
): Promise<Result<ClientRequest[]>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return notificationsRepository(ctx.db, ctx.userId, ctx.organizationId).listRequests({ ...options, limit: 50 });
}

export async function countNewClientRequests(ctx: RequestContext): Promise<Result<number>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return ok(0);
  return notificationsRepository(ctx.db, ctx.userId, ctx.organizationId).countNewRequests();
}

export async function markClientRequestSeen(ctx: RequestContext, id: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return notificationsRepository(ctx.db, ctx.userId, ctx.organizationId).markRequestSeen(id, ctx.clock.now());
}
