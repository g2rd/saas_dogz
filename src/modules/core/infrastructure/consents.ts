import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_DOCUMENTS } from "@/shared/legal";

/** Czy użytkownik ma zgodę na wszystkie dokumenty w podanej (bieżącej) wersji. Tabelę czyta w kontekście użytkownika (RLS). */
export async function hasCurrentConsent(db: SupabaseClient, userId: string, version: string): Promise<boolean> {
  const { data, error } = await db.from("consents").select("document").eq("user_id", userId).eq("version", version);
  if (error) throw new Error(`consents: ${error.message}`);
  const accepted = new Set((data ?? []).map((row) => row.document as string));
  return LEGAL_DOCUMENTS.every((document) => accepted.has(document));
}

/** Zapisuje zgodę zalogowanego użytkownika na wszystkie dokumenty w podanej wersji (funkcja SQL `accept_legal`). */
export async function recordConsent(db: SupabaseClient, version: string): Promise<void> {
  const { error } = await db.rpc("accept_legal", { p_version: version });
  if (error) throw new Error(`accept_legal: ${error.message}`);
}
