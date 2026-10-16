import { z } from "zod";

export const claimSlotInputSchema = z.object({
  offerId: z.uuid(),
  dogId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
});

export type PortalSlotOffer = {
  id: string;
  typeName: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  note: string | null;
  /** Moje oczekujące zgłoszenie do tego terminu (klient nie widzi cudzych zgłoszeń). */
  myClaim: { id: string; createdAt: Date } | null;
};

export type PortalSlots = {
  timezone: string;
  /** Czy klient jest zapisany na listę chętnych na wolne terminy. */
  onWaitlist: boolean;
  offers: PortalSlotOffer[];
  /** Zatwierdzone psy klienta do wyboru przy zgłoszeniu. */
  dogs: { id: string; name: string }[];
};
