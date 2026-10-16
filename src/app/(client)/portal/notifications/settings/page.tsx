import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { requirePortalContext } from "../../../_lib/context";
import { savePortalPreferencesAction, subscribePortalPushAction, unsubscribePortalPushAction } from "../actions";

export default function PortalNotificationSettingsPage() {
  return (
    <>
      <Link href="/portal/notifications" className="text-sm underline">
        ← Powiadomienia
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Ustawienia powiadomień</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
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
