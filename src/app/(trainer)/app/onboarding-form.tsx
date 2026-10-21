"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export function OnboardingForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const timezoneRef = useRef<HTMLInputElement>(null);
  // Strefa czasowa urządzenia jako domyślna strefa szkoły (zapisana w ustawieniach, można ją później zmienić)
  useEffect(() => {
    if (timezoneRef.current) timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input ref={timezoneRef} type="hidden" name="timezone" />
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
