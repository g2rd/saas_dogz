import Link from "next/link";
import { getRequestContext, hasPermission } from "@/modules/core";
import { BellBadge, countNewClientRequests, countUnreadNotifications } from "@/modules/notifications";
import { getTranslations } from "next-intl/server";

/**
 * Elementy po prawej stronie nagłówka: dzwonek z licznikiem zawsze, a „Zespół” i „Prośby” tylko na szerokim ekranie
 * (na telefonie są w dolnej nawigacji i na stronie „Więcej”). Bez kontekstu (np. przed kreatorem) nic nie pokazuje.
 */
export async function HeaderBadges() {
  const t = await getTranslations();
  const ctx = await getRequestContext();
  if (!ctx.ok) return null;
  const [unread, requests] = await Promise.all([countUnreadNotifications(ctx.value), countNewClientRequests(ctx.value)]);

  return (
    <>
      {hasPermission(ctx.value, "members.read") ? (
        <Link href="/app/team" className="hidden md:inline">
          {t("common.zespol")}
        </Link>
      ) : null}
      <Link href="/app/requests" className="hidden md:inline">
        {t("trainer.nav.requests")}
        {requests.ok && requests.value > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
            {requests.value}
            <span className="sr-only">{" "}{t("common.nowych")}</span>
          </span>
        ) : null}
      </Link>
      <Link href="/app/notifications" className="inline-flex h-11 items-center">
        <BellBadge count={unread.ok ? unread.value : 0} />
      </Link>
    </>
  );
}
