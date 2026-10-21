import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplateForm, getTemplate } from "@/modules/packages";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../_lib/context";
import { archiveTemplateAction, restoreTemplateAction, updateTemplateAction } from "../../billing-actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

type Props = PageProps<"/app/packages/[id]">;

export default function TemplatePage({ params }: Props) {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/packages" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.pakiety_2")}
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <TemplateDetails params={params} />
      </Suspense>
    </>
  );
}

async function TemplateDetails({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { id } = await params;
  const ctx = await requireContext();
  const result = await getTemplate(ctx, id);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    throw new Error(result.error.message);
  }
  const template = result.value;
  const archived = template.archivedAt !== null;

  return (
    <div className="mt-2 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {template.name}
          {archived ? <span className="ml-2 text-base text-zinc-500">{t("common.archiwum")}</span> : null}
        </h1>
        <form action={(archived ? restoreTemplateAction : archiveTemplateAction).bind(null, id)}>
          {archived ? (
            <SubmitButton variant="secondary" pendingLabel={t("common.chwila")}>
              {t("common.przywroc_z_archiwum")}
            </SubmitButton>
          ) : (
            <ConfirmSubmit
                variant="danger"
                title={t("trainer.packagesPage.zarchiwizowac_szablon_pakietu")}
                description={t("trainer.packagesPage.szablon_zniknie_z_listy_przy_sprzedazy")}
                confirmLabel={t("common.archiwizuj")}
                pendingLabel={t("common.chwila")}
              >
                {t("common.archiwizuj")}
              </ConfirmSubmit>
          )}
        </form>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("trainer.packagesPage.zmiany_dotycza_tylko_nowych_sprzedazy")}
      </p>
      <TemplateForm
        action={updateTemplateAction.bind(null, id)}
        submitLabel={t("common.zapisz_zmiany")}
        values={{
          name: template.name,
          sessionsCount: template.sessionsCount,
          validityDays: template.validityDays,
          price: (template.priceMinor / 100).toFixed(2).replace(".", ","),
        }}
      />
    </div>
  );
}
