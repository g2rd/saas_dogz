import { timingSafeEqual } from "node:crypto";
import { runOutbox } from "@/modules/notifications";
import { notificationEnv } from "@/shared/env";
import { reportError } from "@/shared/monitoring/sentry";

/** Porównanie stałoczasowe, żeby sekret nie wyciekał przez czas odpowiedzi. */
function secretMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Zadanie w tle: reguły dzienne i przetwarzanie outbox (powiadomienia). Wywołuje je harmonogram
 * (np. Vercel Cron) z nagłówkiem `Authorization: Bearer $CRON_SECRET`. Bez skonfigurowanego sekretu trasa jest wyłączona.
 */
async function handle(request: Request): Promise<Response> {
  const { cronSecret } = notificationEnv();
  if (!cronSecret) return Response.json({ error: "CRON_SECRET nie jest skonfigurowany" }, { status: 503 });
  if (!secretMatches(request.headers.get("authorization"), cronSecret)) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const result = await runOutbox();
    // Zalegające zdarzenia (wyczerpane próby) wymagają interwencji: sygnalizujemy je kodem 500 dla monitoringu
    return Response.json(result, { status: result.stuck > 0 ? 500 : 200 });
  } catch (error) {
    console.error("[cron/outbox]", error);
    await reportError(error, { source: "cron/outbox", route: "/api/cron/outbox", method: request.method });
    return Response.json({ error: "Przetwarzanie nie powiodło się" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
