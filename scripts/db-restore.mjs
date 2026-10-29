// Wczytuje kopię z `npm run db:backup` do lokalnej bazy: `npm run db:restore -- backups/plik.sql`.
// Zakłada czysty schemat (najpierw `npm run db:reset`); wyzwalacze są wyłączone na czas ładowania (session_replication_role = replica).
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Podaj plik kopii: npm run db:restore -- backups/dane-....sql");
  process.exit(1);
}
const result = spawnSync("docker", ["exec", "-i", "supabase_db_dogtrainer", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: readFileSync(file),
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(result.status ?? 1);
