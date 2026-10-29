/**
 * Raportowanie błędów serwera do Sentry bez zależności od SDK: zwykłe żądanie HTTP do interfejsu „envelope”.
 * Włączane zmienną `SENTRY_DSN`; bez niej nic się nie dzieje (żadnego ruchu, żadnych kosztów). Działa w środowisku Node i edge (tylko `fetch`).
 *
 * Prywatność (dane trenerów i klientów są osobowe): wysyłamy typ i komunikat błędu, stos, wzorzec trasy (`/invite/[secret]`, nigdy rzeczywisty
 * adres z tokenem ani zapytanie), metodę, środowisko i wydanie. Bez nagłówków, ciasteczek, treści żądań, adresów e-mail i identyfikatorów
 * użytkowników. Komunikaty błędów aplikacji nie zawierają danych osobowych; mimo to ucinamy je do 500 znaków.
 */

export type SentryDsn = { endpoint: string; publicKey: string };

/** Rozbiera DSN `https://<klucz>@<host>/<projekt>` na adres „envelope” i klucz; `null` dla pustego lub błędnego DSN. */
export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const parts = url.pathname.split("/").filter(Boolean);
    const project = parts.pop();
    if (!url.username || !project || !/^\d+$/.test(project)) return null;
    const prefix = parts.join("/");
    return { endpoint: `${url.protocol}//${url.host}${prefix ? `/${prefix}` : ""}/api/${project}/envelope/`, publicKey: url.username };
  } catch {
    return null;
  }
}

export type ErrorContext = {
  /** Wzorzec trasy z Next (np. `/app/clients/[id]`), nie rzeczywisty adres. */
  route?: string;
  method?: string;
  /** Skąd błąd: `request` (render, akcja, trasa) albo nazwa zadania w tle (np. `cron/outbox`). */
  source?: string;
  tags?: Record<string, string>;
};

type Frame = { filename?: string; function?: string; lineno?: number; colno?: number };

/** Ramki stosu z tekstu V8 (`at funkcja (plik:wiersz:kolumna)`), od najstarszej do najnowszej, jak oczekuje Sentry. */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (match) frames.push({ function: match[1], filename: match[2], lineno: Number(match[3]), colno: Number(match[4]) });
  }
  return frames.reverse();
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Zdarzenie Sentry dla błędu; `digest` (Next) pozwala dopasować zgłoszenie do kodu pokazanego użytkownikowi na stronie błędu. */
export function buildEvent(error: unknown, context: ErrorContext, env: { environment: string; release?: string }, now = new Date()) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Nieznany błąd");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  return {
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    environment: env.environment,
    ...(env.release ? { release: env.release } : {}),
    exception: { values: [{ type: err.name || "Error", value: truncate(err.message, 500), stacktrace: { frames: parseStack(err.stack) } }] },
    tags: {
      source: context.source ?? "request",
      ...(context.route ? { route: context.route } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(digest ? { digest } : {}),
      ...context.tags,
    },
  };
}

function sentryEnv() {
  return {
    dsn: parseDsn(process.env.SENTRY_DSN),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  };
}

/** Czy raportowanie jest włączone (poprawny `SENTRY_DSN`). */
export function monitoringEnabled(): boolean {
  return sentryEnv().dsn !== null;
}

/**
 * Wysyła błąd do Sentry; nigdy nie rzuca wyjątku i nie czeka dłużej niż 3 s (raportowanie nie może psuć obsługi żądania).
 * Zwraca `true`, gdy Sentry przyjęło zdarzenie.
 */
export async function reportError(error: unknown, context: ErrorContext = {}): Promise<boolean> {
  const { dsn, environment, release } = sentryEnv();
  if (!dsn) return false;
  try {
    const event = buildEvent(error, context, { environment, release });
    const envelope = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    const response = await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=dogtrainer/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
