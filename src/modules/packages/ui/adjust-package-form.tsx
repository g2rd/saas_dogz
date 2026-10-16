"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, TextField } from "@/shared/ui/form-fields";

export function AdjustPackageForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label="Zmiana liczby zajęć"
        name="delta"
        type="number"
        inputMode="numeric"
        defaultValue={state.values?.delta}
        errors={errors.delta}
        hint="Np. -1 (odjęcie zajęć) lub 1 (dodanie). Saldo nie może być ujemne."
        required
      />
      <TextField label="Powód (opcjonalnie)" name="note" defaultValue={state.values?.note} errors={errors.note} />
      <FormMessage state={state} />
      <div>
        <ConfirmSubmit
          tone="primary"
          title="Zapisać korektę salda?"
          description="Saldo pakietu zmieni się od razu, a wpis zostanie w historii (korekty nie da się usunąć, można ją tylko skorygować kolejnym wpisem)."
          confirmLabel="Zapisz korektę"
          pendingLabel="Zapisywanie..."
        >
          Zapisz korektę
        </ConfirmSubmit>
      </div>
    </form>
  );
}
