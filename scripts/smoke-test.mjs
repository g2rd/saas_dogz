// Test dymny wdrożonej aplikacji (staging lub produkcja): sprawdza strony publiczne, PWA, nagłówki bezpieczeństwa,
// przekierowania niezalogowanych i zabezpieczenie trasy crona. Niczego nie zapisuje w bazie ani nie loguje.
// Użycie:  npm run smoke -- https://app.twojadomena.pl
//          CRON_SECRET=... npm run smoke -- https://app.twojadomena.pl   (sprawdza też poprawne wywołanie crona)
//          npm run smoke -- http://localhost:3000 --allow-http           (lokalnie)
const args = process.argv.slice(2);
const base = args.find((arg) => /^https?:\/\//.test(arg))?.replace(/\/+$/, "");
const allowHttp = args.includes("--allow-http");

if (!base) {
  console.error("Podaj adres aplikacji, np.: npm run smoke -- https://app.twojadomena.pl");
  process.exit(2);
}

const results = [];
const record = (ok, name, detail = "") => results.push({ ok, name, detail });

async function get(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(true, name, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(false, name, error instanceof Error ? error.message : String(error));
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const isHttps = base.startsWith("https://");
if (!isHttps && !allowHttp) {
  console.error("Adres musi być https (PWA i push działają tylko po HTTPS). Lokalnie dodaj --allow-http.");
  process.exit(2);
}

await check("strona logowania /login (200)", async () => {
  const res = await get("/login");
  expect(res.status === 200, `status ${res.status}`);
  expect((res.headers.get("content-type") ?? "").includes("text/html"), "to nie jest HTML");
});

await check("regulamin /terms i polityka /privacy (200)", async () => {
  for (const path of ["/terms", "/privacy"]) {
    const res = await get(path);
    expect(res.status === 200, `${path}: status ${res.status}`);
  }
});

await check("manifest PWA /manifest.webmanifest (200, start_url /start)", async () => {
  const res = await get("/manifest.webmanifest");
  expect(res.status === 200, `status ${res.status}`);
  const manifest = await res.json();
  expect(manifest.start_url === "/start", `start_url = ${manifest.start_url}`);
  expect(Array.isArray(manifest.icons) && manifest.icons.length > 0, "brak ikon");
});

await check("service worker /sw.js (JavaScript, bez pamięci podręcznej)", async () => {
  const res = await get("/sw.js");
  expect(res.status === 200, `status ${res.status}`);
  expect((res.headers.get("content-type") ?? "").includes("javascript"), `content-type: ${res.headers.get("content-type")}`);
  expect((res.headers.get("cache-control") ?? "").includes("no-cache"), `cache-control: ${res.headers.get("cache-control")}`);
});

await check("strona offline /offline.html (200)", async () => {
  const res = await get("/offline.html");
  expect(res.status === 200, `status ${res.status}`);
});

await check("nieistniejąca strona daje 404", async () => {
  const res = await get(`/nie-ma-takiej-strony-${Date.now()}`);
  expect(res.status === 404, `status ${res.status}`);
});

await check("trasy chronione odsyłają niezalogowanych do logowania (/app, /portal, /admin)", async () => {
  for (const path of ["/app", "/portal", "/admin"]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    expect([302, 303, 307, 308].includes(res.status) && location.includes("/login"), `${path}: status ${res.status}, location ${location || "brak"}`);
  }
});

await check("nagłówki bezpieczeństwa (ramki, sniffing, CSP, brak X-Powered-By)", async () => {
  const res = await get("/login");
  expect((res.headers.get("x-frame-options") ?? "").toUpperCase() === "DENY", "brak X-Frame-Options: DENY");
  expect((res.headers.get("x-content-type-options") ?? "") === "nosniff", "brak X-Content-Type-Options: nosniff");
  expect((res.headers.get("content-security-policy") ?? "").includes("frame-ancestors"), "brak CSP z frame-ancestors");
  expect((res.headers.get("referrer-policy") ?? "") !== "", "brak Referrer-Policy");
  expect(!res.headers.has("x-powered-by"), "nagłówek X-Powered-By ujawnia framework");
  if (isHttps) expect((res.headers.get("strict-transport-security") ?? "").includes("max-age"), "brak Strict-Transport-Security (HSTS)");
});

await check("cron powiadomień /api/cron/outbox odrzuca wywołanie bez sekretu (401)", async () => {
  const none = await get("/api/cron/outbox");
  expect(none.status !== 200, "trasa crona odpowiada bez autoryzacji");
  expect(none.status !== 503, "503: CRON_SECRET nie jest ustawiony na wdrożeniu (powiadomienia nie będą wysyłane)");
  expect(none.status === 401, `status ${none.status}`);
  const wrong = await get("/api/cron/outbox", { headers: { authorization: "Bearer zly-sekret-testowy" } });
  expect(wrong.status === 401, `zły sekret: status ${wrong.status}`);
});

if (process.env.CRON_SECRET) {
  await check("cron powiadomień z poprawnym sekretem (200 i raport JSON)", async () => {
    const res = await get("/api/cron/outbox", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const body = await res.json().catch(() => null);
    expect(res.status === 200, `status ${res.status}${body && body.stuck ? `, zalegające zdarzenia: ${body.stuck}` : ""}`);
    expect(body && typeof body.claimed === "number", "odpowiedź nie jest raportem procesora");
    return `pobrano ${body.claimed}, przetworzono ${body.processed}, błędy ${body.failed}`;
  });
} else {
  record(true, "cron z poprawnym sekretem: pominięty (ustaw CRON_SECRET w środowisku, żeby go sprawdzić)");
}

console.log(`Test dymny: ${base}\n`);
for (const { ok, name, detail } of results) console.log(`  ${ok ? "OK    " : "BŁĄD "} ${name}${detail ? `: ${detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\nPoprawne: ${results.length - failed}, błędy: ${failed}`);
console.log("Sprawdź ręcznie (nie da się zautomatyzować bez konta): rejestracja bez kodu jest odrzucona, e-mail dochodzi, push na telefonie.");
process.exit(failed > 0 ? 1 : 0);
