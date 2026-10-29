import Link from "next/link";
import { ClientForm } from "@/modules/clients";
import { createClientAction } from "../actions";
import { Suspense } from "react";
import { getPhoneHint } from "@/shared/i18n/server";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function NewClientPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.klienci")}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{t("trainer.clientsNewPage.nowy_klient")}</h1>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <NewClientForm />
      </Suspense>
    </>
  );
}

async function NewClientForm() {
  const t = await getTranslations();
  return <ClientForm action={createClientAction} submitLabel={t("common.dodaj_klienta")} phoneHint={await getPhoneHint()} />;
}
