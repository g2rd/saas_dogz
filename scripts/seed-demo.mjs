// Dane demonstracyjne dla panelu właściciela /admin (tylko lokalnie!). Wykonuje scripts/seed-demo.sql w lokalnej bazie
// (kontener Dockera `supabase_db_dogtrainer`). Uruchomienie: `npm run seed:demo`. Powtórzenie odtwarza dane demo od nowa.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const url = (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
  .split(/\r?\n/)
  .find((line) => line.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
  ?.slice("NEXT_PUBLIC_SUPABASE_URL=".length);
if (!url?.startsWith("http://127.0.0.1") && !url?.startsWith("http://localhost")) {
  console.error(`Odmowa: to nie jest lokalny Supabase (${url ?? "brak adresu"}). Skrypt jest tylko do pracy lokalnej.`);
  process.exit(1);
}

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_dogtrainer";
const result = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
  { input: readFileSync("scripts/seed-demo.sql"), stdio: ["pipe", "inherit", "inherit"] },
);
if (result.status !== 0) {
  console.error("Nie udało się załadować danych demo (czy działa lokalny Supabase i Docker?).");
  process.exit(result.status ?? 1);
}
console.log("Dane demo gotowe: 10 szkół (próbne, aktywne, tylko do odczytu, zawieszona). Hasło kont demo: Demo-Haslo-2026");
console.log("Przykładowe loginy: wlasciciel.burek@demo.example.test, trener1.burek@demo.example.test, klient1.burek@demo.example.test");
