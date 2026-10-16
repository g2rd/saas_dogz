"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export function LoginForm({
  action,
  next,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  next: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={errors.email}
        required
      />
      <TextField
        label="Hasło"
        name="password"
        type="password"
        autoComplete="current-password"
        errors={errors.password}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Logowanie...">Zaloguj się</SubmitButton>
      </div>
    </form>
  );
}
