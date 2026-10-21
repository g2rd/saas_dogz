import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { requirePortalContext } from "../../../_lib/context";
import { savePortalPreferencesAction, subscribePortalPushAction, unsubscribePortalPushAction } from "../actions";
import { useTranslations } from "next-intl";

export default function PortalNotificationSettingsPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/portal/notifications" className="text-sm underline">
        {t("common.powiadomienia_2")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("common.ustawienia_powiadomien")}</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const ctx = await requirePortalContext();
  const result = await getNotificationPreferences(ctx);
  if (!result.ok) throw new Error(result.error.message);

  return (
    <section className="mt-6 flex flex-col gap-6">
      <PreferencesForm action={savePortalPreferencesAction} preferences={result.value.preferences} />
      <PushToggle
        vapidPublicKey={notificationEnv().vapidPublicKey}
        subscribeAction={subscribePortalPushAction}
        unsubscribeAction={unsubscribePortalPushAction}
      />
    </section>
  );
}
