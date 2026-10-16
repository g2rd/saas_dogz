import "server-only";
import { cookies } from "next/headers";
import { systemClock } from "@/shared/clock";
import type { ClientRequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { createUserClient } from "@/shared/supabase/server";

export const CLIENT_COOKIE = "dt_client";

/**
 * Kontekst panelu klienta: zalogowana osoba i kartoteka klienta, do której ma aktywny dostęp
 * (przy kilku kartotekach wybiera ciasteczko `dt_client`, domyślnie najstarszy dostęp).
 */
export async function getPortalContext(): Promise<Result<ClientRequestContext>> {
  const db = await createUserClient();
  const { data: claimsData } = await db.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return err(appError("unauthenticated", "Zaloguj się, aby kontynuować."));

  const { data, error } = await db
    .from("client_access")
    .select("organization_id, client_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (error) return err(appError("internal", "Nie udało się wczytać dostępu klienta.", error.message));

  const rows = (data ?? []) as { organization_id: string; client_id: string }[];
  if (rows.length === 0) return err(appError("no_client_access", "To konto nie ma dostępu do panelu klienta."));

  const preferred = (await cookies()).get(CLIENT_COOKIE)?.value;
  const access = rows.find((row) => row.client_id === preferred) ?? rows[0];

  return ok({
    userId,
    organizationId: access.organization_id,
    clientId: access.client_id,
    db,
    clock: systemClock,
  });
}
