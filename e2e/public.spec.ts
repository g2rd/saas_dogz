import { expect, test } from "@playwright/test";

test.describe("strony publiczne", () => {
  test("strona główna prowadzi do rejestracji, logowania, regulaminu i polityki prywatności", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "DogTrainer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Załóż konto" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "Zaloguj się" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "Regulamin testów" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Polityka prywatności" })).toHaveAttribute("href", "/privacy");
  });

  test("regulamin i polityka prywatności mają treść, wersję i baner szkicu", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Regulamin testów");
    await expect(page.getByText(/Wersja z dnia \d{4}-\d{2}-\d{2}/)).toBeVisible();
    await expect(page.getByRole("note")).toContainText("do przeglądu prawnika");
    await expect(page.getByRole("heading", { name: /Dane klientów trenera/ })).toBeVisible();

    await page.getByRole("link", { name: "Polityka prywatności" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: /Kto jest administratorem danych/ })).toBeVisible();
  });

  test("angielska przeglądarka dostaje angielskie dokumenty", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DogTrainer test terms");
    await expect(page.getByRole("heading", { name: /Account and access/ })).toBeVisible();
    await context.close();
  });

  test("nieistniejąca strona pokazuje 404 z powrotem na stronę główną", async ({ page }) => {
    const response = await page.goto(`/nie-ma-takiej-strony-${Date.now()}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nie znaleziono strony" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wróć do strony głównej" })).toHaveAttribute("href", "/start");
  });

  test("trasy chronione odsyłają niezalogowanych do logowania, a /admin nie ujawnia się osobom bez uprawnień", async ({ page }) => {
    for (const path of ["/app", "/portal"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    }
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });

  test("manifest PWA, service worker i nagłówki bezpieczeństwa", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).start_url).toBe("/start");

    const sw = await request.get("/sw.js");
    expect(sw.headers()["content-type"]).toContain("javascript");
    expect(sw.headers()["cache-control"]).toContain("no-cache");

    const login = await request.get("/login");
    expect(login.headers()["x-frame-options"]).toBe("DENY");
    expect(login.headers()["x-content-type-options"]).toBe("nosniff");
    expect(login.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(login.headers()["x-powered-by"]).toBeUndefined();
  });
});
