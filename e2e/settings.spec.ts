import { expect, test } from "@playwright/test";
import { adminDb, addClient, createAccount, createSchool, sellPackage } from "./support/api";
import { login } from "./support/ui";

async function schoolSettings(schoolId: string) {
  const { data } = await adminDb()
    .from("organization_settings")
    .select("currency, timezone, locale, late_cancel_hours, late_cancel_consumes_session")
    .eq("organization_id", schoolId)
    .single();
  return data;
}

test.describe("ustawienia szkoły", () => {
  test("właściciel zmienia walutę, strefę, język i próg późnego odwołania, a po sprzedaży pakietu waluta jest zablokowana", async ({ page }) => {
    const owner = await createAccount("ustawienia");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    // Dojście z menu „Więcej”
    await page.goto("/app/more");
    await page.getByRole("link", { name: "Ustawienia szkoły" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Ustawienia szkoły" })).toBeVisible();

    await page.getByLabel("Waluta szkoły").selectOption("EUR");
    await page.getByLabel("Strefa czasowa").selectOption("Europe/Berlin");
    await page.getByLabel("Język szkoły").selectOption({ label: "English" });
    await page.getByLabel("Późne odwołanie: ile godzin przed zajęciami").fill("12");
    await page.getByLabel("Późne odwołanie zużywa zajęcie z pakietu").uncheck();
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Zapisano" })).toBeVisible();

    expect(await schoolSettings(school.id)).toEqual({
      currency: "EUR",
      timezone: "Europe/Berlin",
      locale: "en",
      late_cancel_hours: 12,
      late_cancel_consumes_session: false,
    });

    // Cennik przeszedł na nową walutę
    const { data: types } = await adminDb().from("session_types").select("currency").eq("organization_id", school.id);
    expect(types?.map((row) => row.currency)).toEqual(["EUR"]);

    // Po sprzedaży pakietu waluta jest zablokowana: widać komunikat, a zmiana nie przechodzi
    const client = await addClient(owner, school.id, "Anna", "Kowalska");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    await page.goto("/app/settings");
    await expect(page.getByTestId("currency-locked")).toHaveText("EUR");
    await expect(page.getByText(/Waluta jest zablokowana/)).toBeVisible();
    await expect(page.getByLabel("Waluta szkoły")).toHaveCount(0);

    // Pozostałe ustawienia nadal działają
    await page.getByLabel("Późne odwołanie: ile godzin przed zajęciami").fill("6");
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Zapisano" })).toBeVisible();
    expect((await schoolSettings(school.id))?.late_cancel_hours).toBe(6);
  });

  test("zbyt duży próg późnego odwołania daje błąd przy polu i nic nie zapisuje", async ({ page }) => {
    const owner = await createAccount("ustawienia-blad");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    await page.goto("/app/settings");
    await page.getByLabel("Późne odwołanie: ile godzin przed zajęciami").fill("9999");
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByText(/Podaj liczbę godzin od 0 do 720/).first()).toBeVisible();
    expect((await schoolSettings(school.id))?.late_cancel_hours).toBe(24);
  });

  test("trener nie widzi ustawień szkoły w menu, a adres bezpośredni daje 404", async ({ page }) => {
    const owner = await createAccount("ustawienia-wlasciciel");
    const school = await createSchool(owner);
    const trainer = await createAccount("ustawienia-trener");
    const { error } = await adminDb()
      .from("organization_members")
      .insert({ organization_id: school.id, user_id: trainer.id, role: "trainer" });
    expect(error).toBeNull();

    await login(page, trainer.email, trainer.password, /\/app/);
    await page.goto("/app/more");
    // Menu „Więcej” się wczytało (jest na nim np. „Zespół”), ale pozycji ustawień szkoły nie ma
    await expect(page.locator('a[href="/app/team"]').last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Ustawienia szkoły" })).toHaveCount(0);

    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Nie znaleziono strony" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ustawienia szkoły" })).toHaveCount(0);
  });
});
