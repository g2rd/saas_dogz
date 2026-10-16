"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export function OnboardingForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label="Nazwa Twojej szkoły lub działalności"
        name="name"
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Tworzenie...">Utwórz organizację</SubmitButton>
      </div>
    </form>
  );
}
