import Link from "next/link";
import { BellBadge, countUnreadNotifications } from "@/modules/notifications";
import { getPortalContext } from "@/modules/portal";

/** Dzwonek z licznikiem nieprzeczytanych w nagłówku panelu klienta. */
export async function HeaderBell() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return null;
  const unread = await countUnreadNotifications(ctx.value);
  return (
    <Link href="/portal/notifications" className="inline-flex h-11 items-center px-2 text-sm">
      <BellBadge count={unread.ok ? unread.value : 0} />
    </Link>
  );
}
