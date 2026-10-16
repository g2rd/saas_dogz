import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dokąd skierować użytkownika po zalogowaniu, gdy nie podano adresu docelowego:
 * personel organizacji do panelu trenera, klient (bez członkostwa) do panelu klienta.
 * Bez żadnego z nich (świeże konto) trafia do `/app`, gdzie utworzy organizację.
 */
export async function resolveLandingPath(db: SupabaseClient): Promise<"/app" | "/portal"> {
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return "/app";

  const members = await db
    .from("organization_members")
    .select("organization_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");
  if ((members.count ?? 0) > 0) return "/app";

  const access = await db
    .from("client_access")
    .select("client_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");
  return (access.count ?? 0) > 0 ? "/portal" : "/app";
}
