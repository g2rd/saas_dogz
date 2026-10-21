import "server-only";
import { cookies } from "next/headers";
import { appError } from "@/shared/errors";
import { systemClock } from "@/shared/clock";
import type { RequestContext } from "@/shared/context";
import { err, ok, type Result } from "@/shared/result";
import { createUserClient } from "@/shared/supabase/server";
import { loadOrgAccess } from "./org-access";

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

  // Zawieszone szkoły pomijamy; gdy wszystkie są zawieszone, aplikacja pokazuje ekran zawieszenia (zamiast kreatora szkoły)
  const states = await loadOrgAccess(
    db,
    memberships.map((m) => m.organization_id),
  );
  const usable = memberships.filter((m) => states.get(m.organization_id)?.access);
  if (usable.length === 0) {
    return err(appError("org_suspended", "Konto Twojej szkoły jest zawieszone.", { organization: states.get(memberships[0].organization_id)?.name }));
  }

  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const membership = usable.find((m) => m.organization_id === preferred) ?? usable[0];

  return ok({
    userId,
    organizationId: membership.organization_id,
    role: membership.role,
    db,
    clock: systemClock,
    access: states.get(membership.organization_id)?.access ?? undefined,
  });
}
