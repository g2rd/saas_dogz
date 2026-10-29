"use server";

import { revalidatePath } from "next/cache";
import { cancelPackage } from "@/modules/packages";
import { voidPayment } from "@/modules/payments";
import { restoreCanceledSession, undoCompleteSession } from "@/modules/scheduling";
import { isUndoKind } from "@/modules/history";
import type { FormState } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";
import { requireContext } from "../../_lib/context";

/**
 * Cofnięcie zmiany z historii. Wykonują je te same przypadki użycia co przyciski na kartach klienta i zajęć, więc reguły (okno czasu,
 * pakiet nieużywany, uprawnienia, status szkoły) pilnuje baza; odmowa wraca jako komunikat pod wpisem.
 */
export async function undoHistoryAction(kind: string, entityId: string): Promise<FormState> {
  if (!isUndoKind(kind)) return { error: msg("errors.db.not_found") };
  const ctx = await requireContext();
  const result =
    kind === "void_payment"
      ? await voidPayment(ctx, entityId)
      : kind === "cancel_package"
        ? await cancelPackage(ctx, entityId)
        : kind === "undo_complete"
          ? await undoCompleteSession(ctx, entityId)
          : await restoreCanceledSession(ctx, entityId);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/app", "layout");
  return {};
}
