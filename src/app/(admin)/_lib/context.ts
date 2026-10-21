import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/modules/core";
import type { AdminContext } from "@/modules/platform";
import { systemClock } from "@/shared/clock";
import { adminRequireMfa } from "@/shared/env";
import { createServiceClient } from "@/shared/supabase/admin";
import { createUserClient } from "@/shared/supabase/server";

/**
 * Zalogowana osoba z tabeli `platform_admins` (bez wymagania drugiego składnika). Pozostali dostają 404:
 * panel nie ujawnia, że istnieje. Używa tego tylko strona konfiguracji weryfikacji dwuetapowej.
 */
export async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user.ok) redirect("/login?next=%2Fadmin");

  const db = await createUserClient();
  const { data } = await db.from("platform_admins").select("user_id").eq("user_id", user.value.id).maybeSingle();
  if (!data) notFound();
  return { userId: user.value.id, db };
}

/**
 * Strażnik panelu właściciela: administrator platformy, a gdy wymagana jest weryfikacja dwuetapowa (domyślnie na produkcji),
 * także sesja potwierdzona kodem TOTP (poziom aal2). Dopiero po tym tworzymy klienta service_role.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { userId, db } = await requireAdminUser();

  if (adminRequireMfa()) {
    const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== "aal2") redirect("/admin/mfa");
  }

  return { adminId: userId, db: createServiceClient(), now: systemClock.now };
}
