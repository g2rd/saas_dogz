import { redirect } from "next/navigation";
import { Suspense } from "react";
import { findAccessNotice, getSessionUser } from "@/modules/core";
import { supportEmail } from "@/shared/env";
import { createUserClient } from "@/shared/supabase/server";
import { suspendedLogoutAction } from "./actions";

export const metadata = { title: "Konto niedostępne" };

/** Ekran dla osób, których szkoła została zawieszona przez właściciela platformy (np. koniec testów, brak płatności). */
export default function SuspendedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <Notice />
      </Suspense>
    </main>
  );
}

async function Notice() {
  const user = await getSessionUser();
  if (!user.ok) redirect("/login");
  const db = await createUserClient();
  const notice = await findAccessNotice(db, user.value.id);
  // Dostęp działa (np. szkołę odwieszono): wracamy do aplikacji
  if (!notice) redirect("/start");

  const contact = supportEmail();
  const staff = notice.kind === "staff";

  return (
    <>
      <h1 className="text-2xl font-semibold">{staff ? "Konto zawieszone" : "Szkoła chwilowo niedostępna"}</h1>
      <p className="text-zinc-700">
        {staff
          ? `Dostęp do szkoły „${notice.organizationName}” został wstrzymany. Twoje dane są bezpieczne i nie zostały usunięte.`
          : `Panel szkoły „${notice.organizationName}” jest chwilowo niedostępny. Skontaktuj się ze swoim trenerem.`}
      </p>
      {staff && notice.reason ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Powód: {notice.reason}</p>
      ) : null}
      {staff ? (
        <p className="text-zinc-700">
          Aby odzyskać dostęp, skontaktuj się z obsługą
          {contact ? (
            <>
              : <a className="underline" href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : null}
          .
        </p>
      ) : null}
      <form action={suspendedLogoutAction}>
        <button type="submit" className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium hover:bg-zinc-50">
          Wyloguj
        </button>
      </form>
    </>
  );
}
