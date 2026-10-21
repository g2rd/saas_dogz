import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { PackageTemplate, TemplateInput } from "../domain/template";
import { msg } from "@/shared/i18n/messages";

const COLUMNS =
  "id, organization_id, name, sessions_count, validity_days, price_minor, currency, is_active, archived_at";

type TemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  sessions_count: number;
  validity_days: number | null;
  price_minor: number;
  currency: string;
  is_active: boolean;
  archived_at: string | null;
};

function toTemplate(row: TemplateRow): PackageTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    sessionsCount: row.sessions_count,
    validityDays: row.validity_days,
    priceMinor: row.price_minor,
    currency: row.currency,
    isActive: row.is_active,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
  };
}

const notFound = () => appError("not_found", msg("errors.not_found.template"));

export function templatesRepository(db: SupabaseClient) {
  return {
    async list(organizationId: string, includeArchived = false): Promise<Result<PackageTemplate[]>> {
      let query = db
        .from("package_templates")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .order("name");
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok((data as TemplateRow[]).map(toTemplate));
    },

    async get(organizationId: string, id: string): Promise<Result<PackageTemplate>> {
      const { data, error } = await db
        .from("package_templates")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toTemplate(data as TemplateRow));
    },

    async insert(organizationId: string, userId: string, input: TemplateInput): Promise<Result<PackageTemplate>> {
      const { data, error } = await db
        .from("package_templates")
        .insert({
          organization_id: organizationId,
          name: input.name,
          sessions_count: input.sessionsCount,
          validity_days: input.validityDays,
          price_minor: input.priceMinor,
          created_by: userId,
        })
        .select(COLUMNS)
        .single();
      if (error) return err(fromDbError(error));
      return ok(toTemplate(data as TemplateRow));
    },

    async update(organizationId: string, id: string, input: TemplateInput): Promise<Result<PackageTemplate>> {
      const { data, error } = await db
        .from("package_templates")
        .update({
          name: input.name,
          sessions_count: input.sessionsCount,
          validity_days: input.validityDays,
          price_minor: input.priceMinor,
        })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toTemplate(data as TemplateRow));
    },

    async setArchived(organizationId: string, id: string, archivedAt: Date | null): Promise<Result<PackageTemplate>> {
      const { data, error } = await db
        .from("package_templates")
        .update({ archived_at: archivedAt ? archivedAt.toISOString() : null, is_active: archivedAt === null })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toTemplate(data as TemplateRow));
    },
  };
}
