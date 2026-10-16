import { formatIsoDate } from "@/shared/dates";
import { dateInZone, timeInZone } from "@/shared/time";
import { Badge } from "@/shared/ui/badge";
import { SubmitButton } from "@/shared/ui/form-fields";
import type { SlotOffer } from "../domain/slots";

/**
 * Otwarte ogłoszenia wolnych terminów z kolejką zgłoszeń „Biorę” (od pierwszego zgłoszonego).
 * Trener wybiera osobę; wybrana dostaje komunikat, pozostałe informację, że termin zajęty.
 */
export function SlotOfferPanel({
  offers,
  timezone,
  acceptAction,
  closeAction,
}: {
  offers: SlotOffer[];
  timezone: string;
  acceptAction: (claimId: string) => Promise<void>;
  closeAction: (offerId: string) => Promise<void>;
}) {
  if (offers.length === 0) return null;
  const stamp = (at: Date) => `${formatIsoDate(dateInZone(at, timezone))} ${timeInZone(at, timezone)}`;

  return (
    <section aria-labelledby="free-slots-heading" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
      <h2 id="free-slots-heading" className="text-lg font-semibold">
        Wolne terminy
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
                {offer.claims.length === 0 ? "Czeka na zgłoszenia" : `Zgłoszeń: ${offer.claims.length}`}
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
                        {claim.dogName ? ` · ${claim.dogName}` : ""} · zgłosił(a) się {timeInZone(claim.createdAt, timezone)}
                      </span>
                    </span>
                    <form action={acceptAction.bind(null, claim.id)}>
                      <SubmitButton pendingLabel="Zapisywanie...">Wybierz</SubmitButton>
                    </form>
                  </li>
                ))}
              </ol>
            ) : null}

            <form action={closeAction.bind(null, offer.id)} className="mt-3">
              <SubmitButton variant="secondary" pendingLabel="Zamykanie...">
                Zamknij ogłoszenie
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
