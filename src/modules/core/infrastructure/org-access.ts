import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgAccess } from "@/shared/context";

type OrgRow = { id: string; name: string; status: string; access_until: string | null; status_reason: string | null };

export type OrgAccessInfo = { id: string; name: string; status: string; access: OrgAccess | null; reason: string | null };

/** Czy status oznacza całkowitą blokadę (zawieszona albo zarchiwizowana). */
export const isBlockedStatus = (status: string) => status === "suspended" || status === "archived";

/**
 * Stan dostępu szkół, które widzi użytkownik (członek albo klient). Zawieszona szkoła zostaje widoczna wyłącznie
 * dla własnych członków i klientów, żeby aplikacja mogła pokazać komunikat zamiast kreatora nowej szkoły.
 */
export async function loadOrgAccess(db: SupabaseClient, orgIds: string[]): Promise<Map<string, OrgAccessInfo>> {
  const result = new Map<string, OrgAccessInfo>();
  if (orgIds.length === 0) return result;
  const { data } = await db
    .from("organizations")
    .select("id, name, status, access_until, status_reason")
    .in("id", orgIds);
  for (const row of (data ?? []) as OrgRow[]) {
    const blocked = isBlockedStatus(row.status);
    result.set(row.id, {
      id: row.id,
      name: row.name,
      status: row.status,
      reason: row.status_reason,
      access: blocked
        ? null
        : {
            status: row.status === "read_only" ? "read_only" : row.status === "trial" ? "trial" : "active",
            until: row.access_until ? new Date(row.access_until) : null,
            reason: row.status_reason,
          },
    });
  }
  return result;
}

/**
 * Komunikat o zablokowanym dostępie dla zalogowanej osoby: jej szkoła (jako personel) albo szkoła jej trenera (jako klient)
 * jest zawieszona. `null`, gdy żadna z jej szkół nie jest zablokowana albo ma ona inną, aktywną szkołę.
 */
export type AccessNotice = { kind: "staff" | "client"; organizationName: string; reason: string | null };

export async function findAccessNotice(db: SupabaseClient, userId: string): Promise<AccessNotice | null> {
  const [members, clients] = await Promise.all([
    db.from("organization_members").select("organization_id").eq("user_id", userId).eq("status", "active"),
    db.from("client_access").select("organization_id").eq("user_id", userId).eq("status", "active"),
  ]);
  const staffIds = (members.data ?? []).map((m) => m.organization_id as string);
  const clientIds = (clients.data ?? []).map((c) => c.organization_id as string);
  const states = await loadOrgAccess(db, [...new Set([...staffIds, ...clientIds])]);

  const blocked = (ids: string[]) => ids.map((id) => states.get(id)).filter((s): s is OrgAccessInfo => !!s && s.access === null);
  const usable = (ids: string[]) => ids.some((id) => states.get(id)?.access);

  if (usable(staffIds) || usable(clientIds)) return null;
  const staffBlocked = blocked(staffIds)[0];
  if (staffBlocked) return { kind: "staff", organizationName: staffBlocked.name, reason: staffBlocked.reason };
  const clientBlocked = blocked(clientIds)[0];
  if (clientBlocked) return { kind: "client", organizationName: clientBlocked.name, reason: clientBlocked.reason };
  return null;
}
