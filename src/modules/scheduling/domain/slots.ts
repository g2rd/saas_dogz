import { z } from "zod";
import { formText } from "@/shared/form";

export const createSlotOfferInputSchema = z.object({
  sessionId: z.uuid(),
  note: formText(300),
});

export type SlotClaimStatus = "pending" | "accepted" | "declined" | "withdrawn";

/** Zgłoszenie „Biorę”; kolejność na liście to kolejność zgłoszeń (created_at). */
export type SlotClaim = {
  id: string;
  clientId: string;
  clientName: string;
  dogName: string | null;
  status: SlotClaimStatus;
  createdAt: Date;
};

export type SlotOffer = {
  id: string;
  sessionId: string;
  typeName: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  note: string | null;
  status: "open" | "filled" | "closed";
  /** Oczekujące zgłoszenia od najwcześniejszego. */
  claims: SlotClaim[];
};
