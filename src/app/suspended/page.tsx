import { redirect } from "next/navigation";
import { Suspense } from "react";
import { findAccessNotice, getSessionUser } from "@/modules/core";
import { supportEmail } from "@/shared/env";
import { createUserClient } from "@/shared/supabase/server";
import { suspendedLogoutAction } from "./actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "Konto niedostępne" };

/** Ekran dla osób, których szkoła została zawieszona przez właściciela platformy (np. koniec testów, brak płatności). */
export default function SuspendedPage() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <Notice />
      </Suspense>
    </main>
  );
}

async function Notice() {
  const t = await getTranslations();
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
      <h1 className="text-2xl font-semibold">{staff ? t("auth.suspendedPage.konto_zawieszone") : t("auth.suspendedPage.szkola_chwilowo_niedostepna")}</h1>
      <p className="text-zinc-700">
        {staff
          ? t("auth.suspendedPage.dostep_do_szkoly_organizationname_zostal", { organizationName: notice.organizationName })
          : t("auth.suspendedPage.panel_szkoly_organizationname_jest", { organizationName: notice.organizationName })}
      </p>
      {staff && notice.reason ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{t("auth.suspendedPage.powod_reason", { reason: notice.reason })}</p>
      ) : null}
      {staff ? (
        <p className="text-zinc-700">
          {contact
            ? t.rich("auth.suspendedPage.contact_with_email", {
                mail: (chunks) => (
                  <a className="underline" href={`mailto:${contact}`}>
                    {chunks}
                  </a>
                ),
                email: contact,
              })
            : t("auth.suspendedPage.contact")}
        </p>
      ) : null}
      <form action={suspendedLogoutAction}>
        <button type="submit" className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium hover:bg-zinc-50">
          {t("common.wyloguj")}
        </button>
      </form>
    </>
  );
}
