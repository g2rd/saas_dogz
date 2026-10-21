"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveSessionType,
  cancelSession,
  completeSession,
  createSessionType,
  restoreCanceledSession,
  restoreSessionType,
  scheduleSession,
  undoCompleteSession,
  updateSessionType,
  type SessionActionState,
} from "@/modules/scheduling";
import { toFormState, type FormState } from "@/shared/form";
import type { Result } from "@/shared/result";
import { requireContext } from "../../_lib/context";
import { msg } from "@/shared/i18n/messages";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Po zmianie stanu zajęć odświeżamy cały panel (listy, karty klientów, saldo pakietów, pulpit). */
const refreshPanel = () => revalidatePath("/app", "layout");

export async function scheduleSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const result = await scheduleSession(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app/sessions");
}

export async function completeSessionAction(
  sessionId: string,
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const ctx = await requireContext();
  const result = await completeSession(ctx, sessionId, Object.fromEntries(formData));

  if (!result.ok) {
    const noPackage =
      result.error.code === "conflict" &&
      (result.error.details as { reason?: string } | undefined)?.reason === "no_package";
    return { error: result.error.message, noPackage };
  }

  refreshPanel();
  const { packageName, balanceAfter, chargeCreated } = result.value;
  if (packageName !== null) {
    return {
      message: msg("feedback.session_completed_with_package", { packageName, balanceAfter: balanceAfter ?? 0 }),
    };
  }
  return {
    message: chargeCreated
      ? msg("feedback.session_completed_charged")
      : msg("feedback.session_completed_free"),
  };
}

export async function cancelSessionAction(
  sessionId: string,
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const ctx = await requireContext();
  const result = await cancelSession(ctx, sessionId, Object.fromEntries(formData));
  if (!result.ok) return { error: result.error.message };

  refreshPanel();
  return {
    message: result.value.consumed
      ? msg("feedback.session_canceled_consumed", { balanceAfter: result.value.balanceAfter ?? 0 })
      : msg("feedback.session_canceled_free"),
  };
}

/** Cofnięcie zakończenia zajęć (tylko tego samego dnia): zajęcie wraca do pakietu. */
export async function undoCompleteSessionAction(
  sessionId: string,
): Promise<SessionActionState> {
  const ctx = await requireContext();
  const result = await undoCompleteSession(ctx, sessionId);
  if (!result.ok) return { error: result.error.message };
  refreshPanel();
  return { message: msg("feedback.session_completion_undone") };
}

/** Przywrócenie odwołanych zajęć: zajęcie wraca do pakietu, ogłoszenie wolnego terminu jest zamykane. */
export async function restoreSessionAction(
  sessionId: string,
): Promise<SessionActionState> {
  const ctx = await requireContext();
  const result = await restoreCanceledSession(ctx, sessionId);
  if (!result.ok) return { error: result.error.message };
  refreshPanel();
  return { message: msg("feedback.session_restored") };
}

// --- rodzaje zajęć ----------------------------------------------------------------------------------

export async function createSessionTypeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const result = await createSessionType(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app/sessions/types");
}

export async function updateSessionTypeAction(
  typeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await updateSessionType(ctx, typeId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app/sessions/types");
}

export async function archiveSessionTypeAction(typeId: string) {
  const ctx = await requireContext();
  unwrap(await archiveSessionType(ctx, typeId));
  redirect("/app/sessions/types");
}

export async function restoreSessionTypeAction(typeId: string) {
  const ctx = await requireContext();
  unwrap(await restoreSessionType(ctx, typeId));
  redirect("/app/sessions/types");
}
