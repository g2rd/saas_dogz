"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Msg } from "@/shared/ui/msg";

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
              title="Zakończyć zajęcia?"
              description={
                <>
                  <p>Zajęcia zostaną rozliczone: zużyjemy jedno zajęcie z pakietu klienta (a bez pakietu zapytamy o należność).</p>
                  <p className="mt-2">Pomyłkę możesz cofnąć do końca dnia.</p>
                </>
              }
              confirmLabel="Zakończ zajęcia"
              pendingLabel="Rozliczanie..."
              tone="primary"
            >
              Zakończ zajęcia
            </ConfirmSubmit>
          </form>
          <details className="text-sm">
            <summary className="inline-flex h-11 cursor-pointer items-center rounded-full border border-red-300 bg-red-50 px-5 font-medium text-red-700 hover:bg-red-100">
              Odwołaj zajęcia
            </summary>
            <form action={cancelForm} className="mt-2 flex max-w-xs flex-col gap-2 rounded-lg border border-zinc-200 p-3">
              <p className="text-zinc-600">
                {cancelConsumesByPolicy
                  ? `Do zajęć zostało mniej niż ${lateCancelHours} h, więc według polityki zajęcie z pakietu przepada.`
                  : "Odwołanie bez konsekwencji dla pakietu."}
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="consume"
                  value={cancelConsumesByPolicy ? "1" : "0"}
                  defaultChecked
                  className="mt-1"
                />
                <span>Zgodnie z polityką</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="consume" value={cancelConsumesByPolicy ? "0" : "1"} className="mt-1" />
                <span>{cancelConsumesByPolicy ? "Nie nalicz zajęcia (wyjątek)" : "Nalicz zajęcie z pakietu"}</span>
              </label>
              <ConfirmSubmit
                variant="danger"
                title="Odwołać zajęcia?"
                description={
                  <>
                    <p>
                      Klient dostanie powiadomienie o odwołaniu za 30 sekund. Jeśli w tym czasie przywrócisz zajęcia, nie dostanie
                      żadnego.
                    </p>
                    <p className="mt-2">Termin zwolni się i będziesz mógł ogłosić go klientom z listy chętnych.</p>
                  </>
                }
                confirmLabel="Odwołaj zajęcia"
                pendingLabel="Odwoływanie..."
              >
                Odwołaj zajęcia
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
              title="Cofnąć zakończenie zajęć?"
              description="Zajęcie wróci do pakietu klienta, a nieopłacona należność za te zajęcia zostanie anulowana. Zajęcia wrócą do statusu „Zaplanowane”."
              confirmLabel="Cofnij zakończenie"
              pendingLabel="Cofanie..."
              tone="primary"
            >
              Cofnij zakończenie
            </ConfirmSubmit>
          </div>
          <p className="text-sm text-zinc-500">Możliwe do końca dnia.</p>
        </form>
      ) : null}

      {status === "canceled" && canRestore ? (
        <form action={restoreForm} className="flex flex-col gap-1">
          <div>
            <ConfirmSubmit
              variant="secondary"
              title="Przywrócić zajęcia?"
              description="Zajęcia wrócą do kalendarza, zajęcie zabrane z pakietu zostanie zwrócone, a ogłoszenie wolnego terminu zamknięte. Jeśli klient już dostał powiadomienie o odwołaniu, dostanie informację o przywróceniu."
              confirmLabel="Przywróć zajęcia"
              pendingLabel="Przywracanie..."
              tone="primary"
            >
              Przywróć zajęcia
            </ConfirmSubmit>
          </div>
        </form>
      ) : null}

      {completeState.noPackage ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>Klient nie ma pakietu z wolnymi zajęciami.</p>
          {canCharge ? (
            <form action={completeForm} className="mt-2">
              <input type="hidden" name="withoutPackage" value="1" />
              <ConfirmSubmit
                variant="secondary"
                title="Zakończyć bez pakietu?"
                description={`Zajęcia zostaną rozliczone jako pojedyncze: naliczymy należność ${singlePriceLabel}. Możesz to cofnąć do końca dnia, o ile klient jeszcze nie zapłacił.`}
                confirmLabel="Zakończ i nalicz"
                pendingLabel="Rozliczanie..."
                tone="primary"
              >
                Zakończ bez pakietu (nalicz {singlePriceLabel})
              </ConfirmSubmit>
            </form>
          ) : (
            <p className="mt-1 text-zinc-600">Poproś trenera o rozliczenie bez pakietu.</p>
          )}
        </div>
      ) : null}

      {feedback ? (
        <p role="status" className="text-sm text-emerald-700">
          {feedback}
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
