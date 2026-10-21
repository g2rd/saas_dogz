import { ClaimSlotForm, getPortalSlots } from "@/modules/portal";

import { SubmitButton } from "@/shared/ui/form-fields";
import { dateInZone, timeInZone } from "@/shared/time";
import { requirePortalContext } from "../_lib/context";
import { claimSlotAction, joinWaitlistAction, leaveWaitlistAction, withdrawClaimAction } from "./slots-actions";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

/**
 * Lista chętnych i wolne terminy klienta. Zapisany na listę dostaje powiadomienia o zwolnionych terminach i może zgłosić
 * „Biorę”; trener widzi kolejność zgłoszeń i wybiera osobę. `compact` pokazuje tylko ogłoszenia (strona startowa).
 */
export async function SlotsSection({ compact = false }: { compact?: boolean }) {
  const formats = await getFormats();
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const result = await getPortalSlots(ctx);
  if (!result.ok) return null;
  const { onWaitlist, offers, timezone, dogs } = result.value;
  if (compact && onWaitlist && offers.length === 0) return null;

  return (
    <section aria-labelledby="slots-heading" className="flex flex-col gap-3">
      <h2 id="slots-heading" className="text-lg font-semibold">
        {t("common.wolne_terminy")}
      </h2>

      {offers.map((offer) => (
        <div key={offer.id} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-semibold">
            {formats.calendarDate(dateInZone(offer.startsAt, timezone))}, {timeInZone(offer.startsAt, timezone)}–
            {timeInZone(offer.endsAt, timezone)}
          </p>
          <p className="text-sm text-zinc-700">{[offer.typeName, offer.location, offer.note].filter(Boolean).join(" · ")}</p>
          {offer.myClaim ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm font-medium text-emerald-800">{t("portal.slotsSection.zgloszono_czekasz_na_decyzje_trenera")}</p>
              <form action={withdrawClaimAction.bind(null, offer.myClaim.id)}>
                <SubmitButton variant="secondary" pendingLabel={t("portal.slotsSection.wycofywanie")}>
                  {t("portal.slotsSection.wycofaj_zgloszenie")}
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
          <p className="font-medium">{t("portal.slotsSection.jestes_na_liscie_chetnych")}</p>
          <p className="mt-1 text-zinc-600">
            {t("portal.slotsSection.gdy_zwolni_sie_termin_dostaniesz")}
          </p>
          {!compact ? (
            <form action={leaveWaitlistAction} className="mt-3">
              <SubmitButton variant="secondary" pendingLabel={t("common.zapisywanie")}>
                {t("portal.slotsSection.wypisz_mnie_z_listy_chetnych")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 p-4 text-sm">
          <p className="font-medium">{t("portal.slotsSection.chcesz_wczesniejszy_termin")}</p>
          <p className="mt-1 text-zinc-600">
            {t("portal.slotsSection.zapisz_sie_na_liste_chetnych_gdy_ktos")}
          </p>
          <form action={joinWaitlistAction} className="mt-3">
            <SubmitButton pendingLabel={t("common.zapisywanie")}>{t("portal.slotsSection.zapisz_mnie_na_liste_chetnych")}</SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}
