"use server";

import { revalidatePath } from "next/cache";
import { claimSlot, joinWaitlist, leaveWaitlist, withdrawSlotClaim, type ClaimSlotState } from "@/modules/portal";
import { requirePortalContext } from "../_lib/context";

const refresh = () => revalidatePath("/portal", "layout");

export async function joinWaitlistAction() {
  const ctx = await requirePortalContext();
  const result = await joinWaitlist(ctx);
  if (!result.ok) throw new Error(result.error.message);
  refresh();
}

export async function leaveWaitlistAction() {
  const ctx = await requirePortalContext();
  const result = await leaveWaitlist(ctx);
  if (!result.ok) throw new Error(result.error.message);
  refresh();
}

/** „Biorę”: zgłoszenie do wolnego terminu; kolejność zgłoszeń widzi trener i on wybiera osobę. */
export async function claimSlotAction(_prev: ClaimSlotState, formData: FormData): Promise<ClaimSlotState> {
  const ctx = await requirePortalContext();
  const result = await claimSlot(ctx, Object.fromEntries(formData));
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: "Zgłoszono! Czekasz na decyzję trenera. Dostaniesz powiadomienie." };
}

export async function withdrawClaimAction(claimId: string) {
  const ctx = await requirePortalContext();
  const result = await withdrawSlotClaim(ctx, claimId);
  if (!result.ok) throw new Error(result.error.message);
  refresh();
}
