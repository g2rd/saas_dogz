import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { SubmitButton } from "@/shared/ui/form-fields";
import { LanguageSection } from "@/shared/ui/language-section";
import { InstallPrompt } from "@/shared/ui/pwa";
import { requirePortalContext } from "../../_lib/context";
import { portalLogoutAction } from "../actions";
import { savePortalPreferencesAction, subscribePortalPushAction, unsubscribePortalPushAction } from "../notifications/actions";
import { useTranslations } from "next-intl";

export default function PortalMorePage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t("common.wiecej")}</h1>
      <div className="flex flex-col gap-8">
        <InstallPrompt />
        <section aria-labelledby="notif-heading" className="flex flex-col gap-4">
          <h2 id="notif-heading" className="text-lg font-semibold">
            {t("common.powiadomienia")}
          </h2>
          <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
            <NotificationSettings />
          </Suspense>
          <Link href="/portal/notifications" className="text-sm underline">
            {t("portal.morePage.zobacz_wszystkie_powiadomienia")}
          </Link>
        </section>
        <Link href="/portal/feedback" className="flex min-h-14 items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="font-medium">{t("report.link")}</span>
          <span aria-hidden className="text-zinc-400">
            ›
          </span>
        </Link>
        <Suspense fallback={null}>
          <LanguageSection />
        </Suspense>
        <form action={portalLogoutAction}>
          <SubmitButton variant="secondary" pendingLabel={t("common.wylogowywanie")}>
            {t("common.wyloguj")}
          </SubmitButton>
        </form>
      </div>
    </>
  );
}

/** Włączanie i wyłączanie push na tym urządzeniu oraz wybór kanałów (push, e-mail) bezpośrednio w menu „Więcej”. */
async function NotificationSettings() {
  const ctx = await requirePortalContext();
  const result = await getNotificationPreferences(ctx);
  if (!result.ok) throw new Error(result.error.message);

  return (
    <div className="flex flex-col gap-4">
      <PushToggle
        vapidPublicKey={notificationEnv().vapidPublicKey}
        subscribeAction={subscribePortalPushAction}
        unsubscribeAction={unsubscribePortalPushAction}
      />
      <PreferencesForm action={savePortalPreferencesAction} preferences={result.value.preferences} />
    </div>
  );
}
