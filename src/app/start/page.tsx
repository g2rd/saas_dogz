import { redirect } from "next/navigation";
import { Suspense } from "react";
import { resolveLandingPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";

/** Adres startowy aplikacji zainstalowanej na ekranie głównym: kieruje do logowania albo do właściwego panelu. */
export default function StartPage() {
  return (
    <Suspense fallback={<p className="p-6 text-zinc-500">Ładowanie...</p>}>
      <Redirector />
    </Suspense>
  );
}

async function Redirector(): Promise<never> {
  const db = await createUserClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return redirect(await resolveLandingPath(db));
}
