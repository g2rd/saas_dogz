import Link from "next/link";
import { ClientForm } from "@/modules/clients";
import { createClientAction } from "../actions";
import { useTranslations } from "next-intl";

export default function NewClientPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.klienci")}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{t("trainer.clientsNewPage.nowy_klient")}</h1>
      <ClientForm action={createClientAction} submitLabel={t("common.dodaj_klienta")} />
    </>
  );
}
