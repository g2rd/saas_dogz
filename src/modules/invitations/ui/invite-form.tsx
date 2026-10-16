"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";

/** Wynik utworzenia zaproszenia: sekrety są widoczne tylko w tej odpowiedzi. */
export type InviteActionState = FormState & {
  created?: { link: string; code: string; qrSvg: string; expiresAt: string };
};

/** Wynik wysyłki zaproszenia klientowi. */
export type DeliverActionState = { message?: string; error?: string };

function DeliverButtons({
  action,
  link,
  code,
  canEmail,
}: {
  action: (prev: DeliverActionState, formData: FormData) => Promise<DeliverActionState>;
  link: string;
  code: string;
  canEmail: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Wyślij klientowi link i kod</p>
      <form action={formAction} className="self-start">
        <input type="hidden" name="link" value={link} />
        <input type="hidden" name="code" value={code} />
        <SubmitButton variant="secondary" pendingLabel="Wysyłanie...">
          Wyślij e-mailem
        </SubmitButton>
      </form>
      {!canEmail ? <p className="text-sm text-zinc-500">Brak e-maila klienta w kartotece.</p> : null}
      {state.message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Brak dostępu do schowka: użytkownik może zaznaczyć tekst ręcznie.
        }
      }}
      className="inline-flex h-9 items-center rounded-full border border-zinc-300 px-4 text-sm dark:border-zinc-700"
    >
      {copied ? "Skopiowano" : label}
    </button>
  );
}

export function InviteForm({
  action,
  deliverAction,
  packages,
  defaultEmail,
}: {
  action: (prev: InviteActionState, formData: FormData) => Promise<InviteActionState>;
  deliverAction: (prev: DeliverActionState, formData: FormData) => Promise<DeliverActionState>;
  packages: { id: string; label: string }[];
  defaultEmail: string | null;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex max-w-md flex-col gap-4">
        <SelectField
          label="Pakiet do potwierdzenia przez klienta"
          name="packageId"
          defaultValue={v("packageId", packages[0]?.id ?? "")}
          errors={errors.packageId}
          options={[{ value: "", label: "Bez pakietu" }, ...packages.map((p) => ({ value: p.id, label: p.label }))]}
        />
        <TextField
          label="E-mail klienta (opcjonalnie)"
          name="email"
          type="email"
          defaultValue={v("email", defaultEmail ?? "")}
          errors={errors.email}
          hint="Gdy podasz e-mail, tylko konto z tym adresem przyjmie zaproszenie. Puste: zaproszenie dla każdego, kto ma kod."
          autoComplete="off"
        />
        <FormMessage state={state} />
        <div>
          <SubmitButton pendingLabel="Tworzenie...">Utwórz zaproszenie</SubmitButton>
        </div>
      </form>

      {state.created ? (
        <div className="flex max-w-md flex-col gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium">
            Zaproszenie gotowe. Pokaż klientowi kod QR lub wyślij link. Po odświeżeniu strony nie będzie już widoczne.
          </p>

          <div
            className="mx-auto w-52 rounded bg-white p-2"
            role="img"
            aria-label="Kod QR zaproszenia"
            dangerouslySetInnerHTML={{ __html: state.created.qrSvg }}
          />

          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Kod do wpisania na stronie /invite</p>
            <p className="font-mono text-3xl font-semibold tracking-widest" aria-label="Kod zaproszenia">
              {state.created.code}
            </p>
            <div className="mt-2">
              <CopyButton text={state.created.code} label="Kopiuj kod" />
            </div>
          </div>

          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Link</p>
            <input
              readOnly
              value={state.created.link}
              aria-label="Link zaproszenia"
              onFocus={(event) => event.currentTarget.select()}
              className="h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700"
            />
            <div className="mt-2">
              <CopyButton text={state.created.link} label="Kopiuj link" />
            </div>
          </div>

          <DeliverButtons
            action={deliverAction}
            link={state.created.link}
            code={state.created.code}
            canEmail={Boolean(v("email", defaultEmail ?? ""))}
          />

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ważne do{new Date(state.created.expiresAt).toLocaleDateString("pl-PL")}. Nowe zaproszenie unieważnia to.
          </p>
        </div>
      ) : null}
    </div>
  );
}
