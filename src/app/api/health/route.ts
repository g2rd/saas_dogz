import { connection } from "next/server";
import { createServiceClient } from "@/shared/supabase/admin";

/** Zdarzenia czekające w outboxie dłużej niż tyle minut oznaczają, że harmonogram powiadomień nie działa. */
const OUTBOX_MAX_AGE_MINUTES = 15;

/**
 * Stan aplikacji dla monitora dostępności (UptimeRobot, Better Stack itp.): publiczny, bez danych, tylko wartości logiczne.
 * 200 = wszystko działa; 503 = baza nie odpowiada albo zaległe powiadomienia (cron nie przetwarza outboxu).
 * Monitor sprawdza go co 1-5 minut i alarmuje po kodzie innym niż 200.
 */
export async function GET(): Promise<Response> {
  await connection();
  const checks = { database: false, outbox: false };
  try {
    const db = createServiceClient();
    const probe = await db.from("organizations").select("id").limit(1);
    checks.database = !probe.error;
    if (checks.database) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - OUTBOX_MAX_AGE_MINUTES * 60_000).toISOString();
      const stale = await db
        .from("outbox_events")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null)
        .lt("created_at", cutoff)
        .or(`not_before.is.null,not_before.lte.${now.toISOString()}`);
      checks.outbox = !stale.error && (stale.count ?? 0) === 0;
    }
  } catch {
    // zostają wartości false: monitor dostanie 503
  }
  const ok = checks.database && checks.outbox;
  return Response.json({ status: ok ? "ok" : "degraded", checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
