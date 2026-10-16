import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

/**
 * Klient z kluczem service_role, który omija RLS.
 * Wyłącznie zadania w tle, webhooki i panel administratora platformy.
 */
export function createServiceClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
