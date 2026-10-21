import Link from "next/link";
import { TemplateForm } from "@/modules/packages";
import { createTemplateAction } from "../../billing-actions";
import { useTranslations } from "next-intl";

export default function NewTemplatePage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/packages" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.pakiety_2")}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{t("trainer.packagesNewPage.nowy_szablon_pakietu")}</h1>
      <TemplateForm action={createTemplateAction} submitLabel={t("trainer.packagesNewPage.dodaj_szablon")} />
    </>
  );
}
