"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/shared/form";
import { CheckboxField, FormMessage, SubmitButton } from "@/shared/ui/form-fields";
import { CHANNEL_LABELS, type ChannelPreferences } from "../domain/notification";

type SaveAction = (prev: FormState & { saved?: boolean }, formData: FormData) => Promise<FormState & { saved?: boolean }>;

/** Preferencje kanałów powiadomień. Powiadomienia w aplikacji są zawsze włączone. */
export function PreferencesForm({ action, preferences }: { action: SaveAction; preferences: ChannelPreferences }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Powiadomienia w aplikacji (dzwonek) są zawsze włączone. Wybierz, gdzie jeszcze mają do Ciebie docierać.
      </p>
      <CheckboxField name="push" label={CHANNEL_LABELS.push} defaultChecked={preferences.push} />
      <CheckboxField name="email" label={CHANNEL_LABELS.email} defaultChecked={preferences.email} />
      <FormMessage state={state} />
      {state.saved ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Zapisano.
        </p>
      ) : null}
      <div>
        <SubmitButton>Zapisz</SubmitButton>
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
      setMessage("Powiadomienia push włączone na tym urządzeniu.");
    } catch {
      setMessage("Nie udało się włączyć powiadomień push na tym urządzeniu.");
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
      setMessage("Powiadomienia push wyłączone na tym urządzeniu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="font-medium">To urządzenie</p>
      {status === "needs-install" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Na iPhonie powiadomienia push działają dopiero po dodaniu aplikacji do ekranu głównego: stuknij{" "}
          <strong>Udostępnij</strong>, potem <strong>Do ekranu początkowego</strong>, otwórz aplikację z ikony i wróć tutaj.
        </p>
      ) : status === "unsupported" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ta przeglądarka nie obsługuje powiadomień push lub serwer nie ma ich skonfigurowanych.
        </p>
      ) : status === "denied" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Powiadomienia są zablokowane w ustawieniach przeglądarki. Zmień to w ustawieniach strony.
        </p>
      ) : status === "on" ? (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="h-11 self-start rounded-full border border-zinc-300 px-5 font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          Wyłącz push na tym urządzeniu
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={busy || status === "checking"}
          className="h-11 self-start rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-60"
        >
          Włącz push na tym urządzeniu
        </button>
      )}
      {message ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
