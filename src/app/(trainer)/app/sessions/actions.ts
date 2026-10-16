"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveSessionType,
  cancelSession,
  completeSession,
  createSessionType,
  restoreSessionType,
  scheduleSession,
  updateSessionType,
  type SessionActionState,
} from "@/modules/scheduling";
import { toFormState, type FormState } from "@/shared/form";
import type { Result } from "@/shared/result";
import { requireContext } from "../../_lib/context";

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
      message: `Zajęcia odbyte. Zużyto 1 zajęcie z pakietu „${packageName}”. Zostało ${balanceAfter}.`,
    };
  }
  return {
    message: chargeCreated
      ? "Zajęcia odbyte. Naliczono należność za pojedyncze zajęcia."
      : "Zajęcia odbyte (bez opłaty).",
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
      ? `Zajęcia odwołane. Zajęcie z pakietu przepadło (późne odwołanie). Zostało ${result.value.balanceAfter}.`
      : "Zajęcia odwołane bez naliczenia.",
  };
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
