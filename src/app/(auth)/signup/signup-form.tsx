"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { SignupState } from "./actions";

export function SignupForm({
  action,
  next,
}: {
  action: (prev: SignupState, formData: FormData) => Promise<SignupState>;
  next: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.confirmationSent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        Wysłaliśmy wiadomość z linkiem potwierdzającym. Kliknij go, aby aktywować konto.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Imię i nazwisko"
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        errors={errors.fullName}
      />
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
        autoComplete="new-password"
        hint="Co najmniej 8 znaków"
        errors={errors.password}
        required
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Tworzenie konta...">Załóż konto</SubmitButton>
      </div>
    </form>
  );
}
