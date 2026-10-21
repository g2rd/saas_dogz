"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/shared/supabase/server";

export async function suspendedLogoutAction() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/login");
}
