import "server-only";
import { cookies } from "next/headers";
import { appError } from "@/shared/errors";
import { systemClock } from "@/shared/clock";
import type { RequestContext } from "@/shared/context";
import { err, ok, type Result } from "@/shared/result";
import { createUserClient } from "@/shared/supabase/server";

export const ORG_COOKIE = "dt_org";

export type SessionUser = { id: string; email: string | null };

/** Zalogowany użytkownik z zweryfikowanego JWT (bez wybranej organizacji). */
export async function getSessionUser(): Promise<Result<SessionUser>> {
  const db = await createUserClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return err(appError("unauthenticated", "Zaloguj się, aby kontynuować."));
  return ok({ id: claims.sub, email: typeof claims.email === "string" ? claims.email : null });
}

/**
 * Kontekst żądania dla przypadków użycia: użytkownik, aktywna organizacja i rola.
 * Organizację wybiera ciasteczko `dt_org`, a gdy go brak lub jest nieaktualne, pierwsze członkostwo.
 */
export async function getRequestContext(): Promise<Result<RequestContext>> {
  const db = await createUserClient();
  const { data: claimsData } = await db.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return err(appError("unauthenticated", "Zaloguj się, aby kontynuować."));

  const { data: memberships, error } = await db
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (error) return err(appError("internal", "Nie udało się wczytać organizacji.", error.message));
  if (!memberships || memberships.length === 0) {
    return err(appError("no_organization", "Najpierw utwórz organizację."));
  }

  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const membership = memberships.find((m) => m.organization_id === preferred) ?? memberships[0];

  return ok({
    userId,
    organizationId: membership.organization_id,
    role: membership.role,
    db,
    clock: systemClock,
  });
}
