import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, getClient } from "@/modules/clients";
import { hasPermission } from "@/modules/core";
import {
  AdjustPackageForm,
  LEDGER_REASON_LABELS,
  PACKAGE_STATUS_LABELS,
  getClientPackage,
  listPackageLedger,
} from "@/modules/packages";
import { formatIsoDate } from "@/shared/dates";
import { formatMoney, money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../../../_lib/context";
import { adjustPackageAction, cancelPackageAction } from "../../../../billing-actions";

type Props = PageProps<"/app/clients/[id]/packages/[packageId]">;

export default function PackagePage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <PackageDetails params={params} />
    </Suspense>
  );
}

async function PackageDetails({ params }: Pick<Props, "params">) {
  const { id: clientId, packageId } = await params;
  const ctx = await requireContext();

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
              Zostało {pkg.balance} z {pkg.sessionsTotal} zajęć · {formatMoney(money(pkg.priceMinor, pkg.currency))} ·{" "}
              {pkg.validUntil ? `ważny do ${formatIsoDate(pkg.validUntil)}` : "bez terminu ważności"}
            </p>
          </div>
          <Badge tone={pkg.status === "active" ? "success" : "neutral"}>{PACKAGE_STATUS_LABELS[pkg.status]}</Badge>
        </header>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Historia zajęć w pakiecie</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {ledger.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{LEDGER_REASON_LABELS[entry.reason]}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {entry.createdAt.toLocaleString("pl-PL")}
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
                title="Anulować pakiet?"
                description="Pakiet zostanie anulowany razem z jego nieopłaconą należnością. Można anulować tylko pakiet, z którego nie użyto jeszcze żadnych zajęć i za który klient nie zapłacił (jeśli zapłacił, najpierw anuluj wpłatę)."
                confirmLabel="Anuluj pakiet"
                pendingLabel="Anulowanie..."
              >
                Anuluj pakiet
              </ConfirmSubmit>
            </div>
            <p className="text-sm text-zinc-500">Dostępne, dopóki pakiet nie został użyty.</p>
          </form>
        </section>
      ) : null}

      {canWrite ? (
        <section>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">Korekta salda</summary>
            <div className="mt-4">
              <AdjustPackageForm action={adjustPackageAction.bind(null, clientId, packageId)} />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
