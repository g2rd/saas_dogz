import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, listClients } from "@/modules/clients";
import { getOrganization, getRequestContext, hasPermission, resolveLandingPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";
import { listPendingDogs } from "@/modules/dogs";
import { listLowBalancePackages } from "@/modules/packages";
import { listOverdueCharges } from "@/modules/payments";
import { formatSessionRange, getSessionAgenda, getSlotSummary } from "@/modules/scheduling";

import { money } from "@/shared/money";
import { countNewClientRequests } from "@/modules/notifications";
import { Badge } from "@/shared/ui/badge";
import { InstallPrompt } from "@/shared/ui/pwa";
import { createOrganizationAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { getFormats } from "@/shared/i18n/server";

export default function TrainerDashboard() {
  const t = useTranslations();
  return (
    <>
      <h1 className="sr-only text-2xl font-semibold md:not-sr-only">{t("common.panel_trenera")}</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const formats = await getFormats();
  const t = await getTranslations();
  const ctx = await getRequestContext();

  if (!ctx.ok) {
    if (ctx.error.code === "unauthenticated") redirect("/login?expired=1");
    if (ctx.error.code === "org_suspended") redirect("/suspended");
    if (ctx.error.code === "no_organization") {
      // Klient bez organizacji ma panel w /portal; dopiero świeże konto zakłada organizację.
      const db = await createUserClient();
      const landing = await resolveLandingPath(db);
      if (landing !== "/app") redirect(landing);
      return (
        <section className="mt-6 flex flex-col gap-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t("trainer.page.zacznij_od_utworzenia_organizacji_potem")}
          </p>
          <OnboardingForm action={createOrganizationAction} />
        </section>
      );
    }
    throw new Error(ctx.error.message);
  }

  const org = await getOrganization(ctx.value);
  const c = ctx.value;

  const [low, overdue, clients, agenda, pendingDogs, newRequests, slotSummary] = await Promise.all([
    hasPermission(c, "packages.read") ? listLowBalancePackages(c) : null,
    hasPermission(c, "payments.read") ? listOverdueCharges(c) : null,
    listClients(c),
    hasPermission(c, "sessions.read") ? getSessionAgenda(c, { upcomingDays: 0 }) : null,
    hasPermission(c, "dogs.write") ? listPendingDogs(c) : null,
    countNewClientRequests(c),
    hasPermission(c, "sessions.read") ? getSlotSummary(c) : null,
  ]);
  const slots = slotSummary?.ok ? slotSummary.value : null;
  const requestCount = newRequests.ok ? newRequests.value : 0;
  const pendingDogList = pendingDogs?.ok ? pendingDogs.value : [];
  const todayAgenda = agenda?.ok ? agenda.value : null;
  const names = new Map((clients.ok ? clients.value : []).map((cl) => [cl.id, clientFullName(cl)]));
  const lowList = low?.ok ? low.value : [];
  const overdueList = overdue?.ok ? overdue.value : [];
  const nameOf = (clientId: string) => names.get(clientId) ?? t("trainer.page.client_fallback");

  return (
    <section className="mt-6 flex flex-col gap-6">
      <p className="text-zinc-600 dark:text-zinc-400">
        {t.rich("trainer.page.organization", { name: org.ok ? org.value.name : "—", strong: (chunks) => <strong>{chunks}</strong> })}
      </p>

      <div className="hidden flex-wrap gap-3 md:flex">
        <Link
          href="/app/sessions"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          {t("common.zajecia")}
        </Link>
        <Link
          href="/app/clients"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          {t("trainer.page.klienci_i_psy")}
        </Link>
        <Link
          href="/app/packages"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          {t("common.szablony_pakietow")}
        </Link>
      </div>

      {requestCount > 0 ? (
        <Link
          href="/app/requests"
          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <span className="font-medium">
            {requestCount === 1 ? t("trainer.page.1_nowa_prosba_klienta") : t("trainer.page.nowe_prosby_klientow_requestcount", { requestCount })}
          </span>
          <Badge tone="warning">{t("common.zobacz")}</Badge>
        </Link>
      ) : null}

      {slots && (slots.waitlist > 0 || slots.openOffers > 0) ? (
        <Link
          href="/app/sessions"
          data-testid="slots-tile"
          className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
            slots.pendingClaims > 0
              ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <span>
            <span className="block font-medium">{t("trainer.page.slots_waitlist", { count: slots.waitlist })}</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">
              {slots.openOffers === 0
                ? t("trainer.page.slots_no_offers")
                : t("trainer.page.slots_offers", { offers: slots.openOffers, claims: slots.pendingClaims })}
            </span>
          </span>
          <Badge tone={slots.pendingClaims > 0 ? "warning" : "neutral"}>{t(slots.pendingClaims > 0 ? "trainer.page.slots_choose" : "common.zobacz")}</Badge>
        </Link>
      ) : null}

      <div className="order-last">
        <InstallPrompt />
      </div>

      {pendingDogList.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t("trainer.page.psy_do_zatwierdzenia")}</h2>
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
                  <Badge tone="warning">{t("trainer.page.czeka_na_zatwierdzenie")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {todayAgenda ? (
        <div className="order-first">
          <h2 className="mb-2 text-lg font-semibold">{t("trainer.page.dzis")}</h2>
          {todayAgenda.todaySessions.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t("common.na_dzis_nie_ma_zaplanowanych_zajec")}</p>
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
                        · {session.clientName || t("common.bez_klienta")} · {session.typeName}
                      </span>
                    </span>
                    <Badge tone={session.status === "completed" ? "success" : session.status === "canceled" ? "warning" : "neutral"}>
                      {t(`labels.sessionStatus.${session.status}`)}
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
          <h2 className="mb-2 text-lg font-semibold">{t("trainer.page.konczace_sie_pakiety")}</h2>
          {lowList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.page.zaden_pakiet_sie_nie_konczy")}</p>
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
                    <Badge tone="warning">{t("trainer.page.zostalo_balance", { balance: pkg.balance })}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {overdue ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t("trainer.page.platnosci_po_terminie")}</h2>
          {overdueList.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.page.brak_zaleglosci")}</p>
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
                        · {t("trainer.page.overdue_line", { label: charge.description || t("common.naleznosc"), date: formats.calendarDate(charge.dueDate) })}
                      </span>
                    </span>
                    <Badge tone="danger">{formats.money(money(charge.remainingMinor, charge.currency))}</Badge>
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
