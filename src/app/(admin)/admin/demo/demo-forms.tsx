"use client";

import { useActionState } from "react";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { AdminFormState } from "../actions";

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
type SimpleAction = (prev: AdminFormState) => Promise<AdminFormState>;

function Result({ state }: { state: AdminFormState }) {
  return (
    <>
      <FormMessage state={state} />
      {state.message && !state.error ? (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

export function TestNotificationForm({ action, schools }: { action: Action; schools: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <SelectField label="Szkoła" name="organizationId" defaultValue={schools[0]?.id ?? ""} options={schools.map((school) => ({ value: school.id, label: school.name }))} />
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Wysyłanie...">Wyślij powiadomienie testowe</SubmitButton>
      </div>
    </form>
  );
}

export function ProcessNowForm({ action }: { action: SimpleAction }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Przetwarzanie...">Przetwórz powiadomienia teraz</SubmitButton>
      </div>
    </form>
  );
}

export function SimulateForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <TextField
        label="Ile dni do przodu"
        name="days"
        inputMode="numeric"
        defaultValue={state.values?.days ?? "2"}
        errors={errors.days}
        hint="Od 1 do 60. Reguły dzienne policzą przypomnienia o zajęciach, płatności i koniec dostępu tak, jakby minęły te dni."
      />
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Symulowanie...">Symuluj upływ czasu</SubmitButton>
      </div>
    </form>
  );
}
