"use server";

import { revalidatePath } from "next/cache";
import { acceptSlotClaim, closeSlotOffer, createSlotOffer, type AnnounceSlotState } from "@/modules/scheduling";
import { requireContext } from "../../_lib/context";

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
        ? `Ogłoszono. Powiadomienie dostanie do ${result.value.waitlisted} osób z listy chętnych.`
        : "Ogłoszono, ale lista chętnych jest pusta: nikt nie dostanie powiadomienia, dopóki klienci się nie zapiszą.",
  };
}

/** Wybór zgłoszenia: powstają zajęcia, wybrany klient dostaje komunikat, pozostali informację o zajęciu terminu. */
export async function acceptSlotClaimAction(claimId: string) {
  const ctx = await requireContext();
  const result = await acceptSlotClaim(ctx, claimId);
  if (!result.ok) throw new Error(result.error.message);
  refresh();
}

export async function closeSlotOfferAction(offerId: string) {
  const ctx = await requireContext();
  const result = await closeSlotOffer(ctx, offerId);
  if (!result.ok) throw new Error(result.error.message);
  refresh();
}
