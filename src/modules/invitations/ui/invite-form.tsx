"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { Msg } from "@/shared/ui/msg";
import { useFormats } from "@/shared/i18n/client";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.inviteForm.wyslij_klientowi_link_i_kod")}</p>
      <form action={formAction} className="self-start">
        <input type="hidden" name="link" value={link} />
        <input type="hidden" name="code" value={code} />
        <SubmitButton variant="secondary" pendingLabel={t("common.wysylanie")}>
          {t("invitations.inviteForm.wyslij_e_mailem")}
        </SubmitButton>
      </form>
      {!canEmail ? <p className="text-sm text-zinc-500">{t("invitations.inviteForm.brak_e_maila_klienta_w_kartotece")}</p> : null}
      {state.message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          <Msg text={state.message} />
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          <Msg text={state.error} />
        </p>
      ) : null}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations();
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
      {copied ? t("invitations.inviteForm.skopiowano") : label}
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
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const formats = useFormats();
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex max-w-md flex-col gap-4">
        <SelectField
          label={t("invitations.inviteForm.pakiet_do_potwierdzenia_przez_klienta")}
          name="packageId"
          defaultValue={v("packageId", packages[0]?.id ?? "")}
          errors={errors.packageId}
          options={[{ value: "", label: "Bez pakietu" }, ...packages.map((p) => ({ value: p.id, label: p.label }))]}
        />
        <TextField
          label={t("invitations.inviteForm.e_mail_klienta_opcjonalnie")}
          name="email"
          type="email"
          defaultValue={v("email", defaultEmail ?? "")}
          errors={errors.email}
          hint={t("invitations.inviteForm.gdy_podasz_e_mail_tylko_konto_z_tym")}
          autoComplete="off"
        />
        <FormMessage state={state} />
        <div>
          <SubmitButton pendingLabel={t("common.tworzenie")}>{t("invitations.inviteForm.utworz_zaproszenie")}</SubmitButton>
        </div>
      </form>

      {state.created ? (
        <div className="flex max-w-md flex-col gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium">
            {t("invitations.inviteForm.zaproszenie_gotowe_pokaz_klientowi_kod_qr")}
          </p>

          <div
            className="mx-auto w-52 rounded bg-white p-2"
            role="img"
            aria-label={t("invitations.inviteForm.kod_qr_zaproszenia")}
            dangerouslySetInnerHTML={{ __html: state.created.qrSvg }}
          />

          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.inviteForm.kod_do_wpisania_na_stronie_invite")}</p>
            <p className="font-mono text-3xl font-semibold tracking-widest" aria-label={t("common.kod_zaproszenia")}>
              {state.created.code}
            </p>
            <div className="mt-2">
              <CopyButton text={state.created.code} label={t("invitations.inviteForm.kopiuj_kod")} />
            </div>
          </div>

          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.inviteForm.link")}</p>
            <input
              readOnly
              value={state.created.link}
              aria-label={t("common.link_zaproszenia")}
              onFocus={(event) => event.currentTarget.select()}
              className="h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700"
            />
            <div className="mt-2">
              <CopyButton text={state.created.link} label={t("invitations.inviteForm.kopiuj_link")} />
            </div>
          </div>

          <DeliverButtons
            action={deliverAction}
            link={state.created.link}
            code={state.created.code}
            canEmail={Boolean(v("email", defaultEmail ?? ""))}
          />

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("invitations.inviteForm.wazne_do_date_nowe_zaproszenie_uniewaznia", { date: formats.date(new Date(state.created.expiresAt)) })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
