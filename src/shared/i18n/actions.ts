"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createUserClient } from "../supabase/server";
import { enabledLocales, isLocale, LOCALE_COOKIE, parseAcceptLanguage } from "./locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Zmiana języka w ustawieniach (`Więcej`): `auto` wraca do języka z telefonu lub przeglądarki. Zapisuje ciasteczko
 * (wybór widoczny od razu) i język w profilu (powiadomienia w języku odbiorcy).
 */
export async function setLocaleAction(value: string): Promise<void> {
  const cookieStore = await cookies();
  let preferred: string;

  if (value === "auto") {
    cookieStore.delete(LOCALE_COOKIE);
    const accept = parseAcceptLanguage((await headers()).get("accept-language"));
    preferred = accept[0]?.language ?? "pl";
  } else if (isLocale(value) && enabledLocales().includes(value)) {
    cookieStore.set(LOCALE_COOKIE, value, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
    preferred = value;
  } else {
    return;
  }

  // Profil zalogowanego użytkownika; brak sesji lub błąd zapisu nie psuje zmiany języka w tej przeglądarce
  try {
    const db = await createUserClient();
    const { data } = await db.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) await db.from("profiles").update({ locale: preferred }).eq("id", userId);
  } catch {
    // ignorujemy
  }

  revalidatePath("/", "layout");
}
