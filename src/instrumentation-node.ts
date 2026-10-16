import { runOutbox } from "@/modules/notifications";

const INTERVAL_MS = 10_000;

/**
 * Lokalnie (`next dev`) przetwarzamy outbox co kilka sekund, żeby powiadomienia pojawiały się na żywo bez harmonogramu.
 * Na produkcji robi to zadanie cron (`/api/cron/outbox`). Wyłączenie: `OUTBOX_DEV_POLL=off`.
 */
if (
  process.env.NODE_ENV === "development" &&
  process.env.OUTBOX_DEV_POLL !== "off" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await runOutbox();
    } catch (error) {
      console.warn("[outbox:dev]", error instanceof Error ? error.message : error);
    } finally {
      busy = false;
    }
  }, INTERVAL_MS);
  timer.unref?.();
  console.info(`[outbox:dev] przetwarzanie powiadomień co ${INTERVAL_MS / 1000} s`);
}
