import { Suspense } from "react";
import { RequestButtons, listMyOpenRequests } from "@/modules/notifications";
import { listPortalSessions, type PortalSession } from "@/modules/portal";
import { dateInZone, timeInZone } from "@/shared/time";
import { requirePortalContext } from "../../_lib/context";
import { respondAction } from "../notifications/actions";
import { SlotsSection } from "../slots-section";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

export default function PortalSessionsPage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t("common.zajecia")}</h1>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <Sessions />
      </Suspense>
    </>
  );
}

async function Row({
  session,
  timezone,
  cancelable = false,
  cancelRequested = false,
}: {
  session: PortalSession;
  timezone: string;
  cancelable?: boolean;
  cancelRequested?: boolean;
}) {
  const formats = await getFormats();
  return (
    <li className="px-4 py-3">
      <p className="font-medium">{formats.dayHeadingTitle(dateInZone(session.startsAt, timezone))}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {timeInZone(session.startsAt, timezone)}–{timeInZone(session.endsAt, timezone)} ·{" "}
        {[session.typeName, session.dogName, session.location].filter(Boolean).join(" · ")}
      </p>
      {cancelable ? (
        <RequestButtons
          action={respondAction}
          kinds={["cancel"]}
          sessionId={session.id}
          alreadySent={cancelRequested ? ["cancel"] : []}
        />
      ) : null}
    </li>
  );
}

async function Sessions() {
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const result = await listPortalSessions(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const { upcoming, recent, timezone } = result.value;
  const open = await listMyOpenRequests(ctx);
  const cancelRequested = new Set((open.ok ? open.value : []).filter((r) => r.kind === "cancel").map((r) => r.sessionId));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-semibold">
          {t("common.nadchodzace")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("common.brak_zaplanowanych_zajec_umow_sie_z")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {upcoming.map((s) => (
              <Row key={s.id} session={s} timezone={timezone} cancelable cancelRequested={cancelRequested.has(s.id)} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-zinc-600">
          {t("portal.sessionsPage.nie_moge_przyjsc_wysyla_informacje")}
        </p>
      </section>

      <Suspense fallback={null}>
        <SlotsSection />
      </Suspense>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-lg font-semibold">
          {t("common.ostatnio_odbyte")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("portal.sessionsPage.nie_ma_jeszcze_odbytych_zajec")}</p>
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
