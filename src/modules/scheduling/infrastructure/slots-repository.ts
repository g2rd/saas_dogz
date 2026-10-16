import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { SlotClaim, SlotClaimStatus, SlotOffer } from "../domain/slots";

type OfferRow = {
  id: string;
  session_id: string;
  type_name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  note: string | null;
  status: "open" | "filled" | "closed";
};

type ClaimRow = { id: string; offer_id: string; client_id: string; dog_id: string | null; status: SlotClaimStatus; created_at: string };

/** Wolne terminy po stronie trenera (kontekst użytkownika, RLS obowiązuje). */
export function slotsRepository(db: SupabaseClient, organizationId: string) {
  return {
    async createOffer(sessionId: string, note: string): Promise<Result<string>> {
      const { data, error } = await db.rpc("create_slot_offer", { p_org: organizationId, p_session: sessionId, p_note: note || null });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async closeOffer(offerId: string): Promise<Result<void>> {
      const { error } = await db.rpc("close_slot_offer", { p_org: organizationId, p_offer: offerId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    /** Zatwierdza zgłoszenie: powstają zajęcia, zwraca ich identyfikator. */
    async acceptClaim(claimId: string): Promise<Result<string>> {
      const { data, error } = await db.rpc("accept_slot_claim", { p_org: organizationId, p_claim: claimId });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async waitlistCount(): Promise<Result<number>> {
      const { count, error } = await db
        .from("waitlist_entries")
        .select("client_id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) return err(fromDbError(error));
      return ok(count ?? 0);
    },

    /** Otwarte ogłoszenia z oczekującymi zgłoszeniami w kolejności zgłoszeń. */
    async listOpenOffers(): Promise<Result<SlotOffer[]>> {
      const offers = await db
        .from("slot_offers")
        .select("id, session_id, type_name, starts_at, ends_at, location, note, status")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .order("starts_at");
      if (offers.error) return err(fromDbError(offers.error));
      const offerRows = offers.data as OfferRow[];
      if (offerRows.length === 0) return ok([]);

      const claims = await db
        .from("slot_claims")
        .select("id, offer_id, client_id, dog_id, status, created_at")
        .eq("organization_id", organizationId)
        .in(
          "offer_id",
          offerRows.map((o) => o.id),
        )
        .eq("status", "pending")
        .order("created_at");
      if (claims.error) return err(fromDbError(claims.error));
      const claimRows = claims.data as ClaimRow[];

      const clientIds = [...new Set(claimRows.map((c) => c.client_id))];
      const dogIds = [...new Set(claimRows.flatMap((c) => (c.dog_id ? [c.dog_id] : [])))];
      const [clients, dogs] = await Promise.all([
        clientIds.length
          ? db.from("clients").select("id, first_name, last_name").eq("organization_id", organizationId).in("id", clientIds)
          : Promise.resolve({ data: [], error: null }),
        dogIds.length
          ? db.from("dogs").select("id, name").eq("organization_id", organizationId).in("id", dogIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clients.error) return err(fromDbError(clients.error));
      if (dogs.error) return err(fromDbError(dogs.error));
      const clientNames = new Map(
        (clients.data as { id: string; first_name: string; last_name: string }[]).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]),
      );
      const dogNames = new Map((dogs.data as { id: string; name: string }[]).map((d) => [d.id, d.name]));

      return ok(
        offerRows.map((o) => ({
          id: o.id,
          sessionId: o.session_id,
          typeName: o.type_name,
          startsAt: new Date(o.starts_at),
          endsAt: new Date(o.ends_at),
          location: o.location,
          note: o.note,
          status: o.status,
          claims: claimRows
            .filter((c) => c.offer_id === o.id)
            .map(
              (c): SlotClaim => ({
                id: c.id,
                clientId: c.client_id,
                clientName: clientNames.get(c.client_id) ?? "Klient",
                dogName: c.dog_id ? (dogNames.get(c.dog_id) ?? null) : null,
                status: c.status,
                createdAt: new Date(c.created_at),
              }),
            ),
        })),
      );
    },
  };
}
