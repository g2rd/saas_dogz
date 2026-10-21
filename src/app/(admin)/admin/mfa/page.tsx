import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireAdminUser } from "../../_lib/context";
import { confirmMfaEnrollAction, startMfaEnrollAction, verifyMfaAction } from "./actions";
import { CodeForm, EnrollFlow } from "./mfa-forms";

export const metadata = { title: "Weryfikacja dwuetapowa" };

export default function MfaPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Mfa />
    </Suspense>
  );
}

async function Mfa() {
  const { db } = await requireAdminUser();

  const { data: level } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === "aal2") redirect("/admin");

  const factors = await db.auth.mfa.listFactors();
  const verified = factors.data?.totp?.[0] ?? null;

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">Weryfikacja dwuetapowa</h1>
      <p className="text-zinc-700">
        Panel właściciela pokazuje dane wszystkich szkół, więc wymaga drugiego składnika: kodu z aplikacji uwierzytelniającej.
      </p>
      {verified ? (
        <>
          <p className="text-sm text-zinc-600">Wpisz aktualny kod z aplikacji, którą wcześniej połączyłeś(-aś) z tym kontem.</p>
          <CodeForm action={verifyMfaAction.bind(null, verified.id)} submitLabel="Zaloguj do panelu" />
        </>
      ) : (
        <EnrollFlow start={startMfaEnrollAction} confirm={confirmMfaEnrollAction} />
      )}
    </div>
  );
}
