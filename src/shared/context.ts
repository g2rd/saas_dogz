import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clock } from "./clock";

/** Kontekst żądania przekazywany do każdego przypadku użycia. */
export type RequestContext = {
  userId: string;
  organizationId: string;
  /** Rola w organizacji; walidowana w module core. */
  role: string;
  /** Klient bazy działający jako zalogowany użytkownik, więc RLS zawsze obowiązuje. */
  db: SupabaseClient;
  clock: Clock;
};
