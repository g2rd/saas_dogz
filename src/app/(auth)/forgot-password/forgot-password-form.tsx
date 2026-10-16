"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { ForgotPasswordState } from "./actions";

export function ForgotPasswordForm({
  action,
}: {
  action: (prev: ForgotPasswordState, formData: FormData) => Promise<ForgotPasswordState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.sent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={errors.email}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Wysyłanie...">Wyślij link</SubmitButton>
      </div>
    </form>
  );
}
