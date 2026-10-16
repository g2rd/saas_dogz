"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/shared/ui/form-fields";

export type ClaimSlotState = { message?: string; error?: string };
type Action = (prev: ClaimSlotState, formData: FormData) => Promise<ClaimSlotState>;

/** „Biorę”: zgłoszenie do wolnego terminu (z wyborem psa, gdy klient ma kilka). Decyzję podejmuje trener. */
export function ClaimSlotForm({
  action,
  offerId,
  dogs,
}: {
  action: Action;
  offerId: string;
  dogs: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      {dogs.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Który pies?</span>
          <select name="dogId" defaultValue={dogs[0].id} className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base">
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="dogId" value={dogs[0]?.id ?? ""} />
      )}
      <div>
        <SubmitButton pendingLabel="Zgłaszanie...">Biorę</SubmitButton>
      </div>
      {state.message ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
