// Kontrola zmiennych środowiskowych wdrożenia (staging, produkcja). Czysta funkcja: dostaje obiekt ze zmiennymi, zwraca listy
// błędów, ostrzeżeń i poprawnych pozycji. Komunikaty NIGDY nie zawierają wartości zmiennych (to sekrety), tylko nazwy i powód.

const PLACEHOLDER_HINTS = ["changeme", "change-me", "xxx", "your-", "twoj", "example", "placeholder", "todo"];
// Klucze demo lokalnego Supabase (`supabase start`) mają w ładunku JWT `"iss":"supabase-demo"`
const DEMO_JWT_ISSUER = "supabase-demo";
const DEV_INVITATION_SECRET = "dev-only-invitation-secret-change-me-0000";

/** Zmienne dozwolone tylko lokalnie: ich obecność na wdrożeniu to błąd konfiguracji. */
const FORBIDDEN_ON_DEPLOY = ["DEV_TUNNEL", "OUTBOX_DEV_POLL", "MAILPIT_URL", "SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_ROLE_KEY"];

const isSet = (value) => typeof value === "string" && value.trim() !== "";

function jwtIssuer(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.iss === "string" ? payload.iss : null;
  } catch {
    return null;
  }
}

function looksLikePlaceholder(value) {
  const lower = String(value).toLowerCase();
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const isLocalHost = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost") || host.endsWith(".test");

/**
 * @param {Record<string, string | undefined>} env zmienne środowiskowe wdrożenia
 * @param {{ target?: "staging" | "production" }} [options]
 * @returns {{ errors: string[], warnings: string[], ok: string[] }}
 */
export function validateEnv(env, options = {}) {
  const target = options.target ?? "staging";
  const errors = [];
  const warnings = [];
  const ok = [];
  const fail = (name, reason) => errors.push(`${name}: ${reason}`);
  const warn = (name, reason) => warnings.push(`${name}: ${reason}`);
  const good = (name, note) => ok.push(note ? `${name}: ${note}` : name);

  // 1. Supabase
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!isSet(supabaseUrl)) fail("NEXT_PUBLIC_SUPABASE_URL", "brak");
  else {
    const url = parseUrl(supabaseUrl);
    if (!url || url.protocol !== "https:") fail("NEXT_PUBLIC_SUPABASE_URL", "musi być adresem https (projekt w chmurze Supabase)");
    else if (isLocalHost(url.hostname)) fail("NEXT_PUBLIC_SUPABASE_URL", "wskazuje na lokalny Supabase");
    else good("NEXT_PUBLIC_SUPABASE_URL");
  }

  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isSet(anon)) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", "brak");
  else if (jwtIssuer(anon) === DEMO_JWT_ISSUER) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", "to klucz demo lokalnego Supabase");
  else if (anon.length < 20 || looksLikePlaceholder(anon)) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", "wygląda na wartość zastępczą");
  else good("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSet(service)) fail("SUPABASE_SERVICE_ROLE_KEY", "brak (potrzebny dla crona powiadomień i panelu właściciela)");
  else if (jwtIssuer(service) === DEMO_JWT_ISSUER) fail("SUPABASE_SERVICE_ROLE_KEY", "to klucz demo lokalnego Supabase");
  else if (service === anon) fail("SUPABASE_SERVICE_ROLE_KEY", "jest taki sam jak klucz anon (pomylone klucze)");
  else if (service.length < 20 || looksLikePlaceholder(service)) fail("SUPABASE_SERVICE_ROLE_KEY", "wygląda na wartość zastępczą");
  else good("SUPABASE_SERVICE_ROLE_KEY");

  // 2. Adres aplikacji (linki w e-mailach, QR, reset hasła)
  const siteUrl = env.NEXT_PUBLIC_SITE_URL;
  if (!isSet(siteUrl)) fail("NEXT_PUBLIC_SITE_URL", "brak (linki w e-mailach i QR nie będą działać)");
  else {
    const url = parseUrl(siteUrl);
    if (!url || url.protocol !== "https:") fail("NEXT_PUBLIC_SITE_URL", "musi być adresem https");
    else if (isLocalHost(url.hostname)) fail("NEXT_PUBLIC_SITE_URL", "wskazuje na adres lokalny");
    else if (url.pathname !== "/" || url.search || url.hash) fail("NEXT_PUBLIC_SITE_URL", "podaj sam adres (bez ścieżki, zapytania i fragmentu)");
    else if (/\/$/.test(siteUrl)) warn("NEXT_PUBLIC_SITE_URL", "ukośnik na końcu zostanie obcięty, ale lepiej go usunąć");
    else good("NEXT_PUBLIC_SITE_URL");
  }

  // 3. Sekrety aplikacji
  const invitation = env.INVITATION_HASH_SECRET;
  if (!isSet(invitation)) fail("INVITATION_HASH_SECRET", "brak (wymagany na produkcji)");
  else if (invitation === DEV_INVITATION_SECRET) fail("INVITATION_HASH_SECRET", "to wartość deweloperska");
  else if (invitation.length < 24) fail("INVITATION_HASH_SECRET", "za krótki (minimum 24 znaki)");
  else good("INVITATION_HASH_SECRET");

  const cron = env.CRON_SECRET;
  if (!isSet(cron)) fail("CRON_SECRET", "brak (bez niego powiadomienia nie będą wysyłane: trasa crona jest wyłączona)");
  else if (cron.length < 24) fail("CRON_SECRET", "za krótki (minimum 24 znaki)");
  else good("CRON_SECRET");

  // 4. Powiadomienia push (klucze VAPID: P-256, kodowanie base64url)
  const vapidPublic = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = env.VAPID_PRIVATE_KEY;
  if (!isSet(vapidPublic) || !isSet(vapidPrivate)) fail("VAPID", "brak pary kluczy NEXT_PUBLIC_VAPID_PUBLIC_KEY i VAPID_PRIVATE_KEY (push nie będzie działał)");
  else {
    if (!/^[A-Za-z0-9_-]{87}$/.test(vapidPublic)) fail("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "zły format (oczekiwane 87 znaków base64url z `npx web-push generate-vapid-keys`)");
    else good("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    if (!/^[A-Za-z0-9_-]{43}$/.test(vapidPrivate)) fail("VAPID_PRIVATE_KEY", "zły format (oczekiwane 43 znaki base64url)");
    else good("VAPID_PRIVATE_KEY");
  }
  const vapidSubject = env.VAPID_SUBJECT;
  if (!isSet(vapidSubject)) fail("VAPID_SUBJECT", "brak (adres kontaktowy w formie mailto:adres@domena)");
  else if (!/^(mailto:[^@\s]+@[^@\s]+\.[^@\s]+|https:\/\/\S+)$/.test(vapidSubject) || vapidSubject.includes("dogtrainer.local")) {
    fail("VAPID_SUBJECT", "musi być prawdziwym adresem mailto: albo https:");
  } else good("VAPID_SUBJECT");

  // 5. E-mail (Resend)
  const resend = env.RESEND_API_KEY;
  if (!isSet(resend)) fail("RESEND_API_KEY", "brak (e-maile z powiadomieniami i zaproszeniami nie będą wysyłane)");
  else if (!resend.startsWith("re_") || looksLikePlaceholder(resend)) fail("RESEND_API_KEY", "zły format (klucze Resend zaczynają się od re_)");
  else good("RESEND_API_KEY");
  const emailFrom = env.EMAIL_FROM;
  if (!isSet(emailFrom)) fail("EMAIL_FROM", "brak (nadawca w domenie zweryfikowanej w Resend)");
  else if (!/@[^@\s>]+\.[^@\s>]+/.test(emailFrom) || emailFrom.includes("dogtrainer.local")) fail("EMAIL_FROM", "musi zawierać prawdziwy adres nadawcy");
  else good("EMAIL_FROM");

  // 6. Dane operatora w regulaminie i kontakt
  // Sterowanie demo wysyła prawdziwe wiadomości (symulacja czasu): na serwerze z prawdziwymi klientami ma być wyłączone
  if (env.DEMO_CONTROLS === "1") warn("DEMO_CONTROLS", "włączone: symulacja czasu w /admin/demo wyśle prawdziwe wiadomości; wyłącz na serwerze z prawdziwymi klientami");

  // Sentry jest opcjonalny, ale zła wartość oznacza ciche gubienie błędów
  if (!isSet(env.SENTRY_DSN)) warn("SENTRY_DSN", "brak (błędy serwera nie będą raportowane do Sentry)");
  else if (!/^https?:\/\/[^@/]+@[^/]+\/(?:.*\/)?\d+\/?$/.test(env.SENTRY_DSN.trim())) warn("SENTRY_DSN", "nie wygląda jak DSN (https://<klucz>@<host>/<numer-projektu>)");
  else good("SENTRY_DSN");

  if (!isSet(env.NEXT_PUBLIC_SUPPORT_EMAIL)) fail("NEXT_PUBLIC_SUPPORT_EMAIL", "brak (kontakt w regulaminie, na ekranie zawieszenia i w pasku „tylko do odczytu”)");
  else good("NEXT_PUBLIC_SUPPORT_EMAIL");
  for (const name of ["NEXT_PUBLIC_OPERATOR_NAME", "NEXT_PUBLIC_OPERATOR_ADDRESS"]) {
    if (!isSet(env[name])) warn(name, "pusta: regulamin i polityka prywatności pokażą „do uzupełnienia” (uzupełnij przed zaproszeniem testerów)");
    else good(name);
  }

  // 7. Języki i panel właściciela
  const locales = (env.ENABLED_LOCALES ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (locales.includes("pl") && locales.includes("en")) good("ENABLED_LOCALES", "pl, en");
  else warn("ENABLED_LOCALES", "bez zmiennej działa tylko polski; ustaw `pl,en`, żeby włączyć przełącznik angielskiego");
  if (env.ADMIN_REQUIRE_MFA === "0") {
    if (target === "production") fail("ADMIN_REQUIRE_MFA", "wyłączone (=0): panel właściciela na produkcji ma wymagać weryfikacji dwuetapowej");
    else warn("ADMIN_REQUIRE_MFA", "wyłączone (=0): dopuszczalne na stagingu, na produkcji usuń to ustawienie");
  } else good("ADMIN_REQUIRE_MFA", "weryfikacja dwuetapowa wymagana");

  // 8. Zmienne tylko lokalne
  for (const name of FORBIDDEN_ON_DEPLOY) {
    if (isSet(env[name])) fail(name, "zmienna tylko do pracy lokalnej, usuń ją z wdrożenia");
  }

  return { errors, warnings, ok };
}
