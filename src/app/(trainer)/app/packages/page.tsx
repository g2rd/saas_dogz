import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { listTemplates } from "@/modules/packages";
import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../_lib/context";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

export default function PackagesPage({ searchParams }: PageProps<"/app/packages">) {
  const t = useTranslations();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("common.pakiety")}</h1>
        <Link
          href="/app/packages/new"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          {t("trainer.packagesPage.nowy_szablon")}
        </Link>
      </div>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t("trainer.packagesPage.szablony_pakietow_z_ktorych_sprzedajesz")}
      </p>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <TemplateList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TemplateList({ searchParams }: Pick<PageProps<"/app/packages">, "searchParams">) {
  const formats = await getFormats();
  const t = await getTranslations();
  const params = await searchParams;
  const showArchived = (Array.isArray(params.archived) ? params.archived[0] : params.archived) === "1";

  const ctx = await requireContext();
  const result = await listTemplates(ctx, { includeArchived: showArchived });
  if (!result.ok) throw new Error(result.error.message);
  const templates = result.value;
  const canWrite = hasPermission(ctx, "packages.write");

  return (
    <div className="mt-6 flex flex-col gap-4">
      {templates.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {t("trainer.packagesPage.empty", { canWrite: canWrite ? "yes" : "no" })}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/app/packages/${template.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">
                  {template.name}
                  {template.archivedAt ? <span className="ml-2"><Badge>{t("common.archiwum_2")}</Badge></span> : null}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {t("trainer.packagesPage.sessionscount_zajec_formatmoney_value", { sessionsCount: template.sessionsCount, formatMoney: formats.money(money(template.priceMinor, template.currency)), value: template.validityDays ? `${template.validityDays} dni` : "bez terminu" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={showArchived ? "/app/packages" : "/app/packages?archived=1"}
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        {showArchived ? t("trainer.packagesPage.ukryj_archiwalne") : t("trainer.packagesPage.pokaz_archiwalne")}
      </Link>
    </div>
  );
}
