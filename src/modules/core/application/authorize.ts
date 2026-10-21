import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { ORG_ROLES, roleCan, type OrgRole, type Permission } from "../domain/permissions";

type AuthContext = { role: string; access?: { status: string } };

function isOrgRole(role: string): role is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(role);
}

/** Czy rola ma uprawnienie; do ukrywania elementów UI (autoryzacją pozostaje `authorize` i RLS). */
export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return authorize(ctx, permission).ok;
}

/** Pierwsza warstwa autoryzacji w przypadku użycia; drugą jest RLS w bazie. */
export function authorize(ctx: AuthContext, permission: Permission): Result<void> {
  if (!isOrgRole(ctx.role) || !roleCan(ctx.role, permission)) {
    return err(appError("forbidden", `Missing permission: ${permission}`));
  }
  if (ctx.access?.status === "read_only" && isWritePermission(permission)) {
    return err(appError("forbidden", READ_ONLY_MESSAGE, { reason: "read_only" }));
  }
  return ok(undefined);
}

export const READ_ONLY_MESSAGE =
  "Konto Twojej szkoły jest w trybie tylko do odczytu, więc nie można zapisywać zmian. Skontaktuj się z obsługą.";

/** Uprawnienia zmieniające dane; w trybie „tylko do odczytu” są zablokowane (drugą warstwą jest wyzwalacz w bazie). */
function isWritePermission(permission: Permission): boolean {
  return permission.endsWith(".write") || permission === "organization.update" || permission === "members.manage" || permission === "billing.manage";
}
