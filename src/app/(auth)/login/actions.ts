"use server";

import { redirect } from "next/navigation";
import { safeNextPath, signIn } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await createUserClient();
  const result = await signIn(db, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);

  redirect(safeNextPath(formData.get("next")));
}
