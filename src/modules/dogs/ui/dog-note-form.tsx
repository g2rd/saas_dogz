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

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <SelectField
        label="Rodzaj"
        name="kind"
        defaultValue="other"
        options={NOTE_KINDS.map((k) => ({ value: k, label: NOTE_KIND_LABELS[k] }))}
      />
      <TextAreaField label="Treść" name="content" errors={errors.content} required />
      <TextField label="Ważne do" name="validUntil" type="date" errors={errors.validUntil} />
      <CheckboxField
        label="Widoczna dla klienta"
        name="visibleToClient"
        hint="Domyślnie notatka jest prywatna i widzi ją tylko personel"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>Dodaj notatkę</SubmitButton>
      </div>
    </form>
  );
}
