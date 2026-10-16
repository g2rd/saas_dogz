import { Suspense } from "react";
import { listPortalSessions, type PortalSession } from "@/modules/portal";
import { dateInZone, formatDateHeadingTitle, timeInZone } from "@/shared/time";
import { requirePortalContext } from "../../_lib/context";

export default function PortalSessionsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Zajęcia</h1>
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <Sessions />
      </Suspense>
    </>
  );
}

function Row({ session, timezone }: { session: PortalSession; timezone: string }) {
  return (
    <li className="px-4 py-3">
      <p className="font-medium">{formatDateHeadingTitle(dateInZone(session.startsAt, timezone))}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {timeInZone(session.startsAt, timezone)}–{timeInZone(session.endsAt, timezone)} ·{" "}
        {[session.typeName, session.dogName, session.location].filter(Boolean).join(" · ")}
      </p>
    </li>
  );
}

async function Sessions() {
  const ctx = await requirePortalContext();
  const result = await listPortalSessions(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { upcoming, recent, timezone } = result.value;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-semibold">
          Nadchodzące
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Brak zaplanowanych zajęć. Umów się z trenerem.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {upcoming.map((s) => (
              <Row key={s.id} session={s} timezone={timezone} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-lg font-semibold">
          Ostatnio odbyte
        </h2>
        {recent.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nie ma jeszcze odbytych zajęć.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {recent.map((s) => (
              <Row key={s.id} session={s} timezone={timezone} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
