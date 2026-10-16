"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/modules/core";
import {
  markAllNotificationsRead,
  markClientRequestSeen,
  markNotificationRead,
  removePushSubscription,
  saveNotificationPreferences,
  savePushSubscription,
} from "@/modules/notifications";
import { toFormState, type FormState } from "@/shared/form";
import { requireContext } from "../../_lib/context";

const refresh = () => revalidatePath("/app", "layout");

/** Otwarcie powiadomienia: oznacza jako przeczytane i przechodzi do celu (tylko ścieżki wewnątrz panelu). */
export async function openNotificationAction(id: string, link: string | null) {
  const ctx = await requireContext();
  await markNotificationRead(ctx, id);
  refresh();
  redirect(safeNextPath(link, ["/app"], "/app/notifications"));
}

export async function markAllReadAction() {
  const ctx = await requireContext();
  await markAllNotificationsRead(ctx);
  refresh();
}

export async function savePreferencesAction(
  _prev: FormState & { saved?: boolean },
  formData: FormData,
): Promise<FormState & { saved?: boolean }> {
  const ctx = await requireContext();
  const result = await saveNotificationPreferences(ctx, {
    push: formData.get("push") === "on",
    email: formData.get("email") === "on",
    sms: formData.get("sms") === "on",
  });
  if (!result.ok) return toFormState(result.error, formData);
  return { saved: true };
}

export async function subscribePushAction(subscription: unknown): Promise<{ error?: string }> {
  const ctx = await requireContext();
  const result = await savePushSubscription(ctx, subscription);
  return result.ok ? {} : { error: result.error.message };
}

export async function unsubscribePushAction(endpoint: string): Promise<{ error?: string }> {
  const ctx = await requireContext();
  const result = await removePushSubscription(ctx, endpoint);
  return result.ok ? {} : { error: result.error.message };
}

export async function markRequestSeenAction(id: string) {
  const ctx = await requireContext();
  await markClientRequestSeen(ctx, id);
  refresh();
}
