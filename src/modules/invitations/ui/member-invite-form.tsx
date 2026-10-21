"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { type MemberRole } from "../domain/invitation";
import { useFormats } from "@/shared/i18n/client";
import { useTranslations } from "next-intl";

export type MemberInviteState = FormState & {
  created?: { link: string; email: string; emailSent: boolean; expiresAt: string };
};

/** Zaproszenie osoby do zespołu: adres e-mail i rola. Link jest widoczny tylko tuż po utworzeniu. */
export function MemberInviteForm({
  action,
  roles,
}: {
  action: (prev: MemberInviteState, formData: FormData) => Promise<MemberInviteState>;
  roles: readonly MemberRole[];
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const formats = useFormats();
  const errors = state.fieldErrors ?? {};

  return (
    <div className="flex max-w-md flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <TextField
          label={t("invitations.memberInviteForm.e_mail_zapraszanej_osoby")}
          name="email"
          type="email"
          defaultValue={state.values?.email}
          errors={errors.email}
          hint={t("invitations.memberInviteForm.zaproszenie_przyjmie_tylko_konto_z_tym")}
          autoComplete="off"
          required
        />
        <SelectField
          label={t("invitations.memberInviteForm.rola")}
          name="role"
          defaultValue={state.values?.role ?? "trainer"}
          errors={errors.role}
          options={roles.map((role) => ({ value: role, label: t(`labels.memberRole.${role}`) }))}
        />
        <FormMessage state={state} />
        <div>
          <SubmitButton pendingLabel={t("common.tworzenie")}>{t("common.zapros_do_zespolu")}</SubmitButton>
        </div>
      </form>

      {state.created ? (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="font-medium">
            {state.created.emailSent
              ? t("invitations.memberInviteForm.wyslano_zaproszenie_na_adres_email", { email: state.created.email })
              : t("invitations.memberInviteForm.zaproszenie_gotowe_ale_e_mail_nie_zostal")}
          </p>
          <input
            readOnly
            value={state.created.link}
            aria-label={t("common.link_zaproszenia")}
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
          />
          <p className="text-zinc-600 dark:text-zinc-400">
            {t("invitations.memberInviteForm.link_jest_widoczny_tylko_teraz_wazny_do", { date: formats.date(new Date(state.created.expiresAt)) })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
