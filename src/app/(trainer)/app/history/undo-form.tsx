"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { FormMessage } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

/** Przycisk „Cofnij” przy wpisie historii: potwierdzenie, a odmowę reguł (np. minął dzień) pokazuje pod wpisem. */
export function UndoForm({
  action,
  kind,
}: {
  action: () => Promise<FormState>;
  kind: "void_payment" | "cancel_package" | "undo_complete" | "undo_cancel";
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState<FormState>(async () => action(), {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <ConfirmSubmit
        variant="secondary"
        title={t(`history.undo_titles.${kind}`)}
        description={t(`history.undo_descriptions.${kind}`)}
        confirmLabel={t(`history.undo_labels.${kind}`)}
        pendingLabel={t("history.undoing")}
      >
        {t("history.undo")}
      </ConfirmSubmit>
      <FormMessage state={state} />
    </form>
  );
}
