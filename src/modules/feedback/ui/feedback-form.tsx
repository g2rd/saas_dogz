"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextAreaField } from "@/shared/ui/form-fields";
import { Msg } from "@/shared/ui/msg";
import { FEEDBACK_KINDS } from "../domain/feedback";

export type FeedbackFormState = FormState & { message?: string };

/** Ścieżka ekranu, z którego użytkownik przyszedł do formularza (tylko ta sama witryna); pusta, gdy nieznana. */
function referrerPath(): string {
  try {
    const url = new URL(document.referrer);
    return url.origin === window.location.origin ? url.pathname : "";
  } catch {
    return "";
  }
}

/** Formularz „Zgłoś problem lub pomysł”: rodzaj i treść; ekran, z którego przyszedłeś, dopisujemy sami. */
export function FeedbackForm({ action }: { action: (prev: FeedbackFormState, formData: FormData) => Promise<FeedbackFormState> }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  return (
    <form
      action={(formData) => {
        formData.set("page", referrerPath());
        return formAction(formData);
      }}
      className="flex max-w-md flex-col gap-4"
    >
      <SelectField
        label={t("report.kind_label")}
        name="kind"
        defaultValue={v("kind", "problem")}
        options={FEEDBACK_KINDS.map((kind) => ({ value: kind, label: t(`report.kind.${kind}`) }))}
        errors={errors.kind}
      />
      <TextAreaField
        label={t("report.message_label")}
        name="message"
        hint={t("report.message_hint")}
        defaultValue={v("message")}
        errors={errors.message}
        required
      />
      <FormMessage state={state} />
      {state.message ? (
        <p role="status" className="text-sm text-emerald-700">
          <Msg text={state.message} />
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel={t("report.sending")}>{t("report.submit")}</SubmitButton>
      </div>
    </form>
  );
}
