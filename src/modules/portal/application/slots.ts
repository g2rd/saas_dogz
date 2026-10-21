import type { ClientRequestContext } from "@/shared/context";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { claimSlotInputSchema, type PortalSlots } from "../domain/slots";
import { portalRepository } from "../infrastructure/portal-repository";
import { portalSlotsRepository } from "../infrastructure/slots-repository";

const slotsRepo = (ctx: ClientRequestContext) => portalSlotsRepository(ctx.db, ctx.organizationId, ctx.clientId, ctx.userId);

/** Lista chętnych i otwarte wolne terminy klienta (oferty widoczne tylko dla zapisanych). */
export async function getPortalSlots(ctx: ClientRequestContext): Promise<Result<PortalSlots>> {
  const repo = slotsRepo(ctx);
  const portal = portalRepository(ctx.db, ctx.organizationId, ctx.clientId);
  const header = await portal.getHeader();
  if (!header.ok) return header;

  const [onWaitlist, offers, dogs] = await Promise.all([repo.isOnWaitlist(), repo.listOffers(), portal.listDogs()]);
  if (!onWaitlist.ok) return onWaitlist;
  if (!offers.ok) return offers;
  if (!dogs.ok) return dogs;

  return ok({
    timezone: header.value.timezone,
    onWaitlist: onWaitlist.value,
    offers: onWaitlist.value ? offers.value : [],
    dogs: dogs.value.filter((d) => d.approvalStatus === "approved").map((d) => ({ id: d.id, name: d.name })),
  });
}

export async function joinWaitlist(ctx: ClientRequestContext): Promise<Result<void>> {
  return slotsRepo(ctx).join();
}

export async function leaveWaitlist(ctx: ClientRequestContext): Promise<Result<void>> {
  return slotsRepo(ctx).leave();
}

/** „Biorę”: zgłoszenie do ogłoszonego terminu; trener widzi kolejność zgłoszeń i wybiera osobę. */
export async function claimSlot(ctx: ClientRequestContext, raw: unknown): Promise<Result<{ id: string; created: boolean }>> {
  const input = parseInput(claimSlotInputSchema, raw);
  if (!input.ok) return err(input.error);
  return slotsRepo(ctx).claim(input.value.offerId, input.value.dogId);
}

export async function withdrawSlotClaim(ctx: ClientRequestContext, claimId: string): Promise<Result<void>> {
  return slotsRepo(ctx).withdraw(claimId);
}
