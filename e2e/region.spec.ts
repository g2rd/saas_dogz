import { expect, test } from "@playwright/test";
import { adminDb, createAccount, createSchool } from "./support/api";
import { login } from "./support/ui";

test.describe("region i numery telefonów", () => {
  test("region z „Więcej” zmienia kraj numerów bez prefiksu i zapisuje się w profilu, a „Automatycznie” wraca do kraju z urządzenia @mobile", async ({ page }) => {
    const owner = await createAccount("region");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    // Przeglądarka testowa jest polska: bez wyboru numery bez prefiksu liczymy jako polskie
    await page.goto("/app/clients/new");
    await expect(page.getByText("Polska (+48)")).toBeVisible();

    // Wybór regionu Wielka Brytania: ciasteczko od razu, profil w bazie
    await page.goto("/app/more");
    await page.getByLabel("Region (kraj)").selectOption({ label: "Wielka Brytania" });
    await expect.poll(async () => (await adminDb().from("profiles").select("region").eq("id", owner.id).single()).data?.region).toBe("GB");

    await page.goto("/app/clients/new");
    await expect(page.getByText("Wielka Brytania (+44)")).toBeVisible();
    await page.getByLabel("Imię", { exact: true }).fill("Alicja");
    await page.getByLabel("Nazwisko").fill("Brytyjska");
    await page.getByLabel("Telefon").fill("07911 123456");
    await page.getByRole("button", { name: "Dodaj klienta" }).click();
    await expect(page.getByRole("heading", { name: "Alicja Brytyjska" })).toBeVisible();
    await expect(page.getByText("+447911123456").first()).toBeVisible();

    // Numer z własnym prefiksem zachowuje swój kraj niezależnie od regionu
    await page.goto("/app/clients/new");
    await page.getByLabel("Imię", { exact: true }).fill("Jan");
    await page.getByLabel("Nazwisko").fill("Polski");
    await page.getByLabel("Telefon").fill("+48 600 100 200");
    await page.getByRole("button", { name: "Dodaj klienta" }).click();
    await expect(page.getByText("+48600100200").first()).toBeVisible();

    // Niepoprawny numer jest odrzucany z komunikatem przy polu
    await page.goto("/app/clients/new");
    await page.getByLabel("Imię", { exact: true }).fill("Błąd");
    await page.getByLabel("Telefon").fill("123");
    await page.getByRole("button", { name: "Dodaj klienta" }).click();
    await expect(page.getByText("Niepoprawny numer telefonu")).toBeVisible();

    // „Automatycznie” wraca do regionu z urządzenia (Polska) i czyści region w profilu
    await page.goto("/app/more");
    await page.getByLabel("Region (kraj)").selectOption({ label: "Automatycznie (z urządzenia)" });
    await expect.poll(async () => (await adminDb().from("profiles").select("region").eq("id", owner.id).single()).data?.region).toBeNull();
    await page.goto("/app/clients/new");
    await expect(page.getByText("Polska (+48)")).toBeVisible();
  });
});
