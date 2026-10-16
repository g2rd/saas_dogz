import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { getSessionAgenda, listSessionTypes, type Session } from "@/modules/scheduling";
import { dateInZone, formatDateHeading, formatDateHeadingTitle } from "@/shared/time";
import { requireContext } from "../../_lib/context";
import { SessionCard } from "./session-card";

export default function SessionsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Zajęcia</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/sessions/new"
            className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
          >
            Zaplanuj zajęcia
          </Link>
          <Link
            href="/app/sessions/types"
            className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-5 font-medium dark:border-zinc-700"
          >
            Rodzaje zajęć
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Ładowanie...</p>}>
        <Agenda />
      </Suspense>
    </>
  );
}

async function Agenda() {
  const ctx = await requireContext();
  const [agendaResult, typesResult] = await Promise.all([getSessionAgenda(ctx), listSessionTypes(ctx)]);
  if (!agendaResult.ok) throw new Error(agendaResult.error.message);
  const agenda = agendaResult.value;
  const types = typesResult.ok ? typesResult.value : [];

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
    />
  );

  return (
    <div className="mt-6 flex flex-col gap-8">
      {types.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          Zanim zaplanujesz zajęcia, dodaj rodzaj zajęć (np. „Trening indywidualny”) w sekcji{" "}
          <Link href="/app/sessions/types" className="underline">
            Rodzaje zajęć
          </Link>
          .
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Dziś <span className="font-normal text-zinc-600 dark:text-zinc-400">· {formatDateHeading(agenda.today)}</span>
        </h2>
        {agenda.todaySessions.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Na dziś nie ma zaplanowanych zajęć.</p>
        ) : (
          <ul className="flex flex-col gap-3">{agenda.todaySessions.map(card)}</ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Najbliższe</h2>
        {byDate.size === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Brak zaplanowanych zajęć w najbliższych dniach.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...byDate.entries()].map(([date, sessions]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  {formatDateHeadingTitle(date)}
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
