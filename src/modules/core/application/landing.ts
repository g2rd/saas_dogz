import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dokąd skierować użytkownika po zalogowaniu, gdy nie podano adresu docelowego:
 * personel organizacji do panelu trenera, klient (bez członkostwa) do panelu klienta, osoba z oczekującą prośbą o dołączenie do ekranu `/school`.
 * Konto właściciela platformy jest osobnym kontem (bez szkoły i panelu klienta): trafia do `/admin`.
 * Bez żadnego z nich (świeże konto) trafia do `/app`, gdzie utworzy organizację.
 */
export async function resolveLandingPath(db: SupabaseClient): Promise<"/app" | "/portal" | "/school" | "/admin"> {
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
  if ((access.count ?? 0) > 0) return "/portal";

  // Właściciel platformy (osobne konto, bez szkoły): panel właściciela zamiast kreatora szkoły
  const platformAdmin = await db.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  if ((platformAdmin.count ?? 0) > 0) return "/admin";

  // Osoba, która prosiła o dołączenie do szkoły przez jej link i czeka na akceptację, widzi status prośby zamiast kreatora szkoły
  const pending = await db
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");
  return (pending.count ?? 0) > 0 ? "/school" : "/app";
}
