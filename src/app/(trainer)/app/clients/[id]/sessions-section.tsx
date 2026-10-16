import Link from "next/link";
import { hasPermission } from "@/modules/core";
import {
  SESSION_STATUS_LABELS,
  formatSessionRange,
  listClientSessions,
  type Session,
} from "@/modules/scheduling";
import { dateInZone, formatDateHeadingTitle } from "@/shared/time";
import { requireContext } from "../../../_lib/context";

function SessionRow({ session, timezone }: { session: Session; timezone: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span>
        <span className="font-medium">{formatDateHeadingTitle(dateInZone(session.startsAt, timezone))}</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {" "}
          · {formatSessionRange(session, timezone)} · {session.typeName}
          {session.dogName ? ` · ${session.dogName}` : ""}
        </span>
      </span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{SESSION_STATUS_LABELS[session.status]}</span>
    </li>
  );
}

export async function SessionsSection({ clientId }: { clientId: string }) {
  const ctx = await requireContext();
  if (!hasPermission(ctx, "sessions.read")) return null;

  const result = await listClientSessions(ctx, clientId);
  if (!result.ok) return null;
  const { upcoming, recent, timezone } = result.value;
  const canWrite = hasPermission(ctx, "sessions.write");

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Zajęcia</h2>
        {canWrite ? (
          <Link href={`/app/sessions/new?clientId=${clientId}`} className="text-sm underline">
            Zaplanuj zajęcia
          </Link>
        ) : null}
      </div>

      {upcoming.length === 0 && recent.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">Ten klient nie ma jeszcze zajęć.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {upcoming.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Nadchodzące</h3>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {upcoming.map((s) => (
                  <SessionRow key={s.id} session={s} timezone={timezone} />
                ))}
              </ul>
            </div>
          ) : null}
          {recent.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Ostatnio odbyte</h3>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {recent.map((s) => (
                  <SessionRow key={s.id} session={s} timezone={timezone} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
