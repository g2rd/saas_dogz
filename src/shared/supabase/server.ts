import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "../db/database.types";
import { publicEnv } from "../env";

/** Klient w kontekście zalogowanego użytkownika (RLS obowiązuje). */
export async function createUserClient() {
  // Najpierw connection(), potem cookies(): render zależy od żądania, więc prerender
  // wstrzymuje się, zanim sprawdzimy zmienne środowiskowe lub zweryfikujemy JWT
  // (getClaims używa Date.now(), niedozwolonego w prerenderze).
  await connection();
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Wywołane z Server Component, gdzie ciasteczek nie można zapisać;
          // odświeżanie sesji robi proxy.
        }
      },
    },
  });
}
