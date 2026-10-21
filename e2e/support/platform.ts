import { adminDb, type Account } from "./api";

/** Nadaje kontu uprawnienia właściciela platformy (dostęp do /admin). */
export async function makePlatformAdmin(account: Account): Promise<void> {
  const { error } = await adminDb().from("platform_admins").insert({ user_id: account.id, note: "e2e" });
  if (error) throw new Error(`platform_admins: ${error.message}`);
}

/** Ustawia status szkoły jak właściciel platformy (z pominięciem interfejsu); powód widzi trener. */
export async function setSchoolStatus(
  schoolId: string,
  status: "trial" | "active" | "read_only" | "suspended",
  reason: string | null = null,
): Promise<void> {
  const { error } = await adminDb().from("organizations").update({ status, status_reason: reason }).eq("id", schoolId);
  if (error) throw new Error(`organizations.status: ${error.message}`);
}
