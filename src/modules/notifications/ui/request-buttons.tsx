"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/shared/ui/form-fields";
import { type RequestKind } from "../domain/notification";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";

export type RespondState = { message?: string; error?: string };
type RespondAction = (prev: RespondState, formData: FormData) => Promise<RespondState>;

/**
 * Przyciski odpowiedzi klienta: „Odnów pakiet”, „Zapłacę”, „Kończę współpracę”. Odpowiedź jest tylko informacją
 * dla trenera. Rodzaje już wysłane (otwarte prośby) są pokazane jako potwierdzone zamiast przycisków.
 */
export function RequestButtons({
  action,
  kinds,
  packageId,
  chargeId,
  sessionId,
  alreadySent,
}: {
  action: RespondAction;
  kinds: readonly RequestKind[];
  packageId?: string | null;
  chargeId?: string | null;
  sessionId?: string | null;
  alreadySent: readonly RequestKind[];
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const pending = kinds.filter((kind) => !alreadySent.includes(kind));

  return (
    <div className="mt-3 flex flex-col gap-2">
      {alreadySent.length > 0 ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {t("notifications.requestButtons.wyslano_trenerowi_join", { join: alreadySent.map((kind) => t(`labels.requestAction.${kind}`)).join(", ") })}
        </p>
      ) : null}
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
      {pending.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pending.map((kind) => (
            <form key={kind} action={formAction}>
              <input type="hidden" name="kind" value={kind} />
              {packageId ? <input type="hidden" name="packageId" value={packageId} /> : null}
              {chargeId ? <input type="hidden" name="chargeId" value={chargeId} /> : null}
              {sessionId ? <input type="hidden" name="sessionId" value={sessionId} /> : null}
              <SubmitButton variant={kind === "end" || kind === "cancel" ? "secondary" : "primary"} pendingLabel={t("common.wysylanie")}>
                {t(`labels.requestAction.${kind}`)}
              </SubmitButton>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
