// Kopia danych lokalnego Supabase przed `db:reset` albo ryzykownymi testami: `npm run db:backup`.
// Zapisuje dane (konta, szkoły, klientów, pakiety...) do backups/dane-RRRRMMDD-GGMMSS.sql (folder poza gitem).
// Odtwarzanie (po `npm run db:reset`, który zakłada czysty schemat): `npm run db:restore -- backups/plik.sql`.
import { mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const file = `backups/dane-${stamp}.sql`;
const result = spawnSync(`npx supabase db dump --local --data-only --use-copy -f ${file}`, { stdio: "inherit", shell: true });
if (result.status !== 0) {
  console.error("Kopia się nie powiodła. Czy lokalny Supabase działa (npm run db:start)?");
  process.exit(result.status ?? 1);
}
console.log(`Kopia zapisana: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
