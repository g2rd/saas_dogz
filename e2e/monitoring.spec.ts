import { createServer, type IncomingMessage } from "node:http";
import { expect, test } from "@playwright/test";
import { E2E_SENTRY_PORT } from "../playwright.config";
import { adminDb, createAccount, createSchool } from "./support/api";
import { login } from "./support/ui";

test.describe("monitoring", () => {
  test("endpoint stanu: 200 przy zdrowej bazie i kolejce, 503 gdy powiadomienia zalegają", async ({ request }) => {
    const healthy = await request.get("/api/health");
    expect(healthy.status()).toBe(200);
    expect(await healthy.json()).toEqual({ status: "ok", checks: { database: true, outbox: true } });
    expect(healthy.headers()["cache-control"]).toContain("no-store");

    // Zdarzenie czekające w outboxie od pół godziny = harmonogram nie działa (typ nieznany procesorowi, więc zostaje do naszego sprzątania)
    const old = new Date(Date.now() - 30 * 60_000).toISOString();
    const inserted = await adminDb().from("outbox_events").insert({ type: "e2e.health_probe", payload: {}, created_at: old }).select("id").single();
    expect(inserted.error).toBeNull();
    try {
      const degraded = await request.get("/api/health");
      expect(degraded.status()).toBe(503);
      expect(await degraded.json()).toEqual({ status: "degraded", checks: { database: true, outbox: false } });
    } finally {
      await adminDb().from("outbox_events").update({ processed_at: new Date().toISOString() }).eq("id", inserted.data!.id);
    }
  });

  test("błąd serwera trafia do Sentry (DSN z env): wzorzec trasy, bez adresu, ciasteczek i danych użytkownika", async ({ page }) => {
    const received: { url: string; auth: string; body: string }[] = [];
    const sink = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received.push({ url: req.url ?? "", auth: String(req.headers["x-sentry-auth"] ?? ""), body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      });
    });
    await new Promise<void>((resolve) => sink.listen(E2E_SENTRY_PORT, "127.0.0.1", resolve));
    try {
      const owner = await createAccount("monitoring");
      await createSchool(owner);
      await login(page, owner.email, owner.password, /\/app/);

      // Identyfikator, który nie jest UUID, kończy się błędem renderu strony (nie „nie znaleziono”)
      await page.goto("/app/clients/nie-uuid-12345");

      await expect.poll(() => received.length, { timeout: 15_000 }).toBeGreaterThan(0);
      const first = received[0];
      expect(first.url).toBe("/api/1/envelope/");
      expect(first.auth).toContain("sentry_key=e2ekey");
      const [header, itemHeader, payload] = first.body.split("\n").map((line) => JSON.parse(line));
      expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
      expect(itemHeader).toEqual({ type: "event" });
      expect(payload.level).toBe("error");
      expect(payload.exception.values[0].value).toBeTruthy();
      expect(payload.tags).toMatchObject({ source: "request", route: "/app/clients/[id]" });

      // Prywatność: ani rzeczywisty adres, ani ciasteczka, nagłówki, e-mail konta
      expect(first.body).not.toContain("nie-uuid-12345");
      expect(first.body).not.toContain(owner.email);
      expect(first.body.toLowerCase()).not.toContain("cookie");
      expect(first.body.toLowerCase()).not.toContain("authorization");
    } finally {
      await new Promise<void>((resolve) => sink.close(() => resolve()));
    }
  });
});
