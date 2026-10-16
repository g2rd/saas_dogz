import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { systemClock } from "../clock";
import type { RequestContext } from "../context";

// Domyślne wartości lokalnego Supabase (publiczne klucze demo z `supabase start`).
const API_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Klient z kluczem service_role: tylko do przygotowania danych w testach. */
export function adminClient(): SupabaseClient {
  return createClient(API_URL, SERVICE_KEY, noSession);
}

/** Klient bez sesji (rola anon), jak publiczne strony przed zalogowaniem. */
export function anonClient(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, noSession);
}

export type TestUser = { id: string; email: string; db: SupabaseClient };

/** Tworzy użytkownika i zwraca klienta zalogowanego jako on (RLS obowiązuje). */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;

  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser failed: ${created.error?.message}`);

  const db = createClient(API_URL, ANON_KEY, noSession);
  const signedIn = await db.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`signIn failed: ${signedIn.error.message}`);

  return { id: created.data.user.id, email, db };
}

export function contextFor(user: TestUser, organizationId: string, role: string): RequestContext {
  return { userId: user.id, organizationId, role, db: user.db, clock: systemClock };
}
