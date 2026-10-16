"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import {
  CheckboxField,
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/shared/ui/form-fields";
import { NOTE_KINDS, NOTE_KIND_LABELS } from "../domain/dog";

export function DogNoteForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  // React 19 czyści formularz po akcji; po błędzie wracamy do tego, co wpisał użytkownik.
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <SelectField
        label="Rodzaj"
        name="kind"
        defaultValue={v("kind", "other")}
        options={NOTE_KINDS.map((k) => ({ value: k, label: NOTE_KIND_LABELS[k] }))}
      />
      <TextAreaField label="Treść" name="content" defaultValue={v("content")} errors={errors.content} required />
      <TextField label="Ważne do" name="validUntil" type="date" defaultValue={v("validUntil")} errors={errors.validUntil} />
      <CheckboxField
        label="Widoczna dla klienta"
        name="visibleToClient"
        defaultChecked={state.values ? "visibleToClient" in state.values : false}
        hint="Domyślnie notatka jest prywatna i widzi ją tylko personel"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>Dodaj notatkę</SubmitButton>
      </div>
    </form>
  );
}
