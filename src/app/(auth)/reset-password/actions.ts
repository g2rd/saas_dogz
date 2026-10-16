"use server";

import { redirect } from "next/navigation";
import { updatePassword } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await createUserClient();
  const result = await updatePassword(db, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app");
}
