import Link from "next/link";
import { Suspense } from "react";
import { getOrganizationSettings, hasPermission } from "@/modules/core";
import { HISTORY_MAX, HISTORY_PAGE, listHistory, parseHistoryLimit, type HistoryEntry } from "@/modules/history";
import type { Formats } from "@/shared/i18n/formats";
import { getFormats } from "@/shared/i18n/server";
import { money } from "@/shared/money";
import { requireContext } from "../../_lib/context";
import { undoHistoryAction } from "./actions";
import { UndoForm } from "./undo-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export default function HistoryPage({ searchParams }: PageProps<"/app/history">) {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/more" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        {t("history.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("history.title")}</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t("history.intro")}</p>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <History searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Opis wpisu w języku widza; nieznany rodzaj zmiany pokazuje swój kod, żeby wpis nigdy nie zniknął. */
function describe(entry: HistoryEntry, t: Translate, formats: Formats, timeZone: string): string {
  const key = `history.action.${entry.action.replace(/\./g, "_")}`;
  if (!t.has(key as never)) return entry.action;
  const { subject } = entry;
  return t(key as never, {
    client: subject.clientName ?? t("history.unknown_client"),
    package: subject.packageName ?? "",
    amount: subject.amountMinor !== null ? formats.money(money(subject.amountMinor, subject.currency ?? "PLN")) : "",
    date: subject.startsAt ? formats.date(subject.startsAt, timeZone) : "",
    time: subject.startsAt ? formats.time(subject.startsAt, timeZone) : "",
  } as never);
}

async function History({ searchParams }: Pick<PageProps<"/app/history">, "searchParams">) {
  const t = await getTranslations();
  const formats = await getFormats();
  const ctx = await requireContext();
  if (!hasPermission(ctx, "audit.read")) notFound();

  const limit = parseHistoryLimit((await searchParams).limit);
  const [history, settings] = await Promise.all([listHistory(ctx, limit), getOrganizationSettings(ctx)]);
  if (!history.ok) throw new Error(history.error.message);
  const timeZone = settings.ok ? settings.value.timezone : "Europe/Warsaw";

  return (
    <div className="mt-6 flex flex-col gap-4">
      {history.value.length === 0 ? <p className="text-zinc-600 dark:text-zinc-400">{t("history.empty")}</p> : null}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {history.value.map((entry) => (
          <li key={entry.id} data-testid="history-entry" className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div>
              <p>{describe(entry, t, formats, timeZone)}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formats.dateTime(entry.createdAt, timeZone)} · {entry.actorName ?? t("history.system")}
              </p>
            </div>
            {entry.undo && entry.entityId ? <UndoForm kind={entry.undo} action={undoHistoryAction.bind(null, entry.undo, entry.entityId)} /> : null}
          </li>
        ))}
      </ul>
      {history.value.length >= limit && limit < HISTORY_MAX ? (
        <Link href={`/app/history?limit=${Math.min(limit + HISTORY_PAGE, HISTORY_MAX)}`} className="text-sm underline">
          {t("history.more")}
        </Link>
      ) : null}
    </div>
  );
}
