"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";

export function ResetPasswordForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Nowe hasło"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Co najmniej 8 znaków"
        errors={errors.password}
        required
      />
      <TextField
        label="Powtórz hasło"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={errors.confirmPassword}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>Ustaw hasło</SubmitButton>
      </div>
    </form>
  );
}
