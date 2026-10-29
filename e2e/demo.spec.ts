import { expect, test } from "@playwright/test";
import { addClient, adminDb, createAccount, createSchool, lastEmailTo, sellPackage } from "./support/api";
import { makePlatformAdmin } from "./support/platform";
import { login } from "./support/ui";

test.describe("sterowanie demo", () => {
  test("właściciel platformy wysyła powiadomienie testowe i przewija czas, a reguły dzienne tworzą przypomnienia", async ({ page }) => {
    const trainer = await createAccount("demo-trener");
    const school = await createSchool(trainer, "demo");
    const client = await addClient(trainer, school.id, "Ola", "Demonstracyjna");
    const packageId = await sellPackage(trainer, school.id, client.id, 5, 40000);
    const admin = await createAccount("demo-wlasciciel");
    await makePlatformAdmin(admin);

    await login(page, admin.email, admin.password, /\/admin/);
    await page.getByRole("link", { name: "Demo" }).click();
    await expect(page.getByRole("heading", { name: "Sterowanie demo" })).toBeVisible();

    // Powiadomienie testowe: właściciel szkoły dostaje e-mail od razu (bez okna „Cofnij” i bez czekania na harmonogram)
    await page.getByLabel("Szkoła").selectOption({ label: school.name });
    await page.getByRole("button", { name: "Wyślij powiadomienie testowe" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Wysłano powiadomienie testowe" })).toBeVisible();
    await expect.poll(async () => (await lastEmailTo(trainer.email))?.subject ?? "", { timeout: 15_000 }).toBe("Powiadomienie testowe");

    // Przewijanie czasu: zajęcia za 49 godzin, po „upływie” 2 dni zostaje godzina, więc reguła przypomnienia dopisuje zdarzenie
    const startsAt = new Date(Date.now() + 49 * 3600_000);
    const session = await trainer.db.rpc("schedule_session", {
      p_org: school.id,
      p_type: school.sessionTypeId,
      p_trainer: trainer.id,
      p_starts_at: startsAt.toISOString(),
      p_location: null,
      p_client: client.id,
      p_dog: null,
    });
    expect(session.error).toBeNull();
    expect(packageId).toBeTruthy();
    await page.getByLabel("Ile dni do przodu").fill("2");
    await page.getByRole("button", { name: "Symuluj upływ czasu" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Symulacja +2 dni" })).toBeVisible();
    const { data: reminders } = await adminDb().from("outbox_events").select("id").eq("organization_id", school.id).eq("type", "training_session.reminder");
    expect(reminders?.length).toBeGreaterThan(0);

    // Zła liczba dni jest odrzucana z komunikatem
    await page.getByLabel("Ile dni do przodu").fill("0");
    await page.getByRole("button", { name: "Symuluj upływ czasu" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "od 1 do 60" })).toBeVisible();
  });

  test("zwykły trener nie widzi sterowania demo (404)", async ({ page }) => {
    const trainer = await createAccount("demo-bez-dostepu");
    await createSchool(trainer);
    await login(page, trainer.email, trainer.password, /\/app/);
    await page.goto("/admin/demo");
    await expect(page.getByRole("heading", { name: "Nie znaleziono strony" })).toBeVisible();
  });
});
