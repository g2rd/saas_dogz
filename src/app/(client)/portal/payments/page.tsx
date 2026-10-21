import { Suspense } from "react";
import { listPortalPayments } from "@/modules/portal";
import { type ChargeStatus } from "@/modules/payments";

import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requirePortalContext } from "../../_lib/context";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

const TONE: Record<ChargeStatus, "success" | "neutral" | "warning" | "danger"> = {
  paid: "success",
  unpaid: "neutral",
  partial: "warning",
  overdue: "danger",
  void: "neutral",
};

export default function PortalPaymentsPage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t("common.platnosci")}</h1>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <Payments />
      </Suspense>
    </>
  );
}

async function Payments() {
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const formats = await getFormats();
  const result = await listPortalPayments(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { charges, payments, owedMinor, creditMinor, currency } = result.value;
  const fmt = (amount: number, cur = currency) => formats.money(money(amount, cur));

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("portal.paymentsPage.do_zaplaty")}</p>
        <p className={`text-4xl font-semibold tabular-nums ${owedMinor > 0 ? "" : "text-emerald-600"}`}>{fmt(owedMinor)}</p>
        {creditMinor > 0 ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{t("portal.paymentsPage.nadplata_na_koncie_fmt", { fmt: fmt(creditMinor) })}</p>
        ) : null}
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t("portal.paymentsPage.wplate_ksieguje_trener_po_jej_otrzymaniu")}
        </p>
      </div>

      <section aria-labelledby="charges-heading">
        <h2 id="charges-heading" className="mb-3 text-lg font-semibold">
          {t("portal.paymentsPage.naleznosci")}
        </h2>
        {charges.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("common.brak_naleznosci")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{charge.description || t("common.naleznosc")}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t("common.charge_due", {
                      date: formats.calendarDate(charge.dueDate),
                      amount: fmt(charge.amountMinor, charge.currency),
                      remaining: charge.status === "partial" || charge.status === "overdue" ? fmt(charge.remainingMinor, charge.currency) : "none",
                    })}
                  </p>
                </div>
                <Badge tone={TONE[charge.status]}>{t(`labels.chargeStatus.${charge.status}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          {t("common.historia_wplat")}
        </h2>
        {payments.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("portal.paymentsPage.nie_ma_jeszcze_zaksiegowanych_wplat")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <span>
                  {formats.date(payment.paidAt)} · {t(`labels.paymentMethod.${payment.method}`)}
                </span>
                <strong>{fmt(payment.amountMinor, payment.currency)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
