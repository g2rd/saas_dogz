"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/shared/ui/form-fields";
import type { InviteState } from "../actions";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";

type SignupAction = (prev: InviteState, formData: FormData) => Promise<InviteState>;
type AcceptAction = () => Promise<InviteState>;

export function AcceptInviteForm({ action, email }: { action: AcceptAction; email: string | null }) {
  const t = useTranslations();
  const [state, formAction] = useActionState<InviteState>(async () => action(), {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {email ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t.rich("auth.inviteInviteForms.logged_in_as", { strong: (chunks) => <strong>{chunks}</strong>, email })}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          <Msg text={state.error} />
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel={t("auth.inviteInviteForms.przyjmowanie")}>{t("auth.inviteInviteForms.przyjmij_zaproszenie")}</SubmitButton>
      </div>
    </form>
  );
}

export function InviteSignupForm({
  action,
  secret,
  emailHint,
  basePath = "/invite",
}: {
  action: SignupAction;
  secret: string;
  emailHint: string | null;
  /** Początek adresu strony zaproszenia (powrót po zalogowaniu): `/invite` albo `/join`. */
  basePath?: string;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  if (state.confirmationSent) {
    return (
      <p role="status" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {t("auth.inviteInviteForms.wyslalismy_wiadomosc_z_linkiem")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label={t("common.imie_i_nazwisko")}
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        errors={errors.fullName}
      />
      <TextField
        label={t("common.e_mail")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={errors.email}
        hint={emailHint ? t("auth.inviteInviteForms.uzyj_adresu_na_ktory_wyslano_zaproszenie", { emailHint }) : undefined}
        required
      />
      <TextField
        label={t("common.haslo")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("common.co_najmniej_8_znakow")}
        errors={errors.password}
        required
      />
      <FormMessage state={state} />
      {state.existingAccount ? (
        <p className="text-sm">
          {t.rich("auth.inviteInviteForms.login_and_return", {
            login: (chunks) => (
              <Link href={`/login?next=${encodeURIComponent(`${basePath}/${secret}`)}`} className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel={t("auth.inviteInviteForms.zakladanie_konta")}>{t("auth.inviteInviteForms.zaloz_konto_i_dolacz")}</SubmitButton>
      </div>
    </form>
  );
}
