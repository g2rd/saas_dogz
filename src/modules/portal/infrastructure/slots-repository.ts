import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { PortalSlotOffer } from "../domain/slots";

/** Wolne terminy i lista chętnych po stronie klienta (kontekst użytkownika, RLS obowiązuje). */
export function portalSlotsRepository(db: SupabaseClient, organizationId: string, clientId: string, userId: string) {
  return {
    async isOnWaitlist(): Promise<Result<boolean>> {
      const { count, error } = await db
        .from("waitlist_entries")
        .select("client_id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if (error) return err(fromDbError(error));
      return ok((count ?? 0) > 0);
    },

    async join(): Promise<Result<void>> {
      const { error } = await db
        .from("waitlist_entries")
        .upsert({ organization_id: organizationId, client_id: clientId, created_by: userId }, { onConflict: "client_id", ignoreDuplicates: true });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async leave(): Promise<Result<void>> {
      const { error } = await db.from("waitlist_entries").delete().eq("client_id", clientId);
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    /** Otwarte oferty (RLS pokazuje je tylko klientom z listy chętnych) z moimi oczekującymi zgłoszeniami. */
    async listOffers(): Promise<Result<PortalSlotOffer[]>> {
      const offers = await db
        .from("slot_offers")
        .select("id, type_name, starts_at, ends_at, location, note")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at");
      if (offers.error) return err(fromDbError(offers.error));
      const rows = offers.data as {
        id: string;
        type_name: string;
        starts_at: string;
        ends_at: string;
        location: string | null;
        note: string | null;
      }[];

      const claims = await db
        .from("slot_claims")
        .select("id, offer_id, created_at")
        .eq("client_id", clientId)
        .eq("status", "pending");
      if (claims.error) return err(fromDbError(claims.error));
      const mine = new Map(
        (claims.data as { id: string; offer_id: string; created_at: string }[]).map((c) => [c.offer_id, { id: c.id, createdAt: new Date(c.created_at) }]),
      );

      return ok(
        rows.map((row) => ({
          id: row.id,
          typeName: row.type_name,
          startsAt: new Date(row.starts_at),
          endsAt: new Date(row.ends_at),
          location: row.location,
          note: row.note,
          myClaim: mine.get(row.id) ?? null,
        })),
      );
    },

    async claim(offerId: string, dogId: string | null): Promise<Result<{ id: string; created: boolean }>> {
      const { data, error } = await db.rpc("claim_slot", { p_org: organizationId, p_offer: offerId, p_client: clientId, p_dog: dogId });
      if (error) return err(fromDbError(error));
      return ok(data as { id: string; created: boolean });
    },

    async withdraw(claimId: string): Promise<Result<void>> {
      const { error } = await db.rpc("withdraw_slot_claim", { p_org: organizationId, p_claim: claimId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },
  };
}
