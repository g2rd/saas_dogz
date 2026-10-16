"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/modules/core";
import {
  createClientRequest,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  saveNotificationPreferences,
  savePushSubscription,
  REQUEST_CONFIRMATIONS,
  type RespondState,
} from "@/modules/notifications";
import { toFormState, type FormState } from "@/shared/form";
import { requirePortalContext } from "../../_lib/context";

const refresh = () => revalidatePath("/portal", "layout");

/** Otwarcie powiadomienia: oznacza jako przeczytane i przechodzi do celu (tylko ścieżki wewnątrz panelu klienta). */
export async function openPortalNotificationAction(id: string, link: string | null) {
  const ctx = await requirePortalContext();
  await markNotificationRead(ctx, id);
  refresh();
  redirect(safeNextPath(link, ["/portal"], "/portal/notifications"));
}

export async function markAllPortalReadAction() {
  const ctx = await requirePortalContext();
  await markAllNotificationsRead(ctx);
  refresh();
}

export async function savePortalPreferencesAction(
  _prev: FormState & { saved?: boolean },
  formData: FormData,
): Promise<FormState & { saved?: boolean }> {
  const ctx = await requirePortalContext();
  const result = await saveNotificationPreferences(ctx, {
    push: formData.get("push") === "on",
    email: formData.get("email") === "on",
    sms: formData.get("sms") === "on",
  });
  if (!result.ok) return toFormState(result.error, formData);
  return { saved: true };
}

export async function subscribePortalPushAction(subscription: unknown): Promise<{ error?: string }> {
  const ctx = await requirePortalContext();
  const result = await savePushSubscription(ctx, subscription);
  return result.ok ? {} : { error: result.error.message };
}

export async function unsubscribePortalPushAction(endpoint: string): Promise<{ error?: string }> {
  const ctx = await requirePortalContext();
  const result = await removePushSubscription(ctx, endpoint);
  return result.ok ? {} : { error: result.error.message };
}

/** Klient odpowiada na powiadomienie („Odnów pakiet”, „Zapłacę”, „Kończę współpracę”); trener dostaje informację. */
export async function respondAction(_prev: RespondState, formData: FormData): Promise<RespondState> {
  const ctx = await requirePortalContext();
  const result = await createClientRequest(ctx, Object.fromEntries(formData));
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: REQUEST_CONFIRMATIONS[result.value.kind] };
}
