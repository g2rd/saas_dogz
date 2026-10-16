"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createUserClient } from "@/shared/supabase/server";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Podaj poprawny e-mail i hasło." };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Nieprawidłowy e-mail lub hasło." };

  redirect("/app");
}
