
import { dateInZone, timeInZone } from "@/shared/time";
import { Badge } from "@/shared/ui/badge";
import type { SlotOffer } from "../domain/slots";
import { AcceptClaimForm, CloseOfferForm, type SlotActionState } from "./slot-offer-forms";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

/**
 * Otwarte ogłoszenia wolnych terminów z kolejką zgłoszeń „Biorę” (od pierwszego zgłoszonego).
 * Trener wybiera osobę; wybrana dostaje komunikat, pozostałe informację, że termin zajęty.
 */
export async function SlotOfferPanel({
  offers,
  timezone,
  acceptAction,
  closeAction,
}: {
  offers: SlotOffer[];
  timezone: string;
  acceptAction: (claimId: string) => Promise<SlotActionState>;
  closeAction: (offerId: string) => Promise<SlotActionState>;
}) {
  const formats = await getFormats();
  const t = await getTranslations();
  if (offers.length === 0) return null;
  const stamp = (at: Date) => `${formats.calendarDate(dateInZone(at, timezone))} ${timeInZone(at, timezone)}`;

  return (
    <section aria-labelledby="free-slots-heading" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
      <h2 id="free-slots-heading" className="text-lg font-semibold">
        {t("common.wolne_terminy")}
      </h2>
      <ul className="mt-3 flex flex-col gap-4">
        {offers.map((offer) => (
          <li key={offer.id} className="rounded-xl border border-emerald-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold tabular-nums">
                  {stamp(offer.startsAt)}–{timeInZone(offer.endsAt, timezone)}
                </p>
                <p className="text-sm text-zinc-600">{[offer.typeName, offer.location, offer.note].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge tone={offer.claims.length > 0 ? "warning" : "neutral"}>
                {offer.claims.length === 0 ? t("scheduling.slotOfferPanel.czeka_na_zgloszenia") : t("scheduling.slotOfferPanel.zgloszen_length", { length: offer.claims.length })}
              </Badge>
            </div>

            {offer.claims.length > 0 ? (
              <ol className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
                {offer.claims.map((claim, index) => (
                  <li key={claim.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium">
                        {index + 1}. {claim.clientName}
                      </span>
                      <span className="text-sm text-zinc-600">
                        {t("scheduling.slotOfferPanel.value_zglosil_a_sie_timeinzone", { value: claim.dogName ? ` · ${claim.dogName}` : "", timeInZone: timeInZone(claim.createdAt, timezone) })}
                      </span>
                    </span>
                                    <AcceptClaimForm
                      action={acceptAction.bind(null, claim.id)}
                      clientName={claim.clientName}
                      when={stamp(offer.startsAt)}
                    />
                  </li>
                ))}
              </ol>
            ) : null}

            <CloseOfferForm action={closeAction.bind(null, offer.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
