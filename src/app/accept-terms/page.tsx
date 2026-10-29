import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser, hasCurrentConsent } from "@/modules/core";
import { LEGAL_VERSION } from "@/shared/legal";
import { ConsentField } from "@/shared/ui/consent-field";
import { createUserClient } from "@/shared/supabase/server";
import { suspendedLogoutAction } from "../suspended/actions";
import { acceptLegalAction } from "./actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("legal.reconsent.title") };
}

/** Ekran ponownej zgody: po zmianie wersji regulaminu i polityki prywatności konto musi zaakceptować nową wersję. */
export default function AcceptTermsPage() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const t = await getTranslations();
  const user = await getSessionUser();
  if (!user.ok) redirect("/login");
  // Zgoda na bieżącą wersję już jest: wracamy do aplikacji
  if (await hasCurrentConsent(await createUserClient(), user.value.id, LEGAL_VERSION)) redirect("/start");

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("legal.reconsent.title")}</h1>
      <p className="text-zinc-700">{t("legal.reconsent.intro", { version: LEGAL_VERSION })}</p>
      <form action={acceptLegalAction} className="flex flex-col gap-4">
        <ConsentField />
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 font-medium text-white">
          {t("legal.reconsent.submit")}
        </button>
      </form>
      <form action={suspendedLogoutAction}>
        <button type="submit" className="text-sm text-zinc-600 underline">
          {t("legal.reconsent.logout")}
        </button>
      </form>
    </>
  );
}
