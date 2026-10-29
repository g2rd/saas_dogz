import { expect, test } from "@playwright/test";
import { addClient, createAccount, createSchool } from "./support/api";
import { confirmDialog, isoInDays, login, openSection } from "./support/ui";

/**
 * Dzień pracy trenera od początku do końca: nowy klient i pies, sprzedaż pakietu, wpłata, zaplanowanie i zakończenie zajęć.
 * Sprawdza, że saldo pakietu i należności zmieniają się tak, jak widzi to użytkownik.
 */
test.describe("trener", () => {
  test("klient, pies, pakiet, wpłata, zajęcia i zakończenie zajęć zużywają pakiet @mobile", async ({ page }) => {
    const owner = await createAccount("trener");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    // 1. Nowy klient z formularza
    await page.goto("/app/clients/new");
    await page.getByLabel("Imię", { exact: true }).fill("Anna");
    await page.getByLabel("Nazwisko").fill("Testowa");
    await page.getByLabel("E-mail").fill(`anna-${Date.now()}@example.test`);
    await page.getByLabel("Telefon").fill("600100200");
    await page.getByRole("button", { name: "Dodaj klienta" }).click();
    await expect(page.getByRole("heading", { name: "Anna Testowa" })).toBeVisible();
    const clientUrl = page.url();

    // 2. Pies klienta
    await openSection(page, "Dodaj psa");
    await page.getByLabel("Imię psa").fill("Burek");
    await page.getByLabel("Rasa").fill("Labrador");
    await page.getByRole("button", { name: "Dodaj psa" }).click();
    await page.goto(clientUrl);
    await expect(page.getByText("Burek").first()).toBeVisible();

    // 3. Sprzedaż pakietu z szablonu: powstaje pakiet 10 zajęć i należność 800 zł
    await openSection(page, "Sprzedaj pakiet");
    await page.getByLabel("Szablon pakietu").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Sprzedaj pakiet" }).click();
    await confirmDialog(page, /Sprzedaj/);
    await expect(page.getByText(/10 z 10|10 zajęć/).first()).toBeVisible();
    await expect(page.getByText(/Do zapłaty:/).first()).toContainText(/800,00/);

    // 4. Wpłata 300 zł zmniejsza należność do 500 zł
    await openSection(page, "Zaksięguj wpłatę");
    await page.getByLabel("Kwota").fill("300");
    await page.getByRole("button", { name: "Zaksięguj wpłatę" }).click();
    await confirmDialog(page, "Zaksięguj");
    await expect(page.getByText(/Do zapłaty:/).first()).toContainText(/500,00/);

    // 5. Zajęcia na jutro o 10:00
    await page.goto("/app/sessions/new");
    await page.getByLabel("Klient").selectOption({ label: "Anna Testowa" });
    const typeValue = await page.getByLabel("Rodzaj zajęć").locator("option", { hasText: school.sessionTypeName }).getAttribute("value");
    await page.getByLabel("Rodzaj zajęć").selectOption(typeValue!);
    await page.getByLabel("Data").fill(isoInDays(1));
    await page.getByLabel("Godzina").fill("10:00");
    await page.getByRole("button", { name: "Zaplanuj zajęcia" }).click();
    await expect(page).toHaveURL(/\/app\/sessions$/);
    await expect(page.getByText("Anna Testowa").first()).toBeVisible();

    // 6. Zakończenie zajęć zużywa jedno zajęcie z pakietu
    await page.getByRole("button", { name: "Zakończ zajęcia" }).first().click();
    await confirmDialog(page, /Zakończ|Rozlicz/);
    await expect(page.getByText("Brak zaplanowanych zajęć w najbliższych dniach.")).toBeVisible();
    await page.goto(clientUrl);
    await expect(page.getByText(/9 z 10|zostało 9/i).first()).toBeVisible();
  });

  test("lista klientów: wyszukiwanie, archiwizacja i przywrócenie", async ({ page }) => {
    const owner = await createAccount("archiwum");
    const school = await createSchool(owner);
    const keep = await addClient(owner, school.id, "Marta", "Zostaje");
    const archive = await addClient(owner, school.id, "Piotr", "Archiwalny");
    await login(page, owner.email, owner.password, /\/app/);

    await page.goto("/app/clients");
    await expect(page.getByText(`${keep.firstName} ${keep.lastName}`)).toBeVisible();
    await expect(page.getByText(`${archive.firstName} ${archive.lastName}`)).toBeVisible();

    // Wyszukiwanie po fragmencie nazwiska
    await page.getByRole("searchbox").or(page.getByPlaceholder(/Szukaj/)).fill("Archiwalny");
    await page.getByRole("button", { name: "Szukaj" }).click();
    await expect(page.getByText(`${archive.firstName} ${archive.lastName}`)).toBeVisible();
    await expect(page.getByText(`${keep.firstName} ${keep.lastName}`)).toHaveCount(0);

    // Archiwizacja znika z listy aktywnych, widać ją po zaznaczeniu „Pokaż archiwalnych”
    await page.getByText(`${archive.firstName} ${archive.lastName}`).click();
    await page.getByRole("button", { name: "Archiwizuj" }).click();
    await confirmDialog(page, /Archiwizuj/);
    await page.goto("/app/clients");
    await expect(page.getByText(`${archive.firstName} ${archive.lastName}`)).toHaveCount(0);
    await page.getByLabel("Pokaż archiwalnych").check();
    await page.getByRole("button", { name: "Szukaj" }).click();
    await expect(page.getByText(`${archive.firstName} ${archive.lastName}`)).toBeVisible();
  });
});
