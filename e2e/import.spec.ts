import { expect, test } from "@playwright/test";
import { createAccount, createSchool } from "./support/api";
import { login } from "./support/ui";

const stamp = () => crypto.randomUUID().slice(0, 6);

test.describe("import klientów z pliku", () => {
  test("podgląd pokazuje wiersze i problemy, zapis dodaje klientów i psy, ponowny import niczego nie dubluje @mobile", async ({ page }) => {
    const owner = await createAccount("import");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    const tag = stamp();
    const csv = [
      "Imię;Nazwisko;E-mail;Telefon;Pies;Rasa",
      `Ewa;Import${tag};ewa-${tag}@example.test;600 111 222;Reksio;Owczarek`,
      `Adam;Import${tag};;;;`,
      `;Bez imienia;;;;`,
    ].join("\n");

    await page.goto("/app/clients/import");
    await page.getByLabel("Albo wklej dane").fill(csv);
    await page.getByRole("button", { name: "Sprawdź plik" }).click();

    await expect(page.getByText(/Do zaimportowania: 2 z 3 wierszy, w tym 1 pies/)).toBeVisible();
    await expect(page.getByText(/1 wiersz pominięty/)).toBeVisible();
    await page.getByText(/1 wiersz pominięty/).click();
    await expect(page.getByText(/Wiersz 4: brak imienia/)).toBeVisible();

    await page.getByRole("button", { name: /Importuj 2 klientów/ }).click();
    await expect(page.getByText(/Zaimportowano 2 klientów i 1 psa/)).toBeVisible();

    // Klienci są na liście, pies przy kartotece
    await page.getByRole("link", { name: "Przejdź do listy klientów" }).click();
    await expect(page.getByText(`Ewa Import${tag}`)).toBeVisible();
    await expect(page.getByText(`Adam Import${tag}`)).toBeVisible();
    await page.getByText(`Ewa Import${tag}`).click();
    await expect(page.getByText("Reksio").first()).toBeVisible();

    // Ten sam plik drugi raz: nikt nowy do dodania
    await page.goto("/app/clients/import");
    await page.getByLabel("Albo wklej dane").fill(csv);
    await page.getByRole("button", { name: "Sprawdź plik" }).click();
    await page.locator("summary").filter({ hasText: /pominięt/ }).click();
    await expect(page.getByText(/już jest w szkole/).first()).toBeVisible();
  });

  test("plik bez kolumny imienia jest odrzucany z wyjaśnieniem", async ({ page }) => {
    const owner = await createAccount("import-blad");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);
    await page.goto("/app/clients/import");
    await page.getByLabel("Albo wklej dane").fill("Telefon\n600100200");
    await page.getByRole("button", { name: "Sprawdź plik" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "kolumny z imieniem" })).toBeVisible();
  });
});
