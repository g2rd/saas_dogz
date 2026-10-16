import { ClaimSlotForm, getPortalSlots } from "@/modules/portal";
import { formatIsoDate } from "@/shared/dates";
import { SubmitButton } from "@/shared/ui/form-fields";
import { dateInZone, timeInZone } from "@/shared/time";
import { requirePortalContext } from "../_lib/context";
import { claimSlotAction, joinWaitlistAction, leaveWaitlistAction, withdrawClaimAction } from "./slots-actions";

/**
 * Lista chętnych i wolne terminy klienta. Zapisany na listę dostaje powiadomienia o zwolnionych terminach i może zgłosić
 * „Biorę”; trener widzi kolejność zgłoszeń i wybiera osobę. `compact` pokazuje tylko ogłoszenia (strona startowa).
 */
export async function SlotsSection({ compact = false }: { compact?: boolean }) {
  const ctx = await requirePortalContext();
  const result = await getPortalSlots(ctx);
  if (!result.ok) return null;
  const { onWaitlist, offers, timezone, dogs } = result.value;
  if (compact && onWaitlist && offers.length === 0) return null;

  return (
    <section aria-labelledby="slots-heading" className="flex flex-col gap-3">
      <h2 id="slots-heading" className="text-lg font-semibold">
        Wolne terminy
      </h2>

      {offers.map((offer) => (
        <div key={offer.id} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-semibold">
            {formatIsoDate(dateInZone(offer.startsAt, timezone))}, {timeInZone(offer.startsAt, timezone)}–
            {timeInZone(offer.endsAt, timezone)}
          </p>
          <p className="text-sm text-zinc-700">{[offer.typeName, offer.location, offer.note].filter(Boolean).join(" · ")}</p>
          {offer.myClaim ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm font-medium text-emerald-800">Zgłoszono. Czekasz na decyzję trenera.</p>
              <form action={withdrawClaimAction.bind(null, offer.myClaim.id)}>
                <SubmitButton variant="secondary" pendingLabel="Wycofywanie...">
                  Wycofaj zgłoszenie
                </SubmitButton>
              </form>
            </div>
          ) : (
            <ClaimSlotForm action={claimSlotAction} offerId={offer.id} dogs={dogs} />
          )}
        </div>
      ))}

      {onWaitlist ? (
        <div className="rounded-2xl border border-zinc-200 p-4 text-sm">
          <p className="font-medium">Jesteś na liście chętnych</p>
          <p className="mt-1 text-zinc-600">
            Gdy zwolni się termin, dostaniesz powiadomienie. Kto pierwszy zgłosi „Biorę”, ten ma pierwszeństwo, ale wybiera trener.
          </p>
          {!compact ? (
            <form action={leaveWaitlistAction} className="mt-3">
              <SubmitButton variant="secondary" pendingLabel="Zapisywanie...">
                Wypisz mnie z listy chętnych
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 p-4 text-sm">
          <p className="font-medium">Chcesz wcześniejszy termin?</p>
          <p className="mt-1 text-zinc-600">
            Zapisz się na listę chętnych: gdy ktoś odwoła zajęcia, dostaniesz powiadomienie i możesz zająć wolny termin.
          </p>
          <form action={joinWaitlistAction} className="mt-3">
            <SubmitButton pendingLabel="Zapisywanie...">Zapisz mnie na listę chętnych</SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}
