import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/shared/env";
import { createServiceClient } from "@/shared/supabase/admin";
import { enabledChannels, type Channel, type NotificationDraft, type OutboxEvent } from "../domain/notification";
import { isNotifiable, planNotifications, renderExternalMessage } from "../domain/plan";
import { outboxRepository } from "../infrastructure/outbox-repository";
import { createEmailSender, createPushSender } from "../infrastructure/senders";
import type { EmailSender, PushSender } from "./ports";

export type OutboxDeps = {
  db: SupabaseClient;
  email: EmailSender;
  push: PushSender;
  baseUrl: string;
  now: () => Date;
};

export type OutboxRunResult = {
  enqueued: number;
  claimed: number;
  processed: number;
  failed: number;
  notifications: number;
  stuck: number;
};

const BATCH_SIZE = 25;

/**
 * Przetwarza outbox: reguły dzienne dopisują zdarzenia, potem partia zdarzeń jest blokowana (FOR UPDATE SKIP LOCKED),
 * zamieniana na powiadomienia w aplikacji i wysyłana kanałami zewnętrznymi według preferencji odbiorcy.
 * Idempotencja: powiadomienie ma unikalny klucz (odbiorca, zdarzenie), a dostarczenie per kanał zapisuje się w
 * `notification_log`, więc ponowienie po błędzie wysyła tylko to, co się nie udało. Po 5 próbach zdarzenie zalega.
 */
export async function processOutbox(
  deps: OutboxDeps,
  options: { limit?: number; runDailyRules?: boolean } = {},
): Promise<OutboxRunResult> {
  const repo = outboxRepository(deps.db);
  const result: OutboxRunResult = { enqueued: 0, claimed: 0, processed: 0, failed: 0, notifications: 0, stuck: 0 };

  if (options.runDailyRules ?? true) result.enqueued = await repo.enqueueDaily(deps.now());

  const events = await repo.claim(options.limit ?? BATCH_SIZE);
  result.claimed = events.length;

  for (const event of events) {
    try {
      if (isNotifiable(event.type) && event.organizationId) {
        const drafts = await draftsFor(repo, event);
        let failure: string | null = null;

        for (const draft of drafts) {
          const saved = await repo.saveNotification(event.organizationId, draft);
          if (saved.created) result.notifications += 1;
          const problem = await deliverExternally(deps, repo, saved.id, draft);
          if (problem && !failure) failure = problem;
        }
        if (failure) throw new Error(failure);
      }
      await repo.markProcessed(event.id);
      result.processed += 1;
    } catch (error) {
      result.failed += 1;
      await repo.markFailed(event.id, error instanceof Error ? error.message : String(error));
    }
  }

  result.stuck = await repo.countStuck();
  return result;
}

/** Wysyła powiadomienie kanałami zewnętrznymi; zwraca opis pierwszego błędu (do ponowienia) albo null. */
async function deliverExternally(
  deps: OutboxDeps,
  repo: ReturnType<typeof outboxRepository>,
  notificationId: string,
  draft: NotificationDraft,
): Promise<string | null> {
  const done = await repo.finishedChannels(notificationId);
  const channels = enabledChannels(await repo.preferencesFor(draft.recipientUserId)).filter((c) => !done.has(c));
  if (channels.length === 0) return null;

  const message = renderExternalMessage(draft, deps.baseUrl);
  let firstProblem: string | null = null;

  for (const channel of channels) {
    try {
      const outcome = await sendVia(deps, repo, channel, draft, message);
      await repo.logDelivery(notificationId, channel, outcome.status, outcome.detail ?? null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await repo.logDelivery(notificationId, channel, "failed", detail);
      firstProblem ??= `${channel}: ${detail}`;
    }
  }
  return firstProblem;
}

async function sendVia(
  deps: OutboxDeps,
  repo: ReturnType<typeof outboxRepository>,
  channel: Channel,
  draft: NotificationDraft,
  message: ReturnType<typeof renderExternalMessage>,
): Promise<{ status: "sent" | "preview" | "skipped"; detail?: string }> {
  switch (channel) {
    case "email": {
      const to = await repo.emailFor(draft.recipientUserId);
      if (!to) return { status: "skipped", detail: "brak adresu e-mail" };
      return deps.email.send({ to, subject: message.subject, text: message.text, html: message.html });
    }
    case "push": {
      const targets = await repo.pushTargets(draft.recipientUserId);
      if (targets.length === 0) return { status: "skipped", detail: "brak subskrypcji push" };
      let sent = 0;
      let lastDetail: string | undefined;
      for (const target of targets) {
        const outcome = await deps.push.send(target, { title: draft.title, body: draft.body, url: message.url });
        if (outcome.gone) await repo.deletePushTarget(target.id);
        if (outcome.status === "sent") sent += 1;
        else lastDetail = outcome.detail;
      }
      return sent > 0 ? { status: "sent", detail: `${sent}/${targets.length} urządzeń` } : { status: "skipped", detail: lastDetail };
    }
  }
}

/** Uruchomienie z prawdziwymi adapterami (trasa cron, pętla deweloperska). */
export async function runOutbox(options: { limit?: number; runDailyRules?: boolean } = {}): Promise<OutboxRunResult> {
  return processOutbox(
    {
      db: createServiceClient(),
      email: createEmailSender(),
      push: createPushSender(),
      baseUrl: siteUrl(),
      now: () => new Date(),
    },
    options,
  );
}

/**
 * Szkice powiadomień dla zdarzenia. Ogłoszenie wolnego terminu trafia do wielu klientów (lista chętnych), więc dla niego
 * zdarzenie jest rozwijane na klientów; reszta zdarzeń dotyczy jednego klienta z ładunku.
 */
async function draftsFor(repo: ReturnType<typeof outboxRepository>, event: OutboxEvent): Promise<NotificationDraft[]> {
  if (event.type === "slot_offer.created" && event.organizationId) {
    const exclude = typeof event.payload.exclude_client_id === "string" ? event.payload.exclude_client_id : null;
    const drafts: NotificationDraft[] = [];
    for (const clientId of await repo.waitlistClientIds(event.organizationId, exclude)) {
      const perClient = { ...event, payload: { ...event.payload, client_id: clientId } };
      const facts = await repo.loadFacts(perClient);
      if (facts) drafts.push(...planNotifications(perClient, facts));
    }
    return drafts;
  }
  const facts = await repo.loadFacts(event);
  return facts ? planNotifications(event, facts) : [];
}
