// Odtwarza komplet kont i danych testowych na LOKALNYM Supabase jednym poleceniem: `npm run seed:local`.
// Idempotentne: można uruchamiać po każdym `db:reset` (albo gdy czegoś brakuje); istniejące konta dostają znane hasło z listy poniżej,
// dane startowe powstają tylko raz. Odmawia pracy na zdalnym Supabase.
//
//   trener@example.test     Dev-Haslo-12345      trener-właściciel szkoły „Szkoła Łapa” (panel /app; NIE jest właścicielem platformy)
//   admin@example.test      Admin-Haslo-12345    właściciel platformy: osobne konto bez szkoły, po zalogowaniu panel /admin
//   anna@example.pl         Klient-Haslo-2026    klientka Anna Kowalska z dostępem do panelu /portal
//   seedcheck@example.test  Seed-Check-Pass-1    drugi trener, osobna szkoła „Szkoła Kontrolna” (test izolacji danych między szkołami)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const TEST_USERS = {
  trainer: { email: "trener@example.test", password: "Dev-Haslo-12345", name: "Trener Testowy" },
  client: { email: "anna@example.pl", password: "Klient-Haslo-2026", name: "Anna Kowalska" },
  second: { email: "seedcheck@example.test", password: "Seed-Check-Pass-1", name: "Drugi Trener" },
  admin: { email: "admin@example.test", password: "Admin-Haslo-12345", name: "Właściciel Platformy" },
};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.startsWith("http://127.0.0.1") && !url?.startsWith("http://localhost")) {
  throw new Error(`Odmowa: to nie jest lokalny Supabase (${url}). Skrypt jest tylko do pracy lokalnej.`);
}
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, noSession);

// Bieżąca wersja regulaminu: konta bez zgody na nią trafiałyby najpierw na ekran ponownej zgody
const legalVersion = /LEGAL_VERSION\s*=\s*"(\d{4}-\d{2}-\d{2})"/.exec(readFileSync("src/shared/legal.ts", "utf8"))?.[1] ?? "2026-10-21";

const must = (result, what) => {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
};

/** Konto o znanym haśle: tworzy albo ustawia hasło istniejącemu; zwraca identyfikator. */
async function ensureUser({ email, password, name }) {
  const list = must(await admin.auth.admin.listUsers({ perPage: 1000 }), "listUsers");
  const existing = list.users.find((user) => user.email === email);
  if (existing) {
    must(await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true }), `updateUser ${email}`);
    return existing.id;
  }
  const created = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, consent_version: legalVersion } }),
    `createUser ${email}`,
  );
  return created.user.id;
}

async function ensureConsent(userId) {
  const rows = ["terms", "privacy"].map((document) => ({ user_id: userId, document, version: legalVersion }));
  must(await admin.from("consents").upsert(rows, { onConflict: "user_id,document,version", ignoreDuplicates: true }), "consents");
}

// 1. Trener i jego szkoła z danymi (klienci, psy, pakiet, zajęcia): istniejący skrypt, idempotentny
console.log("1/5 Trener i dane szkoły „Szkoła Łapa”");
await ensureUser(TEST_USERS.trainer);
const seeded = spawnSync(process.execPath, ["scripts/seed-dev.mjs"], { stdio: "inherit", env: { ...process.env, SEED_PASSWORD: TEST_USERS.trainer.password } });
if (seeded.status !== 0) throw new Error("seed-dev nie powiódł się (patrz komunikat powyżej)");
const trainerId = await ensureUser(TEST_USERS.trainer);
await ensureConsent(trainerId);
// Konto trenera nie jest właścicielem platformy (wcześniejsze lokalne nadanie cofamy); właściciel to osobne konto z kroku 4
must(await admin.from("platform_admins").delete().eq("user_id", trainerId), "platform_admins");

// 2. Klientka Anna z dostępem do panelu klienta
console.log("2/5 Klientka Anna Kowalska (panel /portal)");
const clientId = await ensureUser(TEST_USERS.client);
await ensureConsent(clientId);
const annaRecord = must(await admin.from("clients").select("id, organization_id").eq("email", TEST_USERS.client.email).limit(1), "clients");
if (annaRecord.length === 0) throw new Error("Brak kartoteki Anny w szkole trenera (seed-dev nie utworzył danych?)");
must(
  await admin
    .from("client_access")
    .upsert({ organization_id: annaRecord[0].organization_id, client_id: annaRecord[0].id, user_id: clientId, relation: "owner", status: "active" }, { onConflict: "client_id,user_id" }),
  "client_access",
);

// 3. Drugi trener z osobną szkołą (do sprawdzania izolacji danych)
console.log("3/5 Drugi trener i szkoła „Szkoła Kontrolna”");
const secondId = await ensureUser(TEST_USERS.second);
await ensureConsent(secondId);
const membership = must(await admin.from("organization_members").select("organization_id").eq("user_id", secondId).limit(1), "members");
if (membership.length === 0) {
  const asSecond = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, noSession);
  must(await asSecond.auth.signInWithPassword({ email: TEST_USERS.second.email, password: TEST_USERS.second.password }), "signIn drugiego trenera");
  const orgId = must(await asSecond.rpc("create_organization", { p_name: "Szkoła Kontrolna", p_slug: `szkola-kontrolna-${randomBytes(2).toString("hex")}` }), "create_organization");
  const [zenon] = must(await asSecond.from("clients").insert({ organization_id: orgId, first_name: "Zenon", last_name: "Kontrolny", email: "zenon@example.pl" }).select(), "clients");
  must(await asSecond.from("dogs").insert({ organization_id: orgId, client_id: zenon.id, name: "Kontrolny", breed: "Owczarek" }), "dogs");
} else {
  console.log("   szkoła już istnieje, pomijam");
}

// 4. Właściciel platformy: osobne konto, bez szkoły i panelu klienta
console.log("4/5 Właściciel platformy (osobne konto, panel /admin)");
const ownerId = await ensureUser(TEST_USERS.admin);
await ensureConsent(ownerId);
must(await admin.from("platform_admins").upsert({ user_id: ownerId, note: "konto testowe lokalnie" }, { onConflict: "user_id" }), "platform_admins");

// 5. Podsumowanie
console.log("5/5 Gotowe. Konta testowe:");
for (const [role, user] of Object.entries(TEST_USERS)) console.log(`   ${role.padEnd(8)} ${user.email.padEnd(24)} ${user.password}`);
console.log("   Aplikacja: http://localhost:3000, poczta: http://127.0.0.1:54324");
