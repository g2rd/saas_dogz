"use server";

import { redirect } from "next/navigation";
import { createOrganization } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export async function createOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await createUserClient();
  const result = await createOrganization(db, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app");
}

export async function logoutAction() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/login");
}
