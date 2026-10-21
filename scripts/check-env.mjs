// Sprawdza zmienne środowiskowe wdrożenia przed wklejeniem do Vercel (albo po wyeksportowaniu z Vercel).
// Użycie:  npm run env:check -- --file .env.staging [--target production]
//          npm run env:check                     (czyta zmienne z bieżącego środowiska)
// Wartości zmiennych nigdy nie są wypisywane; plik z sekretami (.env.*) jest ignorowany przez git.
import { readFileSync } from "node:fs";
import { validateEnv } from "./env-check-lib.mjs";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at !== -1 ? args[at + 1] : undefined;
};

/** Minimalny parser dotenv: `KLUCZ=wartość`, cudzysłowy opcjonalne, komentarze `#`. */
function parseDotenv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

const file = valueOf("--file");
const target = valueOf("--target") === "production" ? "production" : "staging";
let env = process.env;
if (file) {
  try {
    env = parseDotenv(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Nie można odczytać pliku ${file}: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
}

const { errors, warnings, ok } = validateEnv(env, { target });
console.log(`Kontrola zmiennych (${target}${file ? `, plik ${file}` : ", bieżące środowisko"}):`);
for (const line of ok) console.log(`  OK       ${line}`);
for (const line of warnings) console.log(`  OSTRZEŻ. ${line}`);
for (const line of errors) console.log(`  BŁĄD     ${line}`);
console.log(`\nPoprawne: ${ok.length}, ostrzeżenia: ${warnings.length}, błędy: ${errors.length}`);
process.exit(errors.length > 0 ? 1 : 0);
