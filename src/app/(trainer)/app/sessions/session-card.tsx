import Link from "next/link";
import { AnnounceSlotForm, SessionActions, formatSessionRange, shouldConsumeOnCancel, type CancellationPolicy, type Session, type SessionStatus } from "@/modules/scheduling";
import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { dateInZone } from "@/shared/time";
import { cancelSessionAction, completeSessionAction, restoreSessionAction, undoCompleteSessionAction } from "./actions";
import { announceSlotAction } from "./slot-actions";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

const STATUS_TONE: Record<SessionStatus, "neutral" | "success" | "warning"> = {
  scheduled: "neutral",
  completed: "success",
  canceled: "warning",
};

export async function SessionCard({
  session,
  timezone,
  policy,
  now,
  canCharge,
  canWrite,
  showTrainer,
  hasOpenOffer,
}: {
  session: Session;
  timezone: string;
  policy: CancellationPolicy;
  now: Date;
  canCharge: boolean;
  canWrite: boolean;
  showTrainer: boolean;
  /** Czy dla tych (odwołanych) zajęć jest już otwarte ogłoszenie wolnego terminu. */
  hasOpenOffer: boolean;
}) {
  const formats = await getFormats();
  const t = await getTranslations();
  const details = [session.typeName, session.dogName, session.location, showTrainer ? session.trainerName : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums">{formatSessionRange(session, timezone)}</p>
          <p className="font-medium">
            {session.clientId ? (
              <Link href={`/app/clients/${session.clientId}`} className="underline-offset-2 hover:underline">
                {session.clientName}
              </Link>
            ) : (
              t("common.bez_klienta")
            )}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{details}</p>
        </div>
        <Badge tone={STATUS_TONE[session.status]}>{t(`labels.sessionStatus.${session.status}`)}</Badge>
      </div>

      {session.status === "completed" && session.clientSummary ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("trainer.sessionsSessionCard.podsumowanie_clientsummary", { clientSummary: session.clientSummary })}</p>
      ) : null}

      {canWrite && session.status === "canceled" && session.startsAt > now ? (
        hasOpenOffer ? (
          <p className="mt-3 text-sm text-emerald-700">{t("trainer.sessionsSessionCard.wolny_termin_ogloszony_zgloszenia")}</p>
        ) : (
          <AnnounceSlotForm action={announceSlotAction.bind(null, session.id)} />
        )
      ) : null}

      {canWrite ? (
        <SessionActions
          status={session.status}
          completeAction={completeSessionAction.bind(null, session.id)}
          cancelAction={cancelSessionAction.bind(null, session.id)}
          undoCompleteAction={undoCompleteSessionAction.bind(null, session.id)}
          restoreAction={restoreSessionAction.bind(null, session.id)}
          canUndoComplete={
            session.status === "completed" &&
            session.completedAt !== null &&
            dateInZone(session.completedAt, timezone) === dateInZone(now, timezone)
          }
          canRestore={session.status === "canceled" && session.startsAt > now}
          singlePriceLabel={formats.money(money(session.defaultPriceMinor, session.currency))}
          canCharge={canCharge}
          cancelConsumesByPolicy={shouldConsumeOnCancel(session.startsAt, now, policy)}
          lateCancelHours={policy.lateCancelHours}
        />
      ) : null}
    </li>
  );
}
