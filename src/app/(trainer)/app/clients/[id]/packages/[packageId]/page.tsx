import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, getClient } from "@/modules/clients";
import { hasPermission } from "@/modules/core";
import { AdjustPackageForm, getClientPackage, listPackageLedger } from "@/modules/packages";

import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../../../_lib/context";
import { adjustPackageAction, cancelPackageAction } from "../../../../billing-actions";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

type Props = PageProps<"/app/clients/[id]/packages/[packageId]">;

export default function PackagePage({ params }: Props) {
  const t = useTranslations();
  return (
    <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
      <PackageDetails params={params} />
    </Suspense>
  );
}

async function PackageDetails({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { id: clientId, packageId } = await params;
  const ctx = await requireContext();
  const formats = await getFormats();

  const [pkgResult, clientResult, ledgerResult] = await Promise.all([
    getClientPackage(ctx, packageId),
    getClient(ctx, clientId),
    listPackageLedger(ctx, packageId),
  ]);
  if (!pkgResult.ok || !clientResult.ok || pkgResult.value.clientId !== clientId) notFound();
  const pkg = pkgResult.value;
  const ledger = ledgerResult.ok ? ledgerResult.value : [];
  const canWrite = hasPermission(ctx, "packages.write");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/app/clients/${clientId}`} className="text-sm text-zinc-600 dark:text-zinc-400">
          ← {clientFullName(clientResult.value)}
        </Link>
        <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{pkg.name}</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {t("trainer.clientsPackagesPage.summary", {
                balance: pkg.balance,
                total: pkg.sessionsTotal,
                price: formats.money(money(pkg.priceMinor, pkg.currency)),
                validity: pkg.validUntil
                  ? t("trainer.clientsPackagesPage.wazny_do_formatisodate", { formatIsoDate: formats.calendarDate(pkg.validUntil) })
                  : t("trainer.clientsPackagesPage.bez_terminu_waznosci"),
              })}
            </p>
          </div>
          <Badge tone={pkg.status === "active" ? "success" : "neutral"}>{t(`labels.packageStatus.${pkg.status}`)}</Badge>
        </header>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("trainer.clientsPackagesPage.historia_zajec_w_pakiecie")}</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {ledger.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{t(`labels.ledgerReason.${entry.reason}`)}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {formats.dateTime(entry.createdAt)}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              </div>
              <strong className={entry.delta < 0 ? "text-red-600" : "text-emerald-600"}>
                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      {canWrite && pkg.status !== "canceled" && ledger.every((entry) => entry.reason === "purchase") ? (
        <section>
          <form action={cancelPackageAction.bind(null, clientId, packageId)} className="flex flex-col gap-2">
            <div>
              <ConfirmSubmit
                variant="danger"
                title={t("trainer.clientsPackagesPage.anulowac_pakiet")}
                description={t("trainer.clientsPackagesPage.pakiet_zostanie_anulowany_razem_z_jego")}
                confirmLabel={t("trainer.clientsPackagesPage.anuluj_pakiet")}
                pendingLabel={t("common.anulowanie")}
              >
                {t("trainer.clientsPackagesPage.anuluj_pakiet")}
              </ConfirmSubmit>
            </div>
            <p className="text-sm text-zinc-500">{t("trainer.clientsPackagesPage.dostepne_dopoki_pakiet_nie_zostal_uzyty")}</p>
          </form>
        </section>
      ) : null}

      {canWrite ? (
        <section>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">{t("trainer.clientsPackagesPage.korekta_salda")}</summary>
            <div className="mt-4">
              <AdjustPackageForm action={adjustPackageAction.bind(null, clientId, packageId)} />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
