"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { AdminFormState } from "../actions";

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
type SimpleAction = (prev: AdminFormState) => Promise<AdminFormState>;

export function CreateCodeForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <TextField
          label="Dla kogo jest kod"
          name="label"
          defaultValue={state.values?.label}
          errors={errors.label}
          hint="Np. „Anna K., Szkoła Łapa”. Widać to tylko tutaj."
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Liczba użyć" name="maxUses" inputMode="numeric" defaultValue={state.values?.maxUses ?? "1"} errors={errors.maxUses} />
          <TextField label="Ważny (dni)" name="validDays" inputMode="numeric" defaultValue={state.values?.validDays ?? "14"} errors={errors.validDays} />
        </div>
        <FormMessage state={state} />
        <div>
          <SubmitButton pendingLabel="Tworzenie...">Utwórz kod</SubmitButton>
        </div>
      </form>
      {state.code ? (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">{state.message}</p>
          <p className="mt-2 select-all font-mono text-2xl font-semibold tracking-wider">{state.code}</p>
        </div>
      ) : null}
    </div>
  );
}

export function SignupModeForm({ action, mode }: { action: SimpleAction; mode: "open" | "closed" }) {
  const [state, formAction] = useActionState(action, {});
  const closing = mode === "open";
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div>
        <ConfirmSubmit
          variant={closing ? "primary" : "secondary"}
          tone={closing ? "primary" : "danger"}
          title={closing ? "Zamknąć rejestrację?" : "Otworzyć rejestrację dla każdego?"}
          description={
            closing
              ? "Nowe konta będzie można założyć tylko z kodem zaproszenia od Ciebie albo z zaproszenia trenera (klienci i zespół). Istniejące konta działają bez zmian."
              : "Każdy, kto wejdzie na stronę, będzie mógł założyć konto trenera. Rób to tylko przy publicznym starcie."
          }
          confirmLabel={closing ? "Zamknij rejestrację" : "Otwórz rejestrację"}
        >
          {closing ? "Zamknij rejestrację (tylko z kodem)" : "Otwórz rejestrację dla każdego"}
        </ConfirmSubmit>
      </div>
      <FormMessage state={state} />
      {state.message && !state.error ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function RevokeCodeForm({ action, label }: { action: SimpleAction; label: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <ConfirmSubmit
        variant="danger"
        title="Unieważnić kod?"
        description={`Kod „${label}” przestanie działać. Konta już założone tym kodem zostają.`}
        confirmLabel="Unieważnij"
      >
        Unieważnij
      </ConfirmSubmit>
      <FormMessage state={state} />
    </form>
  );
}
