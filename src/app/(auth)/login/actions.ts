"use server";

import { redirect } from "next/navigation";
import { LOGIN_NEXT_PREFIXES, resolveLandingPath, safeNextPath, signIn } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await createUserClient();
  const result = await signIn(db, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);

  // Bez poprawnego adresu docelowego rola rozstrzyga: personel do /app, klient do /portal.
  const next = safeNextPath(formData.get("next"), LOGIN_NEXT_PREFIXES, "");
  redirect(next || (await resolveLandingPath(db)));
}
