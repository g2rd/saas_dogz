import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { SubmitButton } from "@/shared/ui/form-fields";
import { InstallPrompt } from "@/shared/ui/pwa";
import { requirePortalContext } from "../../_lib/context";
import { portalLogoutAction } from "../actions";
import { savePortalPreferencesAction, subscribePortalPushAction, unsubscribePortalPushAction } from "../notifications/actions";

export default function PortalMorePage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Więcej</h1>
      <div className="flex flex-col gap-8">
        <InstallPrompt />
        <section aria-labelledby="notif-heading" className="flex flex-col gap-4">
          <h2 id="notif-heading" className="text-lg font-semibold">
            Powiadomienia
          </h2>
          <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
            <NotificationSettings />
          </Suspense>
          <Link href="/portal/notifications" className="text-sm underline">
            Zobacz wszystkie powiadomienia
          </Link>
        </section>
        <form action={portalLogoutAction}>
          <SubmitButton variant="secondary" pendingLabel="Wylogowywanie...">
            Wyloguj
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
