"use client";

import { useActionState } from "react";
import { SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { CodeState, EnrollState } from "./actions";

type CodeAction = (prev: CodeState, formData: FormData) => Promise<CodeState>;

export function CodeForm({ action, label = "Kod z aplikacji (6 cyfr)", submitLabel }: { action: CodeAction; label?: string; submitLabel: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-xs flex-col gap-3">
      <TextField label={label} name="code" inputMode="numeric" autoComplete="one-time-code" required />
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Sprawdzanie...">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** Dwa kroki: wygenerowanie kodu QR, potem potwierdzenie pierwszym kodem z aplikacji. */
export function EnrollFlow({
  start,
  confirm,
}: {
  start: () => Promise<EnrollState>;
  confirm: (factorId: string, prev: CodeState, formData: FormData) => Promise<CodeState>;
}) {
  const [state, startAction] = useActionState(async () => start(), {} as EnrollState);

  if (!state.factorId) {
    return (
      <form action={startAction} className="flex flex-col gap-3">
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <div>
          <SubmitButton pendingLabel="Przygotowywanie...">Włącz weryfikację dwuetapową</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-zinc-700">
        <li>Zainstaluj aplikację uwierzytelniającą (np. Google Authenticator, Microsoft Authenticator, 2FAS, Aegis).</li>
        <li>Zeskanuj kod QR poniżej albo wpisz klucz ręcznie.</li>
        <li>Wpisz 6-cyfrowy kod, który pokaże aplikacja.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- kod QR jako data URI z Supabase */}
      <img src={state.qrCode} alt="Kod QR do aplikacji uwierzytelniającej" width={192} height={192} className="rounded-lg border border-zinc-200 bg-white p-2" />
      <p className="text-sm text-zinc-600">
        Klucz do ręcznego wpisania: <span className="select-all font-mono">{state.secret}</span>
      </p>
      <CodeForm action={confirm.bind(null, state.factorId)} submitLabel="Potwierdź i zapisz" />
    </div>
  );
}
