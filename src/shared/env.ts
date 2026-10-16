import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/** Zmienne publiczne; odczyt jawny, bo Next podstawia NEXT_PUBLIC_* statycznie. */
export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Zmienne serwerowe (tylko zadania w tle, webhooki, panel administratora). */
export function serverEnv() {
  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

/**
 * Publiczny adres aplikacji, używany w linkach z e-maili (potwierdzenie konta, reset hasła).
 * Celowo nie pochodzi z nagłówka Host, bo ten można podstawić (atak na link resetujący).
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return z.url().parse(configured).replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
}

const DEV_INVITATION_SECRET = "dev-only-invitation-secret-change-me-0000";

/**
 * Tajny pieprz do HMAC sekretów zaproszeń (token i krótki kod). Wyłącznie po stronie serwera.
 * Na produkcji wymagany; lokalnie wartość domyślna.
 */
export function invitationHashSecret(): string {
  const configured = process.env.INVITATION_HASH_SECRET;
  if (configured) return z.string().min(24).parse(configured);
  if (process.env.NODE_ENV !== "production") return DEV_INVITATION_SECRET;
  throw new Error("INVITATION_HASH_SECRET is required in production");
}

export function hasSupabaseEnv(): boolean {
  return publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}

/**
 * Konfiguracja kanałów powiadomień (wszystko opcjonalne; brak klucza = kanał w trybie podglądu).
 * Lokalnie e-maile trafiają do Mailpit (`supabase start`), push jest pomijany bez kluczy VAPID.
 */
export function notificationEnv() {
  const production = process.env.NODE_ENV === "production";
  return {
    /** Sekret zabezpieczający `/api/cron/outbox` (Vercel Cron wysyła go jako `Authorization: Bearer`). */
    cronSecret: process.env.CRON_SECRET || null,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || null,
    vapidSubject: process.env.VAPID_SUBJECT || "mailto:kontakt@dogtrainer.local",
    resendApiKey: process.env.RESEND_API_KEY || null,
    emailFrom: process.env.EMAIL_FROM || "DogTrainer <powiadomienia@dogtrainer.local>",
    mailpitUrl: process.env.MAILPIT_URL || (production ? null : "http://127.0.0.1:54324"),
  };
}
