import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { requireContext } from "../../../_lib/context";
import { savePreferencesAction, subscribePushAction, unsubscribePushAction } from "../actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function NotificationSettingsPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/notifications" className="text-sm underline">
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
  const t = await getTranslations();
  const ctx = await requireContext();
  const result = await getNotificationPreferences(ctx);
  if (!result.ok) throw new Error(result.error.message);

  return (
    <section className="mt-6 flex max-w-xl flex-col gap-6">
      <PreferencesForm action={savePreferencesAction} preferences={result.value.preferences} />
      <PushToggle
        vapidPublicKey={notificationEnv().vapidPublicKey}
        subscribeAction={subscribePushAction}
        unsubscribeAction={unsubscribePushAction}
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("trainer.notificationsSettingsPage.urzadzenia_z_wlaczonym_push_pushdevices", { pushDevices: result.value.pushDevices })}</p>
    </section>
  );
}
