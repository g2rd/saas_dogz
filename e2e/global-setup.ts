import { adminDb, MAILPIT_URL } from "./support/api";

/** Przed testami: baza i poczta lokalna działają, a rejestracja jest otwarta (test integracyjny panelu mógł ją zamknąć). */
export default async function globalSetup() {
  const db = adminDb();
  const { error } = await db.from("platform_settings").select("key").limit(1);
  if (error) throw new Error(`Lokalny Supabase nie odpowiada (${error.message}). Uruchom go: npm run db:start`);

  const update = await db.from("platform_settings").update({ value: "open" }).eq("key", "signup_mode");
  if (update.error) throw new Error(`Nie udało się otworzyć rejestracji: ${update.error.message}`);

  const mail = await fetch(`${MAILPIT_URL}/api/v1/info`).catch(() => null);
  if (!mail?.ok) throw new Error("Lokalna poczta (Mailpit) nie odpowiada. Uruchom Supabase: npm run db:start");
}
