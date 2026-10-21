"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { FormMessage, SelectField, SubmitButton, TextAreaField, TextField } from "@/shared/ui/form-fields";
import type { AdminFormState } from "../../actions";

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;

const STATUS_OPTIONS = [
  { value: "trial", label: "Okres próbny" },
  { value: "active", label: "Aktywna" },
  { value: "read_only", label: "Tylko do odczytu" },
  { value: "suspended", label: "Zawieszona" },
];

function Feedback({ state }: { state: AdminFormState }) {
  return (
    <>
      <FormMessage state={state} />
      {state.message && !state.error ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

export function StatusForm({
  action,
  status,
  accessUntil,
  reason,
}: {
  action: Action;
  status: string;
  /** RRRR-MM-DD (czas polski) albo pusty ciąg. */
  accessUntil: string;
  reason: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <SelectField label="Status" name="status" options={STATUS_OPTIONS} defaultValue={state.values?.status ?? status} errors={errors.status} />
      <TextField
        label="Dostęp do dnia (włącznie)"
        name="accessUntil"
        type="date"
        defaultValue={state.values?.accessUntil ?? accessUntil}
        errors={errors.accessUntil}
        hint="Po tej dacie szkoła sama przejdzie w tryb „tylko do odczytu”. Puste = bez terminu."
      />
      <TextAreaField
        label="Powód (widzi go trener)"
        name="reason"
        defaultValue={state.values?.reason ?? reason}
        errors={errors.reason}
        hint="Wymagany przy trybie „tylko do odczytu” i zawieszeniu, np. „Koniec okresu testów” albo „Brak płatności za październik”."
      />
      <Feedback state={state} />
      <div>
        <ConfirmSubmit
          tone="primary"
          title="Zmienić status szkoły?"
          description="Zmiana działa od razu: zawieszenie odcina trenerów i ich klientów, tryb „tylko do odczytu” blokuje zapisy. Dane nie są usuwane, a status można w każdej chwili przywrócić."
          confirmLabel="Zapisz status"
        >
          Zapisz status
        </ConfirmSubmit>
      </div>
    </form>
  );
}

export function ExtendForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Przedłuż dostęp o"
        name="days"
        options={[
          { value: "7", label: "7 dni" },
          { value: "14", label: "14 dni" },
          { value: "30", label: "30 dni" },
          { value: "60", label: "60 dni" },
          { value: "90", label: "90 dni" },
        ]}
        defaultValue="14"
        errors={state.fieldErrors?.days}
      />
      <SubmitButton variant="secondary" pendingLabel="Zapisywanie...">
        Przedłuż
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function NotesForm({ action, notes }: { action: Action; notes: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <TextAreaField
        label="Notatki (widzisz tylko Ty)"
        name="notes"
        defaultValue={state.values?.notes ?? notes}
        errors={state.fieldErrors?.notes}
        hint="Np. telefon, ustalenia, cena założycielska, uwagi z rozmowy."
      />
      <Feedback state={state} />
      <div>
        <SubmitButton variant="secondary">Zapisz notatkę</SubmitButton>
      </div>
    </form>
  );
}
