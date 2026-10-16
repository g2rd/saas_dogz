import { Suspense } from "react";
import { listPortalPayments } from "@/modules/portal";
import { CHARGE_STATUS_LABELS, PAYMENT_METHOD_LABELS, type ChargeStatus } from "@/modules/payments";
import { formatIsoDate } from "@/shared/dates";
import { formatMoney, money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requirePortalContext } from "../../_lib/context";

const TONE: Record<ChargeStatus, "success" | "neutral" | "warning" | "danger"> = {
  paid: "success",
  unpaid: "neutral",
  partial: "warning",
  overdue: "danger",
  void: "neutral",
};

export default function PortalPaymentsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Płatności</h1>
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <Payments />
      </Suspense>
    </>
  );
}

async function Payments() {
  const ctx = await requirePortalContext();
  const result = await listPortalPayments(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { charges, payments, owedMinor, creditMinor, currency } = result.value;
  const fmt = (amount: number, cur = currency) => formatMoney(money(amount, cur));

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Do zapłaty</p>
        <p className={`text-4xl font-semibold tabular-nums ${owedMinor > 0 ? "" : "text-emerald-600"}`}>{fmt(owedMinor)}</p>
        {creditMinor > 0 ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Nadpłata na koncie: {fmt(creditMinor)}</p>
        ) : null}
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Wpłatę księguje trener po jej otrzymaniu (gotówka, przelew lub BLIK), więc saldo zmienia się chwilę po płatności.
        </p>
      </div>

      <section aria-labelledby="charges-heading">
        <h2 id="charges-heading" className="mb-3 text-lg font-semibold">
          Należności
        </h2>
        {charges.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Brak należności.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{charge.description || "Należność"}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Termin {formatIsoDate(charge.dueDate)} · {fmt(charge.amountMinor, charge.currency)}
                    {charge.status === "partial" || charge.status === "overdue"
                      ? ` · zostało ${fmt(charge.remainingMinor, charge.currency)}`
                      : ""}
                  </p>
                </div>
                <Badge tone={TONE[charge.status]}>{CHARGE_STATUS_LABELS[charge.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          Historia wpłat
        </h2>
        {payments.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nie ma jeszcze zaksięgowanych wpłat.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <span>
                  {payment.paidAt.toLocaleDateString("pl-PL")} · {PAYMENT_METHOD_LABELS[payment.method]}
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
