"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { MEMBER_ROLE_LABELS, type MemberRole } from "../domain/invitation";
import { useFormats } from "@/shared/i18n/client";

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
  const [state, formAction] = useActionState(action, {});
  const formats = useFormats();
  const errors = state.fieldErrors ?? {};

  return (
    <div className="flex max-w-md flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <TextField
          label="E-mail zapraszanej osoby"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          errors={errors.email}
          hint="Zaproszenie przyjmie tylko konto z tym adresem."
          autoComplete="off"
          required
        />
        <SelectField
          label="Rola"
          name="role"
          defaultValue={state.values?.role ?? "trainer"}
          errors={errors.role}
          options={roles.map((role) => ({ value: role, label: MEMBER_ROLE_LABELS[role] }))}
        />
        <FormMessage state={state} />
        <div>
          <SubmitButton pendingLabel="Tworzenie...">Zaproś do zespołu</SubmitButton>
        </div>
      </form>

      {state.created ? (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="font-medium">
            {state.created.emailSent
              ? `Wysłano zaproszenie na adres ${state.created.email}.`
              : `Zaproszenie gotowe, ale e-mail nie został wysłany. Przekaż link osobiście.`}
          </p>
          <input
            readOnly
            value={state.created.link}
            aria-label="Link zaproszenia"
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
          />
          <p className="text-zinc-600 dark:text-zinc-400">
            Link jest widoczny tylko teraz. Ważny do {formats.date(new Date(state.created.expiresAt))}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
