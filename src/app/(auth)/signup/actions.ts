"use server";

import { redirect } from "next/navigation";
import { safeNextPath, signUp } from "@/modules/core";
import { siteUrl } from "@/shared/env";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export type SignupState = FormState & { confirmationSent?: boolean };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const db = await createUserClient();
  const next = formData.get("next");
  const result = await signUp(db, Object.fromEntries(formData), { siteUrl: siteUrl(), next });
  if (!result.ok) return toFormState(result.error, formData);

  if (result.value === "confirmation_required") return { confirmationSent: true };
  redirect(safeNextPath(next));
}
