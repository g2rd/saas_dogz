import Link from "next/link";
import { Suspense } from "react";
import { PreferencesForm, PushToggle, getNotificationPreferences } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { requireContext } from "../../../_lib/context";
import { savePreferencesAction, subscribePushAction, unsubscribePushAction } from "../actions";

export default function NotificationSettingsPage() {
  return (
    <>
      <Link href="/app/notifications" className="text-sm underline">
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Urządzenia z włączonym push: {result.value.pushDevices}.</p>
    </section>
  );
}
