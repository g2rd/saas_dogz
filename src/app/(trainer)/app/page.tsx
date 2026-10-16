import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, listClients } from "@/modules/clients";
import { getOrganization, getRequestContext, hasPermission, resolveLandingPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";
import { listPendingDogs } from "@/modules/dogs";
import { listLowBalancePackages } from "@/modules/packages";
import { listOverdueCharges } from "@/modules/payments";
import { SESSION_STATUS_LABELS, formatSessionRange, getSessionAgenda } from "@/modules/scheduling";
import { formatIsoDate } from "@/shared/dates";
import { formatMoney, money } from "@/shared/money";
import { countNewClientRequests } from "@/modules/notifications";
import { Badge } from "@/shared/ui/badge";
import { InstallPrompt } from "@/shared/ui/pwa";
import { createOrganizationAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export default function TrainerDashboard() {
  return (
    <>
      <h1 className="sr-only text-2xl font-semibold md:not-sr-only">Panel trenera</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const ctx = await getRequestContext();

  if (!ctx.ok) {
    if (ctx.error.code === "unauthenticated") redirect("/login");
    if (ctx.error.code === "no_organization") {
      // Klient bez organizacji ma panel w /portal; dopiero świeże konto zakłada organizację.
      const db = await createUserClient();
      if ((await resolveLandingPath(db)) === "/portal") redirect("/portal");
      return (
        <section className="mt-6 flex flex-col gap-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            Zacznij od utworzenia organizacji. Potem dodasz klientów i ich psy.
          </p>
          <OnboardingForm action={createOrganizationAction} />
        </section>
      );
    }
    throw new Error(ctx.error.message);
  }

  const org = await getOrganization(ctx.value);
  const c = ctx.value;

  const [low, overdue, clients, agenda, pendingDogs, newRequests] = await Promise.all([
    hasPermission(c, "packages.read") ? listLowBalancePackages(c) : null,
    hasPermission(c, "payments.read") ? listOverdueCharges(c) : null,
    listClients(c),
    hasPermission(c, "sessions.read") ? getSessionAgenda(c, { upcomingDays: 0 }) : null,
    hasPermission(c, "dogs.write") ? listPendingDogs(c) : null,
    countNewClientRequests(c),
  ]);
  const requestCount = newRequests.ok ? newRequests.value : 0;
  const pendingDogList = pendingDogs?.ok ? pendingDogs.value : [];
  const todayAgenda = agenda?.ok ? agenda.value : null;
  const names = new Map((clients.ok ? clients.value : []).map((cl) => [cl.id, clientFullName(cl)]));
  const lowList = low?.ok ? low.value : [];
  const overdueList = overdue?.ok ? overdue.value : [];
  const nameOf = (clientId: string) => names.get(clientId) ?? "Klient";

  return (
    <section className="mt-6 flex flex-col gap-6">
      <p className="text-zinc-600 dark:text-zinc-400">
        Organizacja: <strong>{org.ok ? org.value.name : "—"}</strong>
      </p>

      <div className="hidden flex-wrap gap-3 md:flex">
        <Link
          href="/app/sessions"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          Zajęcia
        </Link>
        <Link
          href="/app/clients"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          Klienci i psy
        </Link>
        <Link
          href="/app/packages"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          Szablony pakietów
        </Link>
      </div>

      {requestCount > 0 ? (
        <Link
          href="/app/requests"
          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <span className="font-medium">
            {requestCount === 1 ? "1 nowa prośba klienta" : `Nowe prośby klientów: ${requestCount}`}
          </span>
          <Badge tone="warning">Zobacz</Badge>
        </Link>
      ) : null}

      <div className="order-last">
        <InstallPrompt />
      </div>

      {pendingDogList.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Psy do zatwierdzenia</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {pendingDogList.map((dog) => (
              <li key={dog.id}>
                <Link
                  href={`/app/clients/${dog.clientId}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span>
                    <span className="font-medium">{dog.name}</span>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400"> · {nameOf(dog.clientId)}</span>
                  </span>
                  <Badge tone="warning">Czeka na zatwierdzenie</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {todayAgenda ? (
        <div className="order-first">
          <h2 className="mb-2 text-lg font-semibold">Dziś</h2>
          {todayAgenda.todaySessions.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Na dziś nie ma zaplanowanych zajęć.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {todayAgenda.todaySessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href="/app/sessions"
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span>
                      <span className="font-medium tabular-nums">{formatSessionRange(session, todayAgenda.timezone)}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {" "}
                        · {session.clientName || "Bez klienta"} · {session.typeName}
                      </span>
                    </span>
                    <Badge tone={session.status === "completed" ? "success" : session.status === "canceled" ? "warning" : "neutral"}>
                      {SESSION_STATUS_LABELS[session.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {low ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Kończące się pakiety</h2>
          {lowList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Żaden pakiet się nie kończy.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {lowList.map((pkg) => (
                <li key={pkg.id}>
                  <Link
                    href={`/app/clients/${pkg.clientId}/packages/${pkg.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span>
                      <span className="font-medium">{nameOf(pkg.clientId)}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400"> · {pkg.name}</span>
                    </span>
                    <Badge tone="warning">zostało {pkg.balance}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {overdue ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Płatności po terminie</h2>
          {overdueList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Brak zaległości.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {overdueList.map((charge) => (
                <li key={charge.id}>
                  <Link
                    href={`/app/clients/${charge.clientId}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span>
                      <span className="font-medium">{nameOf(charge.clientId)}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {" "}
                        · {charge.description || "Należność"}, termin {formatIsoDate(charge.dueDate)}
                      </span>
                    </span>
                    <Badge tone="danger">{formatMoney(money(charge.remainingMinor, charge.currency))}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
