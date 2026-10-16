import Link from "next/link";
import { Suspense } from "react";
import { RequestButtons, listMyOpenRequests, sessionsWord } from "@/modules/notifications";
import { getPortalOverview, type PortalPackage, type PortalSession } from "@/modules/portal";
import { formatIsoDate } from "@/shared/dates";
import { InstallPrompt } from "@/shared/ui/pwa";
import { formatMoney, money } from "@/shared/money";
import { dateInZone, formatDateHeadingTitle, timeInZone } from "@/shared/time";
import { Badge } from "@/shared/ui/badge";
import { requirePortalContext } from "../_lib/context";
import { respondAction } from "./notifications/actions";
import { PushPrompt } from "./push-prompt";
import { SlotsSection } from "./slots-section";

export default function PortalHome() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Overview />
    </Suspense>
  );
}

function PackageCard({ pkg }: { pkg: PortalPackage }) {
  const percent = Math.min(Math.round((Math.max(pkg.balance, 0) / pkg.sessionsTotal) * 100), 100);
  return (
    <li className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{pkg.name}</p>
        {pkg.low ? <Badge tone="warning">Kończy się</Badge> : null}
        {pkg.status === "depleted" ? <Badge>Wykorzystany</Badge> : null}
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tabular-nums">{pkg.balance}</span>
        <span className="text-zinc-600 dark:text-zinc-400">z {pkg.sessionsTotal} zajęć zostało</span>
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pkg.balance}
        aria-valuemin={0}
        aria-valuemax={pkg.sessionsTotal}
        aria-label="Pozostałe zajęcia"
      >
        <div className={`h-full ${pkg.low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {pkg.validUntil ? `Ważny do ${formatIsoDate(pkg.validUntil)}` : "Bez terminu ważności"}
      </p>
    </li>
  );
}

function SessionRow({ session, timezone }: { session: PortalSession; timezone: string }) {
  return (
    <li className="px-4 py-3">
      <p className="font-medium">
        {formatDateHeadingTitle(dateInZone(session.startsAt, timezone))}, {timeInZone(session.startsAt, timezone)}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {[session.typeName, session.dogName, session.location].filter(Boolean).join(" · ")}
      </p>
    </li>
  );
}

async function Overview() {
  const ctx = await requirePortalContext();
  const result = await getPortalOverview(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const overview = result.value;
  const charge = overview.nextCharge;
  const openRequests = await listMyOpenRequests(ctx);
  const sentFor = (match: (r: { packageId: string | null; chargeId: string | null }) => boolean) =>
    (openRequests.ok ? openRequests.value : []).filter(match).map((r) => r.kind);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Cześć, {overview.clientFirstName}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{overview.organizationName}</p>
      </div>

      <InstallPrompt />

      <Suspense fallback={null}>
        <PushPrompt />
      </Suspense>

      <Suspense fallback={null}>
        <SlotsSection compact />
      </Suspense>

      {overview.lowBalance.map((pkg) => (
        <div
          key={pkg.id}
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          <p className="font-medium">
            {pkg.balance <= 0
              ? "Twój pakiet się skończył."
              : pkg.balance === 1
                ? "Zostało Ci ostatnie zajęcie."
                : `Zostały Ci ${pkg.balance} ${sessionsWord(pkg.balance)}.`}
          </p>
          <p className="mt-1">Pakiet „{pkg.name}”. Co robisz dalej? Trener dostanie Twoją odpowiedź.</p>
          <RequestButtons
            action={respondAction}
            kinds={["renew", "pay", "end"]}
            packageId={pkg.id}
            alreadySent={sentFor((r) => r.packageId === pkg.id)}
          />
        </div>
      ))}

      <section aria-labelledby="packages-heading">
        <h2 id="packages-heading" className="mb-3 text-lg font-semibold">
          Twoje zajęcia
        </h2>
        {overview.packages.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nie masz jeszcze pakietu zajęć.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {overview.packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="mb-3 text-lg font-semibold">
          Płatność
        </h2>
        {charge ? (
          <Link
            href="/portal/payments"
            className={`block rounded-2xl border p-5 ${
              charge.status === "overdue"
                ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{charge.description || "Należność"}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatMoney(money(charge.remainingMinor, charge.currency))}
            </p>
            <p className="mt-2 text-sm">
              {charge.status === "overdue" ? (
                <span className="font-medium text-red-700 dark:text-red-400">
                  Po terminie, termin minął {formatIsoDate(charge.dueDate)}
                </span>
              ) : (
                <>Termin płatności: {formatIsoDate(charge.dueDate)}</>
              )}
            </p>
            {overview.owedMinor > charge.remainingMinor ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Łącznie do zapłaty: {formatMoney(money(overview.owedMinor, overview.currency))}
              </p>
            ) : null}
          </Link>
        ) : (
          <p className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">Wszystko opłacone. Dziękujemy!</p>
        )}
        {charge ? (
          <RequestButtons
            action={respondAction}
            kinds={["pay"]}
            chargeId={charge.id}
            alreadySent={sentFor((r) => r.chargeId === charge.id)}
          />
        ) : null}
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Wpłatę księguje trener po jej otrzymaniu, więc saldo zmieni się chwilę po płatności.
        </p>
      </section>

      <section aria-labelledby="sessions-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="sessions-heading" className="text-lg font-semibold">
            Najbliższe zajęcia
          </h2>
          <Link href="/portal/sessions" className="text-sm underline">
            Wszystkie
          </Link>
        </div>
        {overview.upcoming.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Brak zaplanowanych zajęć. Umów się z trenerem.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {overview.upcoming.map((session) => (
              <SessionRow key={session.id} session={session} timezone={overview.timezone} />
            ))}
          </ul>
        )}
      </section>

      {overview.pendingDogs > 0 ? (
        <p className="rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          Psy czekające na zatwierdzenie przez trenera: {overview.pendingDogs}.{" "}
          <Link href="/portal/dogs" className="underline">
            Zobacz
          </Link>
        </p>
      ) : null}
    </div>
  );
}
