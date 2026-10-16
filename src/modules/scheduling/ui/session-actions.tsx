"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/shared/ui/form-fields";

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
  singlePriceLabel,
  canCharge,
  cancelConsumesByPolicy,
  lateCancelHours,
}: {
  status: "scheduled" | "completed" | "canceled";
  completeAction: Action;
  cancelAction: Action;
  /** Cena pojedynczych zajęć do pokazania na przycisku, np. "100,00 zł". */
  singlePriceLabel: string;
  /** Czy zalogowana osoba może rozliczyć zajęcia bez pakietu (naliczyć należność). */
  canCharge: boolean;
  /** Czy odwołanie teraz zabrałoby zajęcie z pakietu wg polityki organizacji. */
  cancelConsumesByPolicy: boolean;
  lateCancelHours: number;
}) {
  const [completeState, completeForm] = useActionState(completeAction, {});
  const [cancelState, cancelForm] = useActionState(cancelAction, {});

  const feedback = completeState.message ?? cancelState.message;
  const error = completeState.error ?? cancelState.error;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {status === "scheduled" ? (
        <div className="flex flex-wrap items-start gap-2">
          <form action={completeForm}>
            <SubmitButton pendingLabel="Rozliczanie...">Zakończ zajęcia</SubmitButton>
          </form>
          <details className="text-sm">
            <summary className="inline-flex h-11 cursor-pointer items-center rounded-full border border-red-300 bg-red-50 px-5 font-medium text-red-700 hover:bg-red-100">
              Odwołaj zajęcia
            </summary>
            <form action={cancelForm} className="mt-2 flex max-w-xs flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-zinc-600 dark:text-zinc-400">
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
              <SubmitButton variant="danger" pendingLabel="Odwoływanie...">
                Odwołaj zajęcia
              </SubmitButton>
            </form>
          </details>
        </div>
      ) : null}

      {completeState.noPackage ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p>Klient nie ma pakietu z wolnymi zajęciami.</p>
          {canCharge ? (
            <form action={completeForm} className="mt-2">
              <input type="hidden" name="withoutPackage" value="1" />
              <SubmitButton variant="secondary" pendingLabel="Rozliczanie...">
                Zakończ bez pakietu (nalicz {singlePriceLabel})
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">Poproś trenera o rozliczenie bez pakietu.</p>
          )}
        </div>
      ) : null}

      {feedback ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {feedback}
        </p>
      ) : null}
      {error && !completeState.noPackage ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
