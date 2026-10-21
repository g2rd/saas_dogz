
import { DEFAULT_TIMEZONE, dateInZone, timeInZone } from "@/shared/time";
import type { Notification } from "../domain/notification";
import { useTranslations } from "next-intl";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

type OpenAction = (id: string, link: string | null) => Promise<void>;

/**
 * Lista powiadomień w skrzynce. Kliknięcie oznacza powiadomienie jako przeczytane i przechodzi do jego celu
 * (formularz z akcją serwerową, więc działa bez JavaScriptu).
 */
export async function NotificationList({
  items,
  openAction,
  timezone = DEFAULT_TIMEZONE,
}: {
  items: Notification[];
  openAction: OpenAction;
  timezone?: string;
}) {
  const formats = await getFormats();
  const t = await getTranslations();
  if (items.length === 0) {
    return <p className="text-zinc-600 dark:text-zinc-400">{t("notifications.notificationList.brak_powiadomien_gdy_cos_sie_wydarzy")}</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((item) => (
        <li key={item.id}>
          <form action={openAction.bind(null, item.id, item.link)}>
            <button
              type="submit"
              className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span
                aria-hidden
                className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-blue-600"}`}
              />
              <span className="min-w-0 flex-1">
                <span className={`block ${item.read ? "" : "font-semibold"}`}>
                  {item.read ? null : <span className="sr-only">{t("notifications.notificationList.nieprzeczytane")}{" "}</span>}
                  {item.title}
                </span>
                {item.body ? <span className="block text-sm text-zinc-600 dark:text-zinc-400">{item.body}</span> : null}
                <span className="mt-1 block text-xs text-zinc-500">
                  {formats.calendarDate(dateInZone(item.createdAt, timezone))}, {timeInZone(item.createdAt, timezone)}
                </span>
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** Dzwonek z licznikiem nieprzeczytanych; liczba jest przekazana z zewnątrz, więc komponent jest czysty. */
export function BellBadge({ count }: { count: number }) {
  const t = useTranslations();
  return (
    <span className="relative inline-flex items-center gap-1">
      <span aria-hidden>🔔</span>
      <span className="sr-only">{t("common.powiadomienia")}</span>
      {count > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
          {count > 99 ? "99+" : count}
          <span className="sr-only">{" "}{t("notifications.notificationList.nieprzeczytanych")}</span>
        </span>
      ) : null}
    </span>
  );
}
