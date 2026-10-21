"use client";

import { ConfirmSubmit } from "@/shared/ui/confirm";

import { useActionState } from "react";
import { TextField } from "@/shared/ui/form-fields";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";

export type AnnounceSlotState = { message?: string; error?: string };
type Action = (prev: AnnounceSlotState, formData: FormData) => Promise<AnnounceSlotState>;

/** „Ogłoś wolny termin” na karcie odwołanych zajęć: opcjonalna notatka i wysłanie powiadomień do listy chętnych. */
export function AnnounceSlotForm({ action }: { action: Action }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex h-11 cursor-pointer items-center rounded-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-hover">
        {t("scheduling.announceSlotForm.oglos_wolny_termin")}
      </summary>
      <form action={formAction} className="mt-2 flex max-w-sm flex-col gap-3 rounded-lg border border-zinc-200 p-3">
        <p className="text-zinc-600">
          {t("scheduling.announceSlotForm.klienci_zapisani_na_liste_chetnych")}
        </p>
        <TextField label={t("scheduling.announceSlotForm.notatka_opcjonalnie")} name="note" defaultValue={null} hint={t("scheduling.announceSlotForm.np_trening_w_parku_godzina_17_00")} />
        <div>
          <ConfirmSubmit
            tone="primary"
            title={t("scheduling.announceSlotForm.oglosic_wolny_termin")}
            description={t("scheduling.announceSlotForm.klienci_zapisani_na_liste_chetnych_2")}
            confirmLabel={t("scheduling.announceSlotForm.wyslij_ogloszenie")}
            pendingLabel={t("scheduling.announceSlotForm.oglaszanie")}
          >
            {t("scheduling.announceSlotForm.wyslij_ogloszenie")}
          </ConfirmSubmit>
        </div>
      </form>
      {state.message ? (
        <p role="status" className="mt-2 text-emerald-700">
          <Msg text={state.message} />
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-red-600">
          <Msg text={state.error} />
        </p>
      ) : null}
    </details>
  );
}
