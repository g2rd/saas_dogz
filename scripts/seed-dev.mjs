// Dane deweloperskie dla lokalnego Supabase (tylko lokalnie!): konto trenera, organizacja, klienci, psy,
// rodzaje zajęć, pakiet, zajęcia na dziś i kolejne dni. Uruchomienie: `npm run seed:dev`.
// Hasło konta: zmienna SEED_PASSWORD (gdy brak, losowe; zostanie wypisane raz w konsoli).
// Skrypt jest idempotentny: gdy konto ma już organizację, nic nie dodaje.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SEED_EMAIL = process.env.SEED_EMAIL ?? "trener@example.test";
const password = process.env.SEED_PASSWORD ?? randomBytes(12).toString("base64url");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.startsWith("http://127.0.0.1") && !url?.startsWith("http://localhost")) {
  throw new Error(`Odmowa: to nie jest lokalny Supabase (${url}). Skrypt jest tylko do pracy lokalnej.`);
}

// 1. Konto trenera (Auth Admin API, klucz service_role z .env.local, tylko lokalnie)
const created = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ email: SEED_EMAIL, password, email_confirm: true }),
});
if (created.ok) console.log(`Utworzono konto ${SEED_EMAIL}. Hasło: ${password}`);
else if (created.status === 422) console.log(`Konto ${SEED_EMAIL} już istnieje (użyj SEED_PASSWORD, jeśli znasz hasło).`);
else throw new Error(`Nie udało się utworzyć konta: ${created.status} ${await created.text()}`);

// 2. Dane w kontekście trenera (RLS obowiązuje, jak w aplikacji)
const db = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await db.auth.signInWithPassword({ email: SEED_EMAIL, password });
if (login.error) throw new Error(`Logowanie nie powiodło się (ustaw SEED_PASSWORD): ${login.error.message}`);
const userId = login.data.user.id;

const existing = await db.from("organization_members").select("organization_id").eq("user_id", userId).limit(1);
if (existing.data?.length) {
  console.log("Konto ma już organizację, pomijam dane demonstracyjne.");
  process.exit(0);
}

const must = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};

const orgId = must(await db.rpc("create_organization", { p_name: "Szkoła Łapa", p_slug: `szkola-lapa-${randomBytes(2).toString("hex")}` }));
const insert = async (table, rows) => must(await db.from(table).insert(rows).select());

const [anna, piotr, marta] = await insert("clients", [
  { organization_id: orgId, first_name: "Anna", last_name: "Kowalska", email: "anna@example.pl", phone: "+48600100200" },
  { organization_id: orgId, first_name: "Piotr", last_name: "Nowak" },
  { organization_id: orgId, first_name: "Marta", last_name: "Zielińska" },
]);
const [burek, luna] = await insert("dogs", [
  { organization_id: orgId, client_id: anna.id, name: "Burek", breed: "Border collie" },
  { organization_id: orgId, client_id: piotr.id, name: "Luna", breed: "Labrador" },
]);
const [consult, training] = await insert("session_types", [
  { organization_id: orgId, name: "Konsultacja", duration_minutes: 30, default_price_minor: 6000 },
  { organization_id: orgId, name: "Trening indywidualny", duration_minutes: 60, default_price_minor: 10000 },
]);
await insert("package_templates", [
  { organization_id: orgId, name: "Pakiet 10 zajęć", sessions_count: 10, validity_days: 90, price_minor: 80000 },
  { organization_id: orgId, name: "Pakiet 5 zajęć", sessions_count: 5, validity_days: 60, price_minor: 40000 },
]);

must(
  await db.rpc("sell_package", {
    p_org: orgId, p_client: anna.id, p_dog: burek.id, p_template: null, p_name: "Pakiet 5 zajęć", p_sessions: 5,
    p_price_minor: 40000, p_currency: "PLN", p_valid_from: null, p_valid_until: null, p_due_date: null,
  }),
);

// Zajęcia: dziś o 10:00 i 12:00 (czas warszawski, lato/zima: pomijamy, wystarczy przybliżenie UTC), jutro i za dwa dni
const at = (days, hourUtc) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};
const sessions = [
  [training.id, anna, burek, at(0, 8)],
  [consult.id, piotr, luna, at(0, 10)],
  [training.id, marta, null, at(1, 8)],
  [training.id, anna, burek, at(2, 15)],
];
for (const [type, client, dog, startsAt] of sessions) {
  must(
    await db.rpc("schedule_session", {
      p_org: orgId, p_type: type, p_trainer: userId, p_starts_at: startsAt, p_location: "Park", p_client: client.id,
      p_dog: dog?.id ?? null,
    }),
  );
}

console.log(`Gotowe: organizacja ${orgId}, 3 klientów, 2 psy, pakiet dla Anny, 4 zajęcia.`);
