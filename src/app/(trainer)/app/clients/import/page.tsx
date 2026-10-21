import Link from "next/link";
import { ImportForm } from "@/modules/clients";
import { useTranslations } from "next-intl";
import { confirmImportAction, previewImportAction } from "./actions";

export default function ImportClientsPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        {t("common.klienci")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("clients.import.title")}</h1>
      <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">{t("clients.import.intro")}</p>
      <div className="mt-6">
        <ImportForm previewAction={previewImportAction} confirmAction={confirmImportAction} />
      </div>
    </>
  );
}
