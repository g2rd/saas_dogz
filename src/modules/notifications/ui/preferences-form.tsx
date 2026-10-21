"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/shared/form";
import { CheckboxField, FormMessage, SubmitButton } from "@/shared/ui/form-fields";
import { type ChannelPreferences } from "../domain/notification";
import { useTranslations } from "next-intl";
import { Msg } from "@/shared/ui/msg";

type SaveAction = (prev: FormState & { saved?: boolean }, formData: FormData) => Promise<FormState & { saved?: boolean }>;

/** Preferencje kanałów powiadomień. Powiadomienia w aplikacji są zawsze włączone. */
export function PreferencesForm({ action, preferences }: { action: SaveAction; preferences: ChannelPreferences }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("notifications.preferencesForm.powiadomienia_w_aplikacji_dzwonek_sa")}
      </p>
      <CheckboxField name="push" label={t("labels.channel.push")} defaultChecked={preferences.push} />
      <CheckboxField name="email" label={t("labels.channel.email")} defaultChecked={preferences.email} />
      <FormMessage state={state} />
      {state.saved ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {t("notifications.preferencesForm.zapisano")}
        </p>
      ) : null}
      <div>
        <SubmitButton>{t("notifications.preferencesForm.zapisz")}</SubmitButton>
      </div>
    </form>
  );
}

type SubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string };
type SubscribeAction = (subscription: SubscriptionJson) => Promise<{ error?: string }>;
type UnsubscribeAction = (endpoint: string) => Promise<{ error?: string }>;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type PushStatus = "checking" | "needs-install" | "unsupported" | "denied" | "off" | "on";

/**
 * Włączanie web push na tym urządzeniu: rejestruje service worker, prosi o zgodę i zapisuje subskrypcję.
 * Na iPhonie działa dopiero po dodaniu aplikacji do ekranu głównego (iOS 16.4+).
 */
export function PushToggle({
  vapidPublicKey,
  subscribeAction,
  unsubscribeAction,
}: {
  vapidPublicKey: string | null;
  subscribeAction: SubscribeAction;
  unsubscribeAction: UnsubscribeAction;
}) {
  const t = useTranslations();
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (ios && !standalone) {
        if (!cancelled) setStatus("needs-install");
        return;
      }
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setStatus(subscription ? "on" : "off");
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const saved = await subscribeAction({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) });
      if (saved.error) {
        setMessage(saved.error);
        return;
      }
      setStatus("on");
      setMessage(t("notifications.preferencesForm.push_enabled"));
    } catch {
      setMessage(t("notifications.preferencesForm.push_enable_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage(t("notifications.preferencesForm.push_disabled"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="font-medium">{t("notifications.preferencesForm.to_urzadzenie")}</p>
      {status === "needs-install" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t.rich("notifications.preferencesForm.ios_install", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      ) : status === "unsupported" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("notifications.preferencesForm.ta_przegladarka_nie_obsluguje_powiadomien")}
        </p>
      ) : status === "denied" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("notifications.preferencesForm.powiadomienia_sa_zablokowane_w")}
        </p>
      ) : status === "on" ? (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="h-11 self-start rounded-full border border-zinc-300 px-5 font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          {t("notifications.preferencesForm.wylacz_push_na_tym_urzadzeniu")}
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={busy || status === "checking"}
          className="h-11 self-start rounded-full bg-primary hover:bg-primary-hover px-5 font-medium text-primary-foreground disabled:opacity-60"
        >
          {t("notifications.preferencesForm.wlacz_push_na_tym_urzadzeniu")}
        </button>
      )}
      {message ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          <Msg text={message} />
        </p>
      ) : null}
    </div>
  );
}
