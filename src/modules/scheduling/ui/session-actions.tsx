"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";

/** Wynik akcji na zajęciach: komunikat o skutku albo błąd (z podpowiedzią, gdy brakuje pakietu). */
export type SessionActionState = {
  message?: string;
  error?: string;
  /** Klient nie ma pakietu z wolnymi zajęciami: można rozliczyć pojedynczo. */
  noPackage?: boolean;
};

type Action = (prev: SessionActionState, formData: FormData) => Promise<SessionActionState>;

export function SessionActions({
  status,
  completeAction,
  cancelAction,
  undoCompleteAction,
  restoreAction,
  singlePriceLabel,
  canCharge,
  cancelConsumesByPolicy,
  lateCancelHours,
  canUndoComplete,
  canRestore,
}: {
  status: "scheduled" | "completed" | "canceled";
  completeAction: Action;
  cancelAction: Action;
  /** Cofnięcie zakończenia (tylko tego samego dnia). */
  undoCompleteAction: Action;
  /** Przywrócenie odwołanych zajęć (przed ich rozpoczęciem). */
  restoreAction: Action;
  /** Cena pojedynczych zajęć do pokazania na przycisku, np. "100,00 zł". */
  singlePriceLabel: string;
  /** Czy zalogowana osoba może rozliczyć zajęcia bez pakietu (naliczyć należność). */
  canCharge: boolean;
  /** Czy odwołanie teraz zabrałoby zajęcie z pakietu wg polityki organizacji. */
  cancelConsumesByPolicy: boolean;
  lateCancelHours: number;
  /** Zajęcia zakończone dzisiaj: można cofnąć. */
  canUndoComplete: boolean;
  /** Odwołane zajęcia, które jeszcze się nie zaczęły: można przywrócić. */
  canRestore: boolean;
}) {
  const t = useTranslations();
  const [completeState, completeForm] = useActionState(completeAction, {});
  const [cancelState, cancelForm] = useActionState(cancelAction, {});
  const [undoState, undoForm] = useActionState(undoCompleteAction, {});
  const [restoreState, restoreForm] = useActionState(restoreAction, {});

  const feedback = completeState.message ?? cancelState.message ?? undoState.message ?? restoreState.message;
  const error = completeState.error ?? cancelState.error ?? undoState.error ?? restoreState.error;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {status === "scheduled" ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <form action={completeForm}>
            <ConfirmSubmit
              title={t("scheduling.sessionActions.zakonczyc_zajecia")}
              description={
                <>
                  <p>{t("scheduling.sessionActions.zajecia_zostana_rozliczone_zuzyjemy_jedno")}</p>
                  <p className="mt-2">{t("scheduling.sessionActions.pomylke_mozesz_cofnac_do_konca_dnia")}</p>
                </>
              }
              confirmLabel={t("scheduling.sessionActions.zakoncz_zajecia")}
              pendingLabel={t("scheduling.sessionActions.rozliczanie")}
              tone="primary"
            >
              {t("scheduling.sessionActions.zakoncz_zajecia")}
            </ConfirmSubmit>
          </form>
          <details className="text-sm">
            <summary className="inline-flex h-11 cursor-pointer items-center rounded-full border border-red-300 bg-red-50 px-5 font-medium text-red-700 hover:bg-red-100">
              {t("scheduling.sessionActions.odwolaj_zajecia")}
            </summary>
            <form action={cancelForm} className="mt-2 flex max-w-xs flex-col gap-2 rounded-lg border border-zinc-200 p-3">
              <p className="text-zinc-600">
                {cancelConsumesByPolicy
                  ? t("scheduling.sessionActions.do_zajec_zostalo_mniej_niz", { lateCancelHours })
                  : t("scheduling.sessionActions.odwolanie_bez_konsekwencji_dla_pakietu")}
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="consume"
                  value={cancelConsumesByPolicy ? "1" : "0"}
                  defaultChecked
                  className="mt-1"
                />
                <span>{t("scheduling.sessionActions.zgodnie_z_polityka")}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="consume" value={cancelConsumesByPolicy ? "0" : "1"} className="mt-1" />
                <span>{cancelConsumesByPolicy ? t("scheduling.sessionActions.nie_nalicz_zajecia_wyjatek") : t("scheduling.sessionActions.nalicz_zajecie_z_pakietu")}</span>
              </label>
              <ConfirmSubmit
                variant="danger"
                title={t("scheduling.sessionActions.odwolac_zajecia")}
                description={
                  <>
                    <p>
                      {t("scheduling.sessionActions.klient_dostanie_powiadomienie_o_odwolaniu")}
                    </p>
                    <p className="mt-2">{t("scheduling.sessionActions.termin_zwolni_sie_i_bedziesz_mogl_oglosic")}</p>
                  </>
                }
                confirmLabel={t("scheduling.sessionActions.odwolaj_zajecia")}
                pendingLabel={t("common.odwolywanie")}
              >
                {t("scheduling.sessionActions.odwolaj_zajecia")}
              </ConfirmSubmit>
            </form>
          </details>
        </div>
      ) : null}

      {status === "completed" && canUndoComplete ? (
        <form action={undoForm} className="flex flex-col gap-1">
          <div>
            <ConfirmSubmit
              variant="secondary"
              title={t("scheduling.sessionActions.cofnac_zakonczenie_zajec")}
              description={t("scheduling.sessionActions.zajecie_wroci_do_pakietu_klienta_a")}
              confirmLabel={t("scheduling.sessionActions.cofnij_zakonczenie")}
              pendingLabel={t("scheduling.sessionActions.cofanie")}
              tone="primary"
            >
              {t("scheduling.sessionActions.cofnij_zakonczenie")}
            </ConfirmSubmit>
          </div>
          <p className="text-sm text-zinc-500">{t("scheduling.sessionActions.mozliwe_do_konca_dnia")}</p>
        </form>
      ) : null}

      {status === "canceled" && canRestore ? (
        <form action={restoreForm} className="flex flex-col gap-1">
          <div>
            <ConfirmSubmit
              variant="secondary"
              title={t("scheduling.sessionActions.przywrocic_zajecia")}
              description={t("scheduling.sessionActions.zajecia_wroca_do_kalendarza_zajecie")}
              confirmLabel={t("scheduling.sessionActions.przywroc_zajecia")}
              pendingLabel={t("scheduling.sessionActions.przywracanie")}
              tone="primary"
            >
              {t("scheduling.sessionActions.przywroc_zajecia")}
            </ConfirmSubmit>
          </div>
        </form>
      ) : null}

      {completeState.noPackage ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>{t("scheduling.sessionActions.klient_nie_ma_pakietu_z_wolnymi_zajeciami")}</p>
          {canCharge ? (
            <form action={completeForm} className="mt-2">
              <input type="hidden" name="withoutPackage" value="1" />
              <ConfirmSubmit
                variant="secondary"
                title={t("scheduling.sessionActions.zakonczyc_bez_pakietu")}
                description={t("scheduling.sessionActions.zajecia_zostana_rozliczone_jako", { singlePriceLabel })}
                confirmLabel={t("scheduling.sessionActions.zakoncz_i_nalicz")}
                pendingLabel={t("scheduling.sessionActions.rozliczanie")}
                tone="primary"
              >
                {t("scheduling.sessionActions.zakoncz_bez_pakietu_nalicz", { singlePriceLabel })}
              </ConfirmSubmit>
            </form>
          ) : (
            <p className="mt-1 text-zinc-600">{t("scheduling.sessionActions.popros_trenera_o_rozliczenie_bez_pakietu")}</p>
          )}
        </div>
      ) : null}

      {feedback ? (
        <p role="status" className="text-sm text-emerald-700">
          <Msg text={feedback} />
        </p>
      ) : null}
      {error && !completeState.noPackage ? (
        <p role="alert" className="text-sm text-red-600">
          <Msg text={error} />
        </p>
      ) : null}
    </div>
  );
}
