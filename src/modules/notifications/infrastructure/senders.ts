import webpush from "web-push";
import { notificationEnv } from "@/shared/env";
import type { EmailSender, PushSender, SmsSender } from "../application/ports";

/**
 * E-mail: Resend na produkcji (`RESEND_API_KEY`), lokalnie HTTP API Mailpit (podgląd w `http://127.0.0.1:54324`).
 * Bez żadnej konfiguracji wiadomość jest tylko pomijana ze wskazaniem powodu.
 */
export function createEmailSender(): EmailSender {
  const env = notificationEnv();

  if (env.resendApiKey) {
    const apiKey = env.resendApiKey;
    return {
      async send(message) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: env.emailFrom,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        });
        if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
        return { status: "sent" };
      },
    };
  }

  if (env.mailpitUrl) {
    const baseUrl = env.mailpitUrl;
    const from = parseFrom(env.emailFrom);
    return {
      async send(message) {
        const response = await fetch(`${baseUrl}/api/v1/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            From: from,
            To: [{ Email: message.to }],
            Subject: message.subject,
            Text: message.text,
            HTML: message.html,
          }),
        });
        if (!response.ok) throw new Error(`Mailpit ${response.status}`);
        return { status: "sent", detail: "mailpit" };
      },
    };
  }

  return { send: async () => ({ status: "skipped", detail: "brak konfiguracji e-mail (RESEND_API_KEY)" }) };
}

function parseFrom(value: string): { Name: string; Email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match ? { Name: match[1], Email: match[2] } : { Name: "DogTrainer", Email: value.trim() };
}

/** Web push (VAPID). Bez kluczy kanał jest pomijany. */
export function createPushSender(): PushSender {
  const env = notificationEnv();
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    return { send: async () => ({ status: "skipped", detail: "brak kluczy VAPID" }) };
  }
  const options = { vapidDetails: { subject: env.vapidSubject, publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey } };

  return {
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { ...options, TTL: 24 * 3600 },
        );
        return { status: "sent" };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) return { status: "skipped", detail: "subskrypcja wygasła", gone: true };
        throw error;
      }
    },
  };
}

/**
 * SMS w trybie podglądu: treść trafia do logu serwera, nic nie jest wysyłane.
 * Prawdziwy adapter (np. SMSAPI) implementuje ten sam interfejs `SmsSender`.
 */
export function createSmsSender(): SmsSender {
  return {
    async send(to, text) {
      console.info(`[sms:podgląd] do ${to}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
      return { status: "preview", detail: `podgląd do ${to}` };
    },
  };
}
