import { fromDbError } from "@/shared/db/errors";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { authorize } from "./authorize";

export type Organization = { id: string; name: string; slug: string };

export async function getOrganization(ctx: RequestContext): Promise<Result<Organization>> {
  const allowed = authorize(ctx, "organization.read");
  if (!allowed.ok) return allowed;

  const { data, error } = await ctx.db
    .from("organizations")
    .select("id, name, slug")
    .eq("id", ctx.organizationId)
    .maybeSingle();
  if (error) return err(fromDbError(error));
  if (!data) return err(appError("not_found", "Nie znaleziono organizacji."));
  return ok(data as Organization);
}
