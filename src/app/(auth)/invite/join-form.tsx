"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export function JoinForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Kod zaproszenia"
        name="code"
        defaultValue={state.values?.code}
        errors={state.fieldErrors?.code}
        hint="Kod dostałeś od trenera, np. ABCDE-FGHJK"
        autoComplete="off"
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Sprawdzanie...">Dalej</SubmitButton>
      </div>
    </form>
  );
}
