import { expect, test } from "@playwright/test";
import { addClient, createAccount, createSchool, grantPortalAccess } from "./support/api";
import { makePlatformAdmin, setSchoolStatus } from "./support/platform";
import { alertOf, login } from "./support/ui";

test.describe("dostęp i blokady szkoły", () => {
  test("zawieszona szkoła: trener i klient widzą ekran blokady z powodem, po przywróceniu wracają do pracy", async ({ browser }) => {
    const owner = await createAccount("zawieszony");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Klient", "Zawieszony");
    const clientAccount = await createAccount("klient-zawieszony");
    await grantPortalAccess(school.id, client.id, clientAccount.id);

    const trainerContext = await browser.newContext({ locale: "pl-PL" });
    const trainer = await trainerContext.newPage();
    await login(trainer, owner.email, owner.password, /\/app/);
    const clientContext = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await clientContext.newPage();
    await login(clientPage, clientAccount.email, clientAccount.password, /\/portal/);

    await setSchoolStatus(school.id, "suspended", "Koniec okresu testów");

    await trainer.goto("/app/clients");
    await expect(trainer).toHaveURL(/\/suspended/);
    await expect(trainer.getByRole("heading", { name: "Konto zawieszone" })).toBeVisible();
    await expect(trainer.getByText(/Koniec okresu testów/)).toBeVisible();

    await clientPage.goto("/portal");
    await expect(clientPage).toHaveURL(/\/suspended/);
    await expect(clientPage.getByRole("heading", { name: "Szkoła chwilowo niedostępna" })).toBeVisible();

    // Przywrócenie: dostęp wraca bez ponownego logowania
    await setSchoolStatus(school.id, "active");
    await trainer.goto("/app/clients");
    await expect(trainer).toHaveURL(/\/app\/clients/);
    await clientPage.goto("/portal");
    await expect(clientPage).toHaveURL(/\/portal$/);
    await trainerContext.close();
    await clientContext.close();
  });

  test("tryb tylko do odczytu: trener widzi baner z powodem i nie zapisze zmian @mobile", async ({ page }) => {
    const owner = await createAccount("readonly");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);
    await setSchoolStatus(school.id, "read_only", "Brak płatności");

    await page.goto("/app/clients");
    await expect(page.getByText(/tylko do odczytu/i).first()).toBeVisible();

    await page.goto("/app/clients/new");
    await page.getByLabel("Imię", { exact: true }).fill("Nie");
    await page.getByLabel("Nazwisko").fill("Zapisze");
    await page.getByRole("button", { name: "Dodaj klienta" }).click();
    await expect(alertOf(page).first()).toContainText(/tylko do odczytu|nie można zapisać/i);
    await expect(page).toHaveURL(/\/app\/clients\/new/);

    // Dane do odczytu nadal są dostępne
    await page.goto("/app/clients");
    await expect(page.getByRole("heading", { name: "Klienci" })).toBeVisible();
  });

  test("panel właściciela: zwykły trener dostaje 404, właściciel platformy widzi listę szkół", async ({ browser }) => {
    const trainer = await createAccount("zwykly");
    await createSchool(trainer);
    const admin = await createAccount("wlasciciel");
    const adminSchool = await createSchool(admin, "adminowa");
    await makePlatformAdmin(admin);

    const trainerContext = await browser.newContext({ locale: "pl-PL" });
    const trainerPage = await trainerContext.newPage();
    await login(trainerPage, trainer.email, trainer.password, /\/app/);
    // Strona 404 (przy strumieniowaniu kod odpowiedzi może być 200, ale treść jest taka sama i nie zdradza, że panel istnieje)
    await trainerPage.goto("/admin");
    await expect(trainerPage.getByRole("heading", { name: "Nie znaleziono strony" })).toBeVisible();
    await trainerContext.close();

    const adminContext = await browser.newContext({ locale: "pl-PL" });
    const adminPage = await adminContext.newPage();
    await login(adminPage, admin.email, admin.password, /\/app/);
    await adminPage.goto("/admin");
    await expect(adminPage.getByText("Szkoły").first()).toBeVisible();
    await expect(adminPage.getByText(adminSchool.name)).toBeVisible();
    await adminContext.close();
  });
});
