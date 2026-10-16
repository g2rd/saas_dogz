"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { InviteState } from "../actions";

type SignupAction = (prev: InviteState, formData: FormData) => Promise<InviteState>;
type AcceptAction = () => Promise<InviteState>;

export function AcceptInviteForm({ action, email }: { action: AcceptAction; email: string | null }) {
  const [state, formAction] = useActionState<InviteState>(async () => action(), {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {email ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Jesteś zalogowany jako <strong>{email}</strong>. Dostęp do panelu zostanie dodany do tego konta.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Przyjmowanie...">Przyjmij zaproszenie</SubmitButton>
      </div>
    </form>
  );
}

export function InviteSignupForm({
  action,
  secret,
  emailHint,
}: {
  action: SignupAction;
  secret: string;
  emailHint: string | null;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.confirmationSent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        Wysłaliśmy wiadomość z linkiem potwierdzającym. Kliknij go, a wrócisz tu i dokończysz przyjęcie zaproszenia.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
        hint={emailHint ? `Użyj adresu, na który wysłano zaproszenie (${emailHint})` : undefined}
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
      {state.existingAccount ? (
        <p className="text-sm">
          <Link href={`/login?next=${encodeURIComponent(`/invite/${secret}`)}`} className="underline">
            Zaloguj się na istniejące konto
          </Link>{" "}
          i wróć do zaproszenia.
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Zakładanie konta...">Załóż konto i dołącz</SubmitButton>
      </div>
    </form>
  );
}
