import { fromDbError } from "@/shared/db/errors";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { authorize } from "./authorize";
import { msg } from "@/shared/i18n/messages";

export type Organization = { id: string; name: string; slug: string };

export type OrganizationSettings = {
  timezone: string;
  lateCancelHours: number;
  lateCancelConsumesSession: boolean;
};

const DEFAULT_SETTINGS: OrganizationSettings = {
  timezone: "Europe/Warsaw",
  lateCancelHours: 24,
  lateCancelConsumesSession: true,
};

/** Ustawienia organizacji (strefa czasowa, polityka późnych odwołań); brak wiersza daje wartości domyślne. */
export async function getOrganizationSettings(ctx: RequestContext): Promise<Result<OrganizationSettings>> {
  const allowed = authorize(ctx, "organization.read");
  if (!allowed.ok) return allowed;

  const { data, error } = await ctx.db
    .from("organization_settings")
    .select("timezone, late_cancel_hours, late_cancel_consumes_session")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) return err(fromDbError(error));
  if (!data) return ok(DEFAULT_SETTINGS);

  const row = data as { timezone: string; late_cancel_hours: number; late_cancel_consumes_session: boolean };
  return ok({
    timezone: row.timezone,
    lateCancelHours: row.late_cancel_hours,
    lateCancelConsumesSession: row.late_cancel_consumes_session,
  });
}

export type Trainer = { userId: string; name: string; role: string };

/** Osoby, które mogą prowadzić zajęcia (owner, admin, trainer), z imionami z profili. */
export async function listTrainers(ctx: RequestContext): Promise<Result<Trainer[]>> {
  const allowed = authorize(ctx, "organization.read");
  if (!allowed.ok) return allowed;

  const members = await ctx.db
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "trainer"])
    .order("created_at");
  if (members.error) return err(fromDbError(members.error));

  const rows = members.data as { user_id: string; role: string }[];
  const profiles = await ctx.db
    .from("profiles")
    .select("id, full_name")
    .in("id", rows.map((m) => m.user_id));
  if (profiles.error) return err(fromDbError(profiles.error));

  const names = new Map((profiles.data as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return ok(
    rows.map((m) => ({
      userId: m.user_id,
      name: names.get(m.user_id) || (m.user_id === ctx.userId ? "Ty" : "Trener"),
      role: m.role,
    })),
  );
}

export async function getOrganization(ctx: RequestContext): Promise<Result<Organization>> {
  const allowed = authorize(ctx, "organization.read");
  if (!allowed.ok) return allowed;

  const { data, error } = await ctx.db
    .from("organizations")
    .select("id, name, slug")
    .eq("id", ctx.organizationId)
    .maybeSingle();
  if (error) return err(fromDbError(error));
  if (!data) return err(appError("not_found", msg("errors.not_found.organization")));
  return ok(data as Organization);
}
