import { redirect } from "next/navigation";
import { getSessionUser, hasCurrentConsent } from "@/modules/core";
import { LEGAL_VERSION } from "@/shared/legal";
import { createUserClient } from "@/shared/supabase/server";

/**
 * Bramka zgód dla paneli po zalogowaniu: kto nie zaakceptował bieżącej wersji regulaminu i polityki prywatności
 * (stare konto po zmianie `LEGAL_VERSION`), trafia na ekran akceptacji. Niezalogowanych obsługuje proxy i strony.
 *
 * To komponent serwerowy owijający treść strony w `<Suspense>` (w układzie): sprawdzenie zgody czyta ciasteczka i bazę, więc wykonane
 * wprost w układzie blokowałoby prerender całej trasy (Cache Components). Treść strony pojawia się dopiero po pozytywnym sprawdzeniu.
 */
export async function LegalGate({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user.ok) {
    const db = await createUserClient();
    if (!(await hasCurrentConsent(db, user.value.id, LEGAL_VERSION))) redirect("/accept-terms");
  }
  return children;
}
