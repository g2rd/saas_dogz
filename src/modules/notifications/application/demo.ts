import { demoControlsEnabled } from "@/shared/env";
import { appError } from "@/shared/errors";
import { msg } from "@/shared/i18n/messages";
import { err, ok, type Result } from "@/shared/result";
import { createServiceClient } from "@/shared/supabase/admin";
import { runOutbox, type OutboxRunResult } from "./process-outbox";

/**
 * Sterowanie demo (panel właściciela, `/admin/demo`): pozwala pokazać trenerowi działanie powiadomień bez czekania na czas.
 * Wyłączone, dopóki serwer nie ma `DEMO_CONTROLS=1` (na danych prawdziwych klientów reguły dzienne wysłałyby prawdziwe wiadomości).
 * Funkcje używają klucza service_role, więc wolno je wołać wyłącznie po sprawdzeniu uprawnień właściciela platformy.
 */
const disabled = () => err(appError("forbidden", msg("errors.demo.disabled")));

/** Przetwarza zdarzenia od razu (zdejmuje 30-sekundowe okno „Cofnij”) i zwraca zsumowany wynik. */
export async function processNotificationsNow(): Promise<Result<OutboxRunResult>> {
  if (!demoControlsEnabled()) return disabled();
  await createServiceClient().from("outbox_events").update({ not_before: null }).is("processed_at", null);
  const total: OutboxRunResult = { enqueued: 0, expired: 0, claimed: 0, processed: 0, failed: 0, notifications: 0, stuck: 0 };
  for (let round = 0; round < 5; round++) {
    const run = await runOutbox({ runDailyRules: round === 0 });
    for (const key of Object.keys(total) as (keyof OutboxRunResult)[]) total[key] += run[key];
    if (run.claimed === 0) break;
  }
  return ok(total);
}

/** Powiadomienie testowe dla właścicieli i administratorów wskazanej szkoły (dzwonek, e-mail, push według ich ustawień). */
export async function sendTestNotification(organizationId: string): Promise<Result<OutboxRunResult>> {
  if (!demoControlsEnabled()) return disabled();
  const inserted = await createServiceClient().from("outbox_events").insert({ organization_id: organizationId, type: "demo.test", payload: {} });
  if (inserted.error) return err(appError("internal", msg("errors.db.generic"), inserted.error.message));
  return processNotificationsNow();
}

/**
 * „Przewijanie czasu”: reguły dzienne (przypomnienia o zajęciach, zbliżające się i przeterminowane płatności, koniec dostępu) liczone tak,
 * jakby minęło `days` dni; dane w bazie się nie zmieniają, powstają tylko powiadomienia. Potem przetwarza je od razu.
 */
export async function simulateDaysAhead(days: number): Promise<Result<{ events: number; run: OutboxRunResult }>> {
  if (!demoControlsEnabled()) return disabled();
  if (!Number.isInteger(days) || days < 1 || days > 60) return err(appError("validation", msg("errors.demo.days")));
  const at = new Date(Date.now() + days * 86_400_000).toISOString();
  const queued = await createServiceClient().rpc("enqueue_daily_notification_events", { p_now: at });
  if (queued.error) return err(appError("internal", msg("errors.db.generic"), queued.error.message));
  const run = await processNotificationsNow();
  if (!run.ok) return run;
  return ok({ events: queued.data as number, run: run.value });
}
