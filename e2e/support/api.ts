import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Pomocnicy przygotowania danych dla testów E2E: omijają interfejs tam, gdzie test nie dotyczy danej ścieżki
 * (konta, szkoła, dane startowe), żeby scenariusze były krótkie i stabilne. Wszystkie dane są unikalne dla testu
 * (losowe adresy), więc testy nie przeszkadzają sobie przy uruchomieniu równoległym i nie wymagają sprzątania.
 */
export const API_URL = "http://127.0.0.1:54321";
export const MAILPIT_URL = "http://127.0.0.1:54324";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const PASSWORD = "Haslo-E2E-12345";

export const adminDb = (): SupabaseClient => createClient(API_URL, SERVICE_KEY, noSession);

export type Account = { id: string; email: string; password: string; db: SupabaseClient };

const unique = () => crypto.randomUUID().slice(0, 8);

/** Konto z potwierdzonym adresem i zalogowany klient bazy (RLS obowiązuje, jak w aplikacji). */
export async function createAccount(label: string, metadata: Record<string, unknown> = {}): Promise<Account> {
  const email = `e2e-${label}-${unique()}@example.test`;
  const created = await adminDb().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}`, ...metadata },
  });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const db = createClient(API_URL, ANON_KEY, noSession);
  const signedIn = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`);
  return { id: created.data.user.id, email, password: PASSWORD, db };
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? "brak danych"}`);
  return result.data;
}

export type School = { id: string; name: string; sessionTypeId: string; sessionTypeName: string };

/** Szkoła z właścicielem, jednym rodzajem zajęć i jednym szablonem pakietu (jak po pierwszym dniu pracy trenera). */
export async function createSchool(owner: Account, label = "szkola"): Promise<School> {
  const name = `Szkoła ${label} ${unique()}`;
  const id = must(await owner.db.rpc("create_organization", { p_name: name, p_slug: `e2e-${label}-${unique()}` }), "create_organization") as string;
  const sessionTypeName = "Trening indywidualny";
  const type = must(
    await owner.db
      .from("session_types")
      .insert({ organization_id: id, name: sessionTypeName, duration_minutes: 60, default_price_minor: 10000 })
      .select("id")
      .single(),
    "session_types",
  ) as { id: string };
  must(
    await owner.db
      .from("package_templates")
      .insert({ organization_id: id, name: "Pakiet 10", sessions_count: 10, price_minor: 80000 })
      .select("id")
      .single(),
    "package_templates",
  );
  return { id, name, sessionTypeId: type.id, sessionTypeName };
}

export type ClientRecord = { id: string; firstName: string; lastName: string; email: string };

export async function addClient(owner: Account, schoolId: string, firstName = "Anna", lastName = `Kowalska${unique()}`): Promise<ClientRecord> {
  const email = `e2e-klient-${unique()}@example.test`;
  const row = must(
    await owner.db.from("clients").insert({ organization_id: schoolId, first_name: firstName, last_name: lastName, email }).select("id").single(),
    "clients",
  ) as { id: string };
  return { id: row.id, firstName, lastName, email };
}

export async function addDog(owner: Account, schoolId: string, clientId: string, name = "Burek"): Promise<string> {
  const row = must(
    await owner.db.from("dogs").insert({ organization_id: schoolId, client_id: clientId, name, breed: "Labrador" }).select("id").single(),
    "dogs",
  ) as { id: string };
  return row.id;
}

/** Sprzedaje pakiet klientowi (funkcja SQL, jak z formularza); zwraca identyfikator pakietu. */
export async function sellPackage(owner: Account, schoolId: string, clientId: string, sessions = 10, priceMinor = 80000): Promise<string> {
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return must(
    await owner.db.rpc("sell_package", {
      p_org: schoolId,
      p_client: clientId,
      p_dog: null,
      p_template: null,
      p_name: "Pakiet 10",
      p_sessions: sessions,
      p_price_minor: priceMinor,
      p_currency: null,
      p_valid_from: null,
      p_valid_until: null,
      p_due_date: due,
    }),
    "sell_package",
  ) as string;
}

/** Daje kontu dostęp do panelu klienta wskazanej kartoteki (jak po przyjęciu zaproszenia). */
export async function grantPortalAccess(schoolId: string, clientId: string, userId: string): Promise<void> {
  const { error } = await adminDb().from("client_access").insert({ organization_id: schoolId, client_id: clientId, user_id: userId, relation: "owner" });
  if (error) throw new Error(`client_access: ${error.message}`);
}

/** Zdejmuje 30-sekundowe okno „Cofnij” z oczekujących zdarzeń, żeby test nie czekał, i uruchamia procesor powiadomień. */
export async function processNotifications(baseUrl: string, cronSecret: string): Promise<void> {
  await adminDb().from("outbox_events").update({ not_before: null }).is("processed_at", null);
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/api/cron/outbox`, { headers: { authorization: `Bearer ${cronSecret}` } });
    const body = (await res.json()) as { claimed?: number };
    if (res.status !== 200) throw new Error(`cron/outbox: status ${res.status}`);
    if (!body.claimed) return;
  }
}

/**
 * Czeka, aż w kolejce powiadomień szkoły pojawi się zdarzenie danego typu. Akcje serwerowe kończą się już po zamknięciu okna
 * potwierdzenia, więc test nie powinien uruchamiać procesora, zanim zdarzenie powstanie.
 */
export async function waitForEvent(schoolId: string, type: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await adminDb().from("outbox_events").select("id").eq("organization_id", schoolId).eq("type", type).is("processed_at", null).limit(1);
    if (data && data.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Zdarzenie ${type} nie pojawiło się w ${timeoutMs} ms`);
}

/** Ostatnia wiadomość e-mail do adresu z lokalnej poczty (Mailpit); null, gdy jej nie ma. */
export async function lastEmailTo(address: string): Promise<{ subject: string; text: string } | null> {
  const search = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json()) as { messages?: { ID: string }[] };
  const id = search.messages?.[0]?.ID;
  if (!id) return null;
  const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { Subject: string; Text: string };
  return { subject: detail.Subject, text: detail.Text };
}
