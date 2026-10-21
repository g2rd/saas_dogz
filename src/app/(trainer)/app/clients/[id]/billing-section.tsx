import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { hasPermission } from "@/modules/core";
import { SellPackageForm, isLowBalance, listClientPackages, listTemplates, type ClientPackage, type PackageStatus } from "@/modules/packages";
import { RecordPaymentForm, creditMinor, getClientBalance, listClientCharges, listClientPayments, owedMinor, type ChargeStatus, type ChargeView } from "@/modules/payments";

import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../_lib/context";
import { recordPaymentAction, sellPackageAction, voidChargeAction, voidPaymentAction } from "../../billing-actions";
import type { Formats } from "@/shared/i18n/formats";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

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

const fmtWith = (formats: Formats) => (amountMinor: number, currency = "PLN") => formats.money(money(amountMinor, currency));

async function PackageCard({ clientId, pkg }: { clientId: string; pkg: ClientPackage }) {
  const formats = await getFormats();
  const tr = await getTranslations();
  const used = Math.max(pkg.sessionsTotal - pkg.balance, 0);
  const percent = Math.min(Math.round((Math.max(pkg.balance, 0) / pkg.sessionsTotal) * 100), 100);
  const low = pkg.status === "active" && isLowBalance(pkg.balance);

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{pkg.name}</span>
        <span className="flex flex-wrap gap-2">
          {low ? <Badge tone="warning">{tr("common.konczy_sie")}</Badge> : null}
          <Badge tone={PACKAGE_TONE[pkg.status]}>{tr(`labels.packageStatus.${pkg.status}`)}</Badge>
        </span>
      </div>
      <p className="mt-2 text-sm">
        {tr.rich("trainer.clientsBillingSection.package_balance", { strong: (chunks) => <strong>{chunks}</strong>, balance: pkg.balance, total: pkg.sessionsTotal, used })}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pkg.balance}
        aria-valuemin={0}
        aria-valuemax={pkg.sessionsTotal}
        aria-label={tr("common.pozostale_zajecia")}
      >
        <div className={`h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{pkg.validUntil ? tr("common.wazny_do_formatisodate", { formatIsoDate: formats.calendarDate(pkg.validUntil) }) : tr("common.bez_terminu_waznosci")}</span>
        <Link href={`/app/clients/${clientId}/packages/${pkg.id}`} className="underline">
          {tr("trainer.clientsBillingSection.historia_i_korekta")}
        </Link>
      </div>
    </li>
  );
}

async function ChargeRow({ clientId, charge, canWrite }: { clientId: string; charge: ChargeView; canWrite: boolean }) {
  const formats = await getFormats();
  const fmt = fmtWith(formats);
  const tr = await getTranslations();
  const canVoid = canWrite && charge.status !== "void" && charge.allocatedMinor === 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{charge.description || tr("common.naleznosc")}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {tr("common.charge_due", {
            date: formats.calendarDate(charge.dueDate),
            amount: fmt(charge.amountMinor, charge.currency),
            remaining: charge.status === "partial" || charge.status === "overdue" ? fmt(charge.remainingMinor, charge.currency) : "none",
          })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={CHARGE_TONE[charge.status]}>{tr(`labels.chargeStatus.${charge.status}`)}</Badge>
        {canVoid ? (
          <form action={voidChargeAction.bind(null, clientId, charge.id)}>
            <ConfirmSubmit
              variant="secondary"
              title={tr("trainer.clientsBillingSection.anulowac_naleznosc")}
              description={tr("trainer.clientsBillingSection.naleznosc_zniknie_z_salda_klienta_mozna")}
              confirmLabel={tr("trainer.clientsBillingSection.anuluj_naleznosc")}
              pendingLabel={tr("common.anulowanie")}
            >
              {tr("common.anuluj")}
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
  const tr = await getTranslations();
  const ctx = await requireContext();
  const formats = await getFormats();
  const fmt = fmtWith(formats);
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
      label: tr("trainer.clientsBillingSection.open_charge_label", {
        description: c.description || tr("common.naleznosc"),
        remaining: fmt(c.remainingMinor, c.currency),
        date: formats.calendarDate(c.dueDate),
      }),
    }));

  return (
    <>
      {canSeePackages ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{tr("common.pakiety")}</h2>
          {packageList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{tr("trainer.clientsBillingSection.ten_klient_nie_ma_jeszcze_pakietu_zajec")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {packageList.map((pkg) => (
                <PackageCard key={pkg.id} clientId={clientId} pkg={pkg} />
              ))}
            </ul>
          )}
          {canWritePackages ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">{tr("common.sprzedaj_pakiet")}</summary>
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
          <h2 className="mb-3 text-lg font-semibold">{tr("common.platnosci")}</h2>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p>
              {tr("trainer.clientsBillingSection.do_zaplaty")}{" "}
              <strong className={owed > 0 ? "text-red-600" : ""}>{fmt(owed, chargeList[0]?.currency)}</strong>
            </p>
            {credit > 0 ? (
              <p>
                {tr.rich("trainer.clientsBillingSection.credit", {
                  strong: (chunks) => <strong className="text-emerald-600">{chunks}</strong>,
                  amount: fmt(credit, chargeList[0]?.currency),
                })}
              </p>
            ) : null}
          </div>

          {chargeList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{tr("common.brak_naleznosci")}</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {chargeList.map((charge) => (
                <ChargeRow key={charge.id} clientId={clientId} charge={charge} canWrite={canWritePayments} />
              ))}
            </ul>
          )}

          {canWritePayments ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">{tr("common.zaksieguj_wplate")}</summary>
              <div className="mt-4">
                <RecordPaymentForm action={recordPaymentAction.bind(null, clientId)} openCharges={openCharges} />
              </div>
            </details>
          ) : null}

          {paymentList.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 font-medium">{tr("common.historia_wplat")}</h3>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {paymentList.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      {formats.date(payment.paidAt)} · {tr(`labels.paymentMethod.${payment.method}`)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      <strong className={payment.voidedAt ? "text-zinc-400 line-through" : undefined}>
                        {fmt(payment.amountMinor, payment.currency)}
                      </strong>
                      {payment.voidedAt ? (
                        <Badge tone="warning">{tr("trainer.clientsBillingSection.anulowana")}</Badge>
                      ) : canWritePayments ? (
                        <form action={voidPaymentAction.bind(null, clientId, payment.id)}>
                          <ConfirmSubmit
                            variant="secondary"
                            title={tr("trainer.clientsBillingSection.anulowac_wplate")}
                            description={tr("trainer.clientsBillingSection.wplata_fmt_zostanie_anulowana_storno", { fmt: fmt(payment.amountMinor, payment.currency) })}
                            confirmLabel={tr("trainer.clientsBillingSection.anuluj_wplate")}
                            pendingLabel={tr("common.anulowanie")}
                          >
                            {tr("trainer.clientsBillingSection.anuluj_wplate")}
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
