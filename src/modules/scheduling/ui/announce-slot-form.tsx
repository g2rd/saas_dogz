"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import { TextField } from "@/shared/ui/form-fields";

export type AnnounceSlotState = { message?: string; error?: string };
type Action = (prev: AnnounceSlotState, formData: FormData) => Promise<AnnounceSlotState>;

/** „Ogłoś wolny termin” na karcie odwołanych zajęć: opcjonalna notatka i wysłanie powiadomień do listy chętnych. */
export function AnnounceSlotForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex h-11 cursor-pointer items-center rounded-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-hover">
        Ogłoś wolny termin
      </summary>
      <form action={formAction} className="mt-2 flex max-w-sm flex-col gap-3 rounded-lg border border-zinc-200 p-3">
        <p className="text-zinc-600">
          Klienci zapisani na listę chętnych dostaną powiadomienie. Zgłoszą się przyciskiem „Biorę”, a Ty wybierzesz osobę.
        </p>
        <TextField label="Notatka (opcjonalnie)" name="note" defaultValue={null} hint="Np. „Trening w parku, godzina 17:00”." />
        <div>
          <ConfirmSubmit
            tone="primary"
            title="Ogłosić wolny termin?"
            description="Klienci zapisani na listę chętnych dostaną powiadomienie. Do 30 sekund możesz jeszcze zamknąć ogłoszenie bez wysyłania."
            confirmLabel="Wyślij ogłoszenie"
            pendingLabel="Ogłaszanie..."
          >
            Wyślij ogłoszenie
          </ConfirmSubmit>
        </div>
      </form>
      {state.message ? (
        <p role="status" className="mt-2 text-emerald-700">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-red-600">
          {state.error}
        </p>
      ) : null}
    </details>
  );
}
