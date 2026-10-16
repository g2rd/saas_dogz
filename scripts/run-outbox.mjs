// Ręczne uruchomienie przetwarzania powiadomień przez trasę cron (wymaga działającego `npm run dev` i CRON_SECRET w .env.local).
import { readFileSync } from "node:fs";

function readEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

const env = { ...readEnvLocal(), ...process.env };
const secret = env.CRON_SECRET;
if (!secret) {
  console.error("Ustaw CRON_SECRET w .env.local (min. 24 znaki) i zrestartuj `npm run dev`.");
  process.exit(1);
}

const base = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const response = await fetch(`${base}/api/cron/outbox`, { headers: { Authorization: `Bearer ${secret}` } });
console.log(response.status, await response.text());
process.exit(response.ok ? 0 : 1);
