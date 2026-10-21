import Link from "next/link";
import { Suspense } from "react";
import { NotificationList, listNotifications } from "@/modules/notifications";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requirePortalContext } from "../../_lib/context";
import { markAllPortalReadAction, openPortalNotificationAction } from "./actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function PortalNotificationsPage() {
  const t = useTranslations();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("common.powiadomienia")}</h1>
        <Link href="/portal/notifications/settings" className="text-sm underline">
          {t("portal.notificationsPage.ustawienia")}
        </Link>
      </div>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const result = await listNotifications(ctx, 50);
  if (!result.ok) throw new Error(result.error.message);
  const hasUnread = result.value.some((n) => !n.read);

  return (
    <section className="mt-6 flex flex-col gap-4">
      {hasUnread ? (
        <form action={markAllPortalReadAction} className="self-start">
          <SubmitButton variant="secondary" pendingLabel={t("common.zapisywanie")}>
            {t("common.oznacz_wszystkie_jako_przeczytane")}
          </SubmitButton>
        </form>
      ) : null}
      <NotificationList items={result.value} openAction={openPortalNotificationAction} />
    </section>
  );
}
