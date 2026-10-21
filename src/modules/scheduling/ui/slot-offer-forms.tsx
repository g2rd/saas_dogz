"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Msg } from "@/shared/ui/msg";

/** Wynik operacji na ogłoszeniu: błąd (np. termin już minął) pokazujemy przy przycisku zamiast zrywać stronę. */
export type SlotActionState = { error?: string; message?: string };

type Action = (prev: SlotActionState) => Promise<SlotActionState>;

function Feedback({ state }: { state: SlotActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-1 w-full text-sm text-red-600">
        <Msg text={state.error} />
      </p>
    );
  }
  return null;
}

export function AcceptClaimForm({ action, clientName, when }: { action: Action; clientName: string; when: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end">
      <ConfirmSubmit
        tone="primary"
        title={`Wybrać: ${clientName}?`}
        description={
          <>
            <p>
              Zajęcia {when} zostaną zarezerwowane dla {clientName}, a ta osoba dostanie komunikat „Miejsce jest dla Ciebie!”.
            </p>
            <p className="mt-2">Pozostałe osoby dostaną informację, że termin jest zajęty.</p>
          </>
        }
        confirmLabel="Wybierz i zarezerwuj"
        pendingLabel="Zapisywanie..."
      >
        Wybierz
      </ConfirmSubmit>
      <Feedback state={state} />
    </form>
  );
}

export function CloseOfferForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3">
      <ConfirmSubmit
        variant="secondary"
        title="Zamknąć ogłoszenie?"
        description="Ogłoszenie zniknie, a osoby, które zgłosiły „Biorę”, dostaną informację, że termin jest zajęty. Jeśli zamkniesz je w ciągu 30 sekund od ogłoszenia, nikt nie dostanie żadnego powiadomienia."
        confirmLabel="Zamknij ogłoszenie"
        pendingLabel="Zamykanie..."
      >
        Zamknij ogłoszenie
      </ConfirmSubmit>
      <Feedback state={state} />
    </form>
  );
}
