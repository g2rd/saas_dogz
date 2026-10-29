import { authorize } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { createSlotOfferInputSchema, type SlotOffer } from "../domain/slots";
import { slotsRepository } from "../infrastructure/slots-repository";

/** Ogłasza zwolniony (odwołany) termin klientom z listy chętnych; powiadomienie push i e-mail wysyła procesor outbox. */
export async function createSlotOffer(ctx: RequestContext, raw: unknown): Promise<Result<{ offerId: string; waitlisted: number }>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(createSlotOfferInputSchema, raw);
  if (!input.ok) return err(input.error);

  const repo = slotsRepository(ctx.db, ctx.organizationId);
  const created = await repo.createOffer(input.value.sessionId, input.value.note);
  if (!created.ok) return created;
  const waitlisted = await repo.waitlistCount();
  return ok({ offerId: created.value, waitlisted: waitlisted.ok ? waitlisted.value : 0 });
}

export async function closeSlotOffer(ctx: RequestContext, offerId: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;
  return slotsRepository(ctx.db, ctx.organizationId).closeOffer(offerId);
}

/** Wybór zgłoszenia przez trenera: tworzy zajęcia dla wybranego klienta, resztę odrzuca, wybranemu wysyła komunikat. */
export async function acceptSlotClaim(ctx: RequestContext, claimId: string): Promise<Result<{ sessionId: string }>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;
  const accepted = await slotsRepository(ctx.db, ctx.organizationId).acceptClaim(claimId);
  if (!accepted.ok) return accepted;
  return ok({ sessionId: accepted.value });
}

/** Skrót dla pulpitu: ilu klientów czeka na wolny termin, ile ogłoszeń jest otwartych i ile zgłoszeń czeka na wybór trenera. */
export type SlotSummary = { waitlist: number; openOffers: number; pendingClaims: number };

export async function getSlotSummary(ctx: RequestContext): Promise<Result<SlotSummary>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;
  const repo = slotsRepository(ctx.db, ctx.organizationId);
  const [waitlist, offers] = await Promise.all([repo.waitlistCount(), repo.listOpenOffers()]);
  if (!waitlist.ok) return waitlist;
  if (!offers.ok) return offers;
  return ok({
    waitlist: waitlist.value,
    openOffers: offers.value.length,
    pendingClaims: offers.value.reduce((sum, offer) => sum + offer.claims.length, 0),
  });
}

export async function listOpenSlotOffers(ctx: RequestContext): Promise<Result<SlotOffer[]>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;
  return slotsRepository(ctx.db, ctx.organizationId).listOpenOffers();
}
