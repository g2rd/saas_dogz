import Link from "next/link";
import { getRequestContext, hasPermission } from "@/modules/core";
import { BellBadge, countNewClientRequests, countUnreadNotifications } from "@/modules/notifications";

/** Dzwonek i licznik próśb klientów w nagłówku panelu; bez kontekstu (np. przed kreatorem) nic nie pokazuje. */
export async function HeaderBadges() {
  const ctx = await getRequestContext();
  if (!ctx.ok) return null;
  const [unread, requests] = await Promise.all([countUnreadNotifications(ctx.value), countNewClientRequests(ctx.value)]);

  return (
    <>
      {hasPermission(ctx.value, "members.read") ? <Link href="/app/team">Zespół</Link> : null}
      <Link href="/app/requests">
        Prośby
        {requests.ok && requests.value > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
            {requests.value}
            <span className="sr-only"> nowych</span>
          </span>
        ) : null}
      </Link>
      <Link href="/app/notifications">
        <BellBadge count={unread.ok ? unread.value : 0} />
      </Link>
    </>
  );
}
