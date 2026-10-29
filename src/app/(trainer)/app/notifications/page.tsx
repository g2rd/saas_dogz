import Link from "next/link";
import { Suspense } from "react";
import { getOrganizationSettings } from "@/modules/core";
import { NotificationList, listNotifications } from "@/modules/notifications";
import { BackLink } from "@/shared/ui/back-link";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../_lib/context";
import { markAllReadAction, openNotificationAction } from "./actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function NotificationsPage() {
  const t = useTranslations();
  return (
    <>
      <BackLink href="/app/more">{t("common.back_to_more")}</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("common.powiadomienia")}</h1>
        <Link href="/app/notifications/settings" className="text-sm underline">
          {t("common.ustawienia_powiadomien")}
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
  const ctx = await requireContext();
  const [result, settings] = await Promise.all([listNotifications(ctx, 50), getOrganizationSettings(ctx)]);
  if (!result.ok) throw new Error(result.error.message);
  const hasUnread = result.value.some((n) => !n.read);

  return (
    <section className="mt-6 flex flex-col gap-4">
      {hasUnread ? (
        <form action={markAllReadAction} className="self-start">
          <SubmitButton variant="secondary" pendingLabel={t("common.zapisywanie")}>
            {t("common.oznacz_wszystkie_jako_przeczytane")}
          </SubmitButton>
        </form>
      ) : null}
      <NotificationList
        items={result.value}
        openAction={openNotificationAction}
        timezone={settings.ok ? settings.value.timezone : undefined}
      />
    </section>
  );
}
