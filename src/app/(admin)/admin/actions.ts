"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createBetaCode,
  extendOrganizationAccess,
  revokeBetaCode,
  setFeedbackSeen,
  setOrganizationNotes,
  setOrganizationStatus,
  setSignupMode,
} from "@/modules/platform";
import { processNotificationsNow, sendTestNotification, simulateDaysAhead, type OutboxRunResult } from "@/modules/notifications";
import { toFormState, type FormState } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";
import { createUserClient } from "@/shared/supabase/server";
import { requireAdmin } from "../_lib/context";

export type AdminFormState = FormState & { message?: string; code?: string };

const refresh = () => revalidatePath("/admin", "layout");

export async function setStatusAction(orgId: string, _prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await setOrganizationStatus(ctx, orgId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  refresh();
  return { message: "Status zapisany." };
}

export async function extendAccessAction(orgId: string, _prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await extendOrganizationAccess(ctx, orgId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  refresh();
  return { message: "Dostęp przedłużony." };
}

export async function saveNotesAction(orgId: string, _prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await setOrganizationNotes(ctx, orgId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  refresh();
  return { message: "Notatka zapisana." };
}

export async function setSignupModeAction(mode: "open" | "closed"): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await setSignupMode(ctx, { mode });
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: mode === "closed" ? "Rejestracja zamknięta: wymagany kod." : "Rejestracja otwarta dla wszystkich." };
}

export async function createBetaCodeAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await createBetaCode(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  refresh();
  return { message: "Kod utworzony. Skopiuj go teraz: nie będzie można go zobaczyć ponownie.", code: result.value.display };
}

export async function revokeBetaCodeAction(codeId: string): Promise<AdminFormState> {
  const ctx = await requireAdmin();
  const result = await revokeBetaCode(ctx, codeId);
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: "Kod unieważniony." };
}

export async function setFeedbackSeenAction(id: string, seen: boolean): Promise<void> {
  const ctx = await requireAdmin();
  const result = await setFeedbackSeen(ctx, id, seen);
  if (!result.ok) throw new Error(result.error.message);
  revalidatePath("/admin/feedback");
}

export async function adminLogoutAction() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/login");
}

// --- sterowanie demo (wymaga DEMO_CONTROLS=1; patrz /admin/demo) -----------------------------------------------------------------

const summary = (run: OutboxRunResult) => `Przetworzono zdarzeń: ${run.processed}, nowych powiadomień: ${run.notifications}, błędów: ${run.failed}.`;

export async function demoTestNotificationAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(organizationId)) return { error: msg("errors.db.not_found") };
  const result = await sendTestNotification(organizationId);
  if (!result.ok) return toFormState(result.error, formData);
  return { message: `Wysłano powiadomienie testowe do właścicieli szkoły. ${summary(result.value)}` };
}

export async function demoProcessAction(): Promise<AdminFormState> {
  await requireAdmin();
  const result = await processNotificationsNow();
  if (!result.ok) return { error: result.error.message };
  return { message: summary(result.value) };
}

export async function demoSimulateAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const result = await simulateDaysAhead(Number(formData.get("days")));
  if (!result.ok) return toFormState(result.error, formData);
  return { message: `Symulacja +${Number(formData.get("days"))} dni: reguły dzienne dopisały zdarzeń: ${result.value.events}. ${summary(result.value.run)}` };
}
