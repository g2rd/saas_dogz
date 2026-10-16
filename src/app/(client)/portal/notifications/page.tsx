import Link from "next/link";
import { Suspense } from "react";
import { NotificationList, listNotifications } from "@/modules/notifications";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requirePortalContext } from "../../_lib/context";
import { markAllPortalReadAction, openPortalNotificationAction } from "./actions";

export default function PortalNotificationsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Powiadomienia</h1>
        <Link href="/portal/notifications/settings" className="text-sm underline">
          Ustawienia
        </Link>
      </div>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const ctx = await requirePortalContext();
  const result = await listNotifications(ctx, 50);
  if (!result.ok) throw new Error(result.error.message);
  const hasUnread = result.value.some((n) => !n.read);

  return (
    <section className="mt-6 flex flex-col gap-4">
      {hasUnread ? (
        <form action={markAllPortalReadAction} className="self-start">
          <SubmitButton variant="secondary" pendingLabel="Zapisywanie...">
            Oznacz wszystkie jako przeczytane
          </SubmitButton>
        </form>
      ) : null}
      <NotificationList items={result.value} openAction={openPortalNotificationAction} />
    </section>
  );
}
