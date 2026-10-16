import { z } from "zod";
import { formText } from "@/shared/form";

export type Audience = "staff" | "client";

export const REQUEST_KINDS = ["renew", "pay", "end"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** Etykiety przycisków odpowiedzi klienta na powiadomienie o kończącym się pakiecie. */
export const REQUEST_ACTION_LABELS: Record<RequestKind, string> = {
  renew: "Odnów pakiet",
  pay: "Zapłacę",
  end: "Kończę współpracę",
};

/** Potwierdzenie widoczne dla klienta po wysłaniu prośby. */
export const REQUEST_CONFIRMATIONS: Record<RequestKind, string> = {
  renew: "Dziękujemy! Trener dostał informację, że chcesz odnowić pakiet.",
  pay: "Dziękujemy! Trener dostał informację, że zapłacisz.",
  end: "Dziękujemy! Trener dostał informację, że kończysz współpracę.",
};

export const REQUEST_STATUS_LABELS = { new: "Nowa", seen: "Obejrzana" } as const;

export const createRequestInputSchema = z.object({
  kind: z.enum(REQUEST_KINDS, { error: "Wybierz odpowiedź." }),
  packageId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  chargeId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  note: formText(500),
});
export type CreateRequestInput = z.output<typeof createRequestInputSchema>;

export type ClientRequest = {
  id: string;
  clientId: string;
  clientName: string;
  kind: RequestKind;
  status: "new" | "seen";
  packageId: string | null;
  packageName: string | null;
  chargeId: string | null;
  chargeDescription: string | null;
  note: string | null;
  createdAt: Date;
};

/** Zdarzenie z tabeli outbox_events. */
export type OutboxEvent = {
  id: string;
  organizationId: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

/** Powiadomienie w skrzynce użytkownika (dzwonek). */
export type Notification = {
  id: string;
  audience: Audience;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
};

/** Powiadomienie do utworzenia dla jednego odbiorcy. */
export type NotificationDraft = {
  recipientUserId: string;
  audience: Audience;
  clientId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  dedupeKey: string;
};

export type Channel = "push" | "email" | "sms";
export const CHANNELS: readonly Channel[] = ["push", "email", "sms"];

export type ChannelPreferences = { push: boolean; email: boolean; sms: boolean };

/** Domyślnie push i e-mail włączone, SMS wyłączony (płatny dodatek). */
export const DEFAULT_PREFERENCES: ChannelPreferences = { push: true, email: true, sms: false };

export const CHANNEL_LABELS: Record<Channel, string> = {
  push: "Powiadomienia push na telefonie",
  email: "E-mail",
  sms: "SMS (podgląd, bez wysyłki)",
};

export const preferencesInputSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
});

export function enabledChannels(preferences: ChannelPreferences | null): Channel[] {
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  return CHANNELS.filter((channel) => prefs[channel]);
}

export type PushSubscriptionInput = z.output<typeof pushSubscriptionSchema>;
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
  userAgent: z.string().max(300).nullish(),
});
