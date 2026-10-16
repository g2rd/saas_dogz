import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "../env";

/** Klient w kontekście zalogowanego użytkownika (RLS obowiązuje). */
export async function createUserClient() {
  // cookies() najpierw: oznacza render jako zależny od żądania, więc prerender
  // się wstrzymuje, zanim sprawdzimy zmienne środowiskowe.
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
