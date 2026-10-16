import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { hasPermission } from "@/modules/core";
import {
  PACKAGE_STATUS_LABELS,
  SellPackageForm,
  isLowBalance,
  listClientPackages,
  listTemplates,
  type ClientPackage,
  type PackageStatus,
} from "@/modules/packages";
import {
  CHARGE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RecordPaymentForm,
  creditMinor,
  getClientBalance,
  listClientCharges,
  listClientPayments,
  owedMinor,
  type ChargeStatus,
  type ChargeView,
} from "@/modules/payments";
import { formatIsoDate } from "@/shared/dates";
import { formatMoney, money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../_lib/context";
import { recordPaymentAction, sellPackageAction, voidChargeAction, voidPaymentAction } from "../../billing-actions";

const PACKAGE_TONE: Record<PackageStatus, "success" | "neutral" | "warning" | "danger"> = {
  active: "success",
  depleted: "neutral",
  expired: "danger",
  canceled: "neutral",
};

const CHARGE_TONE: Record<ChargeStatus, "success" | "neutral" | "warning" | "danger"> = {
  paid: "success",
  unpaid: "neutral",
  partial: "warning",
  overdue: "danger",
  void: "neutral",
};

const fmt = (amountMinor: number, currency = "PLN") => formatMoney(money(amountMinor, currency));

function PackageCard({ clientId, pkg }: { clientId: string; pkg: ClientPackage }) {
  const used = Math.max(pkg.sessionsTotal - pkg.balance, 0);
  const percent = Math.min(Math.round((Math.max(pkg.balance, 0) / pkg.sessionsTotal) * 100), 100);
  const low = pkg.status === "active" && isLowBalance(pkg.balance);

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{pkg.name}</span>
        <span className="flex flex-wrap gap-2">
          {low ? <Badge tone="warning">Kończy się</Badge> : null}
          <Badge tone={PACKAGE_TONE[pkg.status]}>{PACKAGE_STATUS_LABELS[pkg.status]}</Badge>
        </span>
      </div>
      <p className="mt-2 text-sm">
        Zostało <strong>{pkg.balance}</strong> z {pkg.sessionsTotal} zajęć (wykorzystano {used})
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pkg.balance}
        aria-valuemin={0}
        aria-valuemax={pkg.sessionsTotal}
        aria-label="Pozostałe zajęcia"
      >
        <div className={`h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{pkg.validUntil ? `Ważny do ${formatIsoDate(pkg.validUntil)}` : "Bez terminu ważności"}</span>
        <Link href={`/app/clients/${clientId}/packages/${pkg.id}`} className="underline">
          Historia i korekta
        </Link>
      </div>
    </li>
  );
}

function ChargeRow({ clientId, charge, canWrite }: { clientId: string; charge: ChargeView; canWrite: boolean }) {
  const canVoid = canWrite && charge.status !== "void" && charge.allocatedMinor === 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{charge.description || "Należność"}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Termin {formatIsoDate(charge.dueDate)} · {fmt(charge.amountMinor, charge.currency)}
          {charge.status === "partial" || charge.status === "overdue"
            ? ` · zostało ${fmt(charge.remainingMinor, charge.currency)}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={CHARGE_TONE[charge.status]}>{CHARGE_STATUS_LABELS[charge.status]}</Badge>
        {canVoid ? (
          <form action={voidChargeAction.bind(null, clientId, charge.id)}>
            <ConfirmSubmit
              variant="secondary"
              title="Anulować należność?"
              description="Należność zniknie z salda klienta. Można ją anulować tylko wtedy, gdy nic na nią nie wpłacono."
              confirmLabel="Anuluj należność"
              pendingLabel="Anulowanie..."
            >
              Anuluj
            </ConfirmSubmit>
          </form>
        ) : null}
      </div>
    </li>
  );
}

export async function BillingSection({
  clientId,
  dogs,
}: {
  clientId: string;
  dogs: { id: string; name: string }[];
}) {
  const ctx = await requireContext();
  const canSeePackages = hasPermission(ctx, "packages.read");
  const canWritePackages = hasPermission(ctx, "packages.write");
  const canSeePayments = hasPermission(ctx, "payments.read");
  const canWritePayments = hasPermission(ctx, "payments.write");

  const [packages, templates, charges, payments, balance] = await Promise.all([
    canSeePackages ? listClientPackages(ctx, clientId) : null,
    canWritePackages ? listTemplates(ctx) : null,
    canSeePayments ? listClientCharges(ctx, clientId) : null,
    canSeePayments ? listClientPayments(ctx, clientId) : null,
    canSeePayments ? getClientBalance(ctx, clientId) : null,
  ]);

  const packageList = packages?.ok ? packages.value : [];
  const chargeList = charges?.ok ? charges.value : [];
  const paymentList = payments?.ok ? payments.value : [];
  const owed = balance?.ok ? owedMinor(balance.value) : 0;
  const credit = balance?.ok ? creditMinor(balance.value) : 0;
  const openCharges = chargeList
    .filter((c) => c.remainingMinor > 0)
    .map((c) => ({
      id: c.id,
      label: `${c.description || "Należność"}: zostało ${fmt(c.remainingMinor, c.currency)} (termin ${formatIsoDate(c.dueDate)})`,
    }));

  return (
    <>
      {canSeePackages ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Pakiety</h2>
          {packageList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Ten klient nie ma jeszcze pakietu zajęć.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {packageList.map((pkg) => (
                <PackageCard key={pkg.id} clientId={clientId} pkg={pkg} />
              ))}
            </ul>
          )}
          {canWritePackages ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Sprzedaj pakiet</summary>
              <div className="mt-4">
                <SellPackageForm
                  action={sellPackageAction.bind(null, clientId)}
                  templates={(templates?.ok ? templates.value : []).map((t) => ({
                    id: t.id,
                    name: t.name,
                    sessionsCount: t.sessionsCount,
                    priceMinor: t.priceMinor,
                    currency: t.currency,
                  }))}
                  dogs={dogs}
                />
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {canSeePayments ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Płatności</h2>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p>
              Do zapłaty:{" "}
              <strong className={owed > 0 ? "text-red-600" : ""}>{fmt(owed, chargeList[0]?.currency)}</strong>
            </p>
            {credit > 0 ? (
              <p>
                Nadpłata: <strong className="text-emerald-600">{fmt(credit, chargeList[0]?.currency)}</strong>
              </p>
            ) : null}
          </div>

          {chargeList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Brak należności.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {chargeList.map((charge) => (
                <ChargeRow key={charge.id} clientId={clientId} charge={charge} canWrite={canWritePayments} />
              ))}
            </ul>
          )}

          {canWritePayments ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Zaksięguj wpłatę</summary>
              <div className="mt-4">
                <RecordPaymentForm action={recordPaymentAction.bind(null, clientId)} openCharges={openCharges} />
              </div>
            </details>
          ) : null}

          {paymentList.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 font-medium">Historia wpłat</h3>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {paymentList.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      {payment.paidAt.toLocaleDateString("pl-PL")} · {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      <strong className={payment.voidedAt ? "text-zinc-400 line-through" : undefined}>
                        {fmt(payment.amountMinor, payment.currency)}
                      </strong>
                      {payment.voidedAt ? (
                        <Badge tone="warning">Anulowana</Badge>
                      ) : canWritePayments ? (
                        <form action={voidPaymentAction.bind(null, clientId, payment.id)}>
                          <ConfirmSubmit
                            variant="secondary"
                            title="Anulować wpłatę?"
                            description={`Wpłata ${fmt(payment.amountMinor, payment.currency)} zostanie anulowana (storno): zniknie z salda, a należności, które pokrywała, znowu będą do zapłaty. Wpłata zostaje w historii jako anulowana. Jeśli klient jeszcze nie dostał powiadomienia o wpłacie, nie dostanie go; w przeciwnym razie dostanie informację o anulowaniu.`}
                            confirmLabel="Anuluj wpłatę"
                            pendingLabel="Anulowanie..."
                          >
                            Anuluj wpłatę
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
