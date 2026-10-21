"use server";

import { revalidatePath } from "next/cache";
import { acceptSlotClaim, closeSlotOffer, createSlotOffer, type AnnounceSlotState, type SlotActionState } from "@/modules/scheduling";
import { requireContext } from "../../_lib/context";
import { msg } from "@/shared/i18n/messages";

const refresh = () => revalidatePath("/app", "layout");

/** Ogłasza wolny termin (odwołane zajęcia): powiadomienie dostaną klienci z listy chętnych. */
export async function announceSlotAction(
  sessionId: string,
  _prev: AnnounceSlotState,
  formData: FormData,
): Promise<AnnounceSlotState> {
  const ctx = await requireContext();
  const result = await createSlotOffer(ctx, { sessionId, note: formData.get("note") ?? "" });
  if (!result.ok) return { error: result.error.message };
  refresh();
  return {
    message:
      result.value.waitlisted > 0
        ? msg("feedback.slot_announced", { count: result.value.waitlisted })
        : msg("feedback.slot_announced_empty"),
  };
}

/** Wybór zgłoszenia: powstają zajęcia, wybrany klient dostaje komunikat, pozostali informację o zajęciu terminu. */
export async function acceptSlotClaimAction(claimId: string): Promise<SlotActionState> {
  const ctx = await requireContext();
  const result = await acceptSlotClaim(ctx, claimId);
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: msg("feedback.slot_claim_accepted") };
}

export async function closeSlotOfferAction(offerId: string): Promise<SlotActionState> {
  const ctx = await requireContext();
  const result = await closeSlotOffer(ctx, offerId);
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { message: msg("feedback.slot_offer_closed") };
}
