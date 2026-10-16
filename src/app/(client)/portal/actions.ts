"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMyDog } from "@/modules/portal";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";
import { requirePortalContext } from "../_lib/context";

export async function portalLogoutAction() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/login");
}

/** Klient dodaje psa; pies czeka na zatwierdzenie trenera. */
export async function addMyDogAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePortalContext();
  const result = await addMyDog(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);

  revalidatePath("/portal", "layout");
  redirect("/portal/dogs");
}
