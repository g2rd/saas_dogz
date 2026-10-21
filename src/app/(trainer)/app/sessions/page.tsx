import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { SlotOfferPanel, getSessionAgenda, listOpenSlotOffers, listSessionTypes, type Session } from "@/modules/scheduling";
import { dateInZone } from "@/shared/time";
import { requireContext } from "../../_lib/context";
import { SessionCard } from "./session-card";
import { acceptSlotClaimAction, closeSlotOfferAction } from "./slot-actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

export default function SessionsPage() {
  const t = useTranslations();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("common.zajecia")}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/sessions/new"
            className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
          >
            {t("common.zaplanuj_zajecia")}
          </Link>
          <Link
            href="/app/sessions/types"
            className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-5 font-medium dark:border-zinc-700"
          >
            {t("common.rodzaje_zajec")}
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Agenda />
      </Suspense>
    </>
  );
}

async function Agenda() {
  const formats = await getFormats();
  const t = await getTranslations();
  const ctx = await requireContext();
  const [agendaResult, typesResult, offersResult] = await Promise.all([
    getSessionAgenda(ctx),
    listSessionTypes(ctx),
    listOpenSlotOffers(ctx),
  ]);
  if (!agendaResult.ok) throw new Error(agendaResult.error.message);
  const agenda = agendaResult.value;
  const types = typesResult.ok ? typesResult.value : [];
  const offers = offersResult.ok ? offersResult.value : [];
  const offeredSessionIds = new Set(offers.map((o) => o.sessionId));

  const canWrite = hasPermission(ctx, "sessions.write");
  const canCharge = hasPermission(ctx, "payments.write");
  const now = ctx.clock.now();

  const trainerIds = new Set([...agenda.todaySessions, ...agenda.upcoming].map((s) => s.trainerId));
  const showTrainer = trainerIds.size > 1;

  const byDate = new Map<string, Session[]>();
  for (const session of agenda.upcoming) {
    const date = dateInZone(session.startsAt, agenda.timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), session]);
  }

  const card = (session: Session) => (
    <SessionCard
      key={session.id}
      session={session}
      timezone={agenda.timezone}
      policy={agenda.cancellationPolicy}
      now={now}
      canCharge={canCharge}
      canWrite={canWrite}
      showTrainer={showTrainer}
      hasOpenOffer={offeredSessionIds.has(session.id)}
    />
  );

  return (
    <div className="mt-6 flex flex-col gap-8">
      {types.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          {t("trainer.sessionsPage.zanim_zaplanujesz_zajecia_dodaj_rodzaj")}{" "}
          <Link href="/app/sessions/types" className="underline">
            {t("common.rodzaje_zajec")}
          </Link>
          .
        </p>
      ) : null}

      <SlotOfferPanel
        offers={offers}
        timezone={agenda.timezone}
        acceptAction={acceptSlotClaimAction}
        closeAction={closeSlotOfferAction}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t.rich("trainer.sessionsPage.today_heading", {
            muted: (chunks) => <span className="font-normal text-zinc-600 dark:text-zinc-400">{chunks}</span>,
            date: formats.dayHeading(agenda.today),
          })}
        </h2>
        {agenda.todaySessions.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("common.na_dzis_nie_ma_zaplanowanych_zajec")}</p>
        ) : (
          <ul className="flex flex-col gap-3">{agenda.todaySessions.map(card)}</ul>
        )}
      </section>

      {agenda.canceledUpcoming.length > 0 ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold">{t("trainer.sessionsPage.odwolane_terminy")}</h2>
          <p className="mb-3 text-sm text-zinc-600">{t("trainer.sessionsPage.zwolnione_miejsce_mozesz_oglosic_klientom")}</p>
          <ul className="flex flex-col gap-3">{agenda.canceledUpcoming.map(card)}</ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("trainer.sessionsPage.najblizsze")}</h2>
        {byDate.size === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.sessionsPage.brak_zaplanowanych_zajec_w_najblizszych")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...byDate.entries()].map(([date, sessions]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  {formats.dayHeadingTitle(date)}
                </h3>
                <ul className="flex flex-col gap-3">{sessions.map(card)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
