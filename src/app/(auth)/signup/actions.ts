"use server";

import { redirect } from "next/navigation";
import { LOGIN_NEXT_PREFIXES, resolveLandingPath, safeNextPath, signUp } from "@/modules/core";
import { siteUrl } from "@/shared/env";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export type SignupState = FormState & { confirmationSent?: boolean };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const db = await createUserClient();
  const next = safeNextPath(formData.get("next"), LOGIN_NEXT_PREFIXES, "");
  const result = await signUp(db, Object.fromEntries(formData), { siteUrl: siteUrl(), next });
  if (!result.ok) return toFormState(result.error, formData);

  if (result.value === "confirmation_required") return { confirmationSent: true };
  redirect(next || (await resolveLandingPath(db)));
}
