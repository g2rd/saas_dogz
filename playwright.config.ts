import { defineConfig, devices } from "@playwright/test";

/**
 * Testy end-to-end (przeglądarka + prawdziwa baza). Wymagają lokalnego Supabase (`npm run db:start`); aplikacja jest budowana
 * i uruchamiana w trybie produkcyjnym na porcie 3100 z własnymi zmiennymi (nie zależy od `.env.local`).
 * Uruchomienie: `npm run e2e` (wszystko), `npm run e2e -- --project=mobile` (widok telefonu), `npm run e2e:ui` (podgląd interaktywny).
 * Lokalnie używamy zainstalowanej Microsoft Edge (bez pobierania przeglądarki); w CI Chromium z `npx playwright install chromium`.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);
const channel = CI ? undefined : (process.env.PLAYWRIGHT_CHANNEL ?? "msedge");

// Publiczne klucze demo lokalnego Supabase (`supabase start`), takie same jak w testach integracyjnych
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789abcdef";
export const E2E_SENTRY_PORT = 54399;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    // Większość użytkowników korzysta z telefonu, więc ścieżki oznaczone @mobile przechodzimy też w widoku telefonu
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      // Adres zapisywany w linkach zaproszeń i e-maili: musi wskazywać serwer testowy (wartość NEXT_PUBLIC_* jest wbudowywana w build)
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      INVITATION_HASH_SECRET: "e2e-invitation-secret-0123456789abcdef",
      CRON_SECRET: E2E_CRON_SECRET,
      // W trybie produkcyjnym e-maile nie idą do Mailpit bez jawnego adresu
      MAILPIT_URL: "http://127.0.0.1:54324",
      // Panel właściciela bez weryfikacji dwuetapowej (w testach nie ma aplikacji uwierzytelniającej)
      ADMIN_REQUIRE_MFA: "0",
      ENABLED_LOCALES: "pl,en",
      // Sterowanie demo w panelu właściciela (e2e/demo.spec.ts)
      DEMO_CONTROLS: "1",
      // Pozwala testowi układu włączyć pseudo-lokalizację ciasteczkiem `dt_pseudo=1` (bez ciasteczka nic się nie zmienia)
      ENABLE_PSEUDO_LOCALE: "1",
      // Raportowanie błędów do „Sentry” udawanego przez test (e2e/monitoring.spec.ts); bez nasłuchującego serwera zgłoszenia po cichu przepadają
      SENTRY_DSN: `http://e2ekey@127.0.0.1:${E2E_SENTRY_PORT}/1`,
    },
  },
});
