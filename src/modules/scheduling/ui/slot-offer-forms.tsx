"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";

/** Wynik operacji na ogłoszeniu: błąd (np. termin już minął) pokazujemy przy przycisku zamiast zrywać stronę. */
export type SlotActionState = { error?: string; message?: string };

type Action = (prev: SlotActionState) => Promise<SlotActionState>;

function Feedback({ state }: { state: SlotActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-1 w-full text-sm text-red-600">
        <Msg text={state.error} />
      </p>
    );
  }
  return null;
}

export function AcceptClaimForm({ action, clientName, when }: { action: Action; clientName: string; when: string }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end">
      <ConfirmSubmit
        tone="primary"
        title={t("scheduling.slotOfferForms.wybrac_clientname", { clientName })}
        description={
          <>
            <p>
              {t("scheduling.slotOfferForms.zajecia_when_zostana_zarezerwowane_dla", { when, clientName })}
            </p>
            <p className="mt-2">{t("scheduling.slotOfferForms.pozostale_osoby_dostana_informacje_ze")}</p>
          </>
        }
        confirmLabel={t("scheduling.slotOfferForms.wybierz_i_zarezerwuj")}
        pendingLabel={t("common.zapisywanie")}
      >
        {t("scheduling.slotOfferForms.wybierz")}
      </ConfirmSubmit>
      <Feedback state={state} />
    </form>
  );
}

export function CloseOfferForm({ action }: { action: Action }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3">
      <ConfirmSubmit
        variant="secondary"
        title={t("scheduling.slotOfferForms.zamknac_ogloszenie")}
        description={t("scheduling.slotOfferForms.ogloszenie_zniknie_a_osoby_ktore_zglosily")}
        confirmLabel={t("scheduling.slotOfferForms.zamknij_ogloszenie")}
        pendingLabel={t("scheduling.slotOfferForms.zamykanie")}
      >
        {t("scheduling.slotOfferForms.zamknij_ogloszenie")}
      </ConfirmSubmit>
      <Feedback state={state} />
    </form>
  );
}
