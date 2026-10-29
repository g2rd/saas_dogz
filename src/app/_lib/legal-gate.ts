import { redirect } from "next/navigation";
import { getSessionUser, hasCurrentConsent } from "@/modules/core";
import { LEGAL_VERSION } from "@/shared/legal";
import { createUserClient } from "@/shared/supabase/server";

/**
 * Bramka zgód dla paneli po zalogowaniu: kto nie zaakceptował bieżącej wersji regulaminu i polityki prywatności
 * (stare konto po zmianie `LEGAL_VERSION`), trafia na ekran akceptacji. Niezalogowanych obsługuje proxy i strony.
 */
export async function requireCurrentConsent(): Promise<void> {
  const user = await getSessionUser();
  if (!user.ok) return;
  const db = await createUserClient();
  if (!(await hasCurrentConsent(db, user.value.id, LEGAL_VERSION))) redirect("/accept-terms");
}
