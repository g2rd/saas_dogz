import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { ORG_ROLES, roleCan, type OrgRole, type Permission } from "../domain/permissions";

type AuthContext = { role: string };

function isOrgRole(role: string): role is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(role);
}

/** Pierwsza warstwa autoryzacji w przypadku użycia; drugą jest RLS w bazie. */
export function authorize(ctx: AuthContext, permission: Permission): Result<void> {
  if (!isOrgRole(ctx.role) || !roleCan(ctx.role, permission)) {
    return err(appError("forbidden", `Missing permission: ${permission}`));
  }
  return ok(undefined);
}
