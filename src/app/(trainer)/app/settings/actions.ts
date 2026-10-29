"use server";

import { revalidatePath } from "next/cache";
import { updateSchoolSettings } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { requireContext } from "../../_lib/context";

export type SettingsFormState = FormState & { saved?: boolean };

export async function saveSchoolSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const ctx = await requireContext();
  const result = await updateSchoolSettings(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);

  // Strefa i waluta wpływają na cały panel (terminarz, kwoty), więc odświeżamy cały układ
  revalidatePath("/app", "layout");
  return { saved: true, values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> };
}
