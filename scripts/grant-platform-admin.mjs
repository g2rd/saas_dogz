// Nadaje (albo odbiera) uprawnienia właściciela platformy (dostęp do /admin) istniejącemu kontem.
// Użycie:  npm run admin:grant -- adres@example.pl            nadaje
//          npm run admin:grant -- adres@example.pl --revoke   odbiera
// Zmienne bierze z .env.local (lokalny Supabase) albo z zmiennych środowiskowych (SUPABASE_URL i klucz service_role dla
// środowiska zdalnego: ustaw je tylko na czas tego polecenia i nigdy nie zapisuj w repozytorium).
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email || email.startsWith("--")) {
  console.error("Podaj adres e-mail konta: npm run admin:grant -- adres@example.pl [--revoke]");
  process.exit(1);
}

const fileEnv = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    )
  : {};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Brak NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY (.env.local albo zmienne środowiskowe).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; page <= 50 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`Nie udało się pobrać użytkowników: ${error.message}`);
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`Nie znaleziono konta ${email}. Najpierw załóż je (rejestracja z kodem), potem nadaj uprawnienia.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await db.from("platform_admins").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
  console.log(`Odebrano uprawnienia właściciela platformy: ${email}`);
} else {
  const { error } = await db.from("platform_admins").upsert({ user_id: user.id, note: "nadane skryptem admin:grant" });
  if (error) throw new Error(error.message);
  console.log(`Nadano uprawnienia właściciela platformy: ${email}. Panel: /admin`);
}
