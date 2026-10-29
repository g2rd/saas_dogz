import { expect, test, type Page } from "@playwright/test";
import { addClient, createAccount, createSchool, grantPortalAccess } from "./support/api";
import { login } from "./support/ui";

/** Psuje ciasteczka sesji Supabase (jak wygasła lub unieważniona sesja): strona nadal je wysyła, ale nie przechodzą weryfikacji. */
async function expireSession(page: Page) {
  const context = page.context();
  const cookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
  expect(cookies.length).toBeGreaterThan(0);
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, value: "wygasla-sesja" })));
}

test.describe("wygasła sesja", () => {
  test("wejście na stronę panelu po wygaśnięciu sesji kończy się loginem z wyjaśnieniem, a nie błędem uprawnień @mobile", async ({ page }) => {
    const owner = await createAccount("sesja");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    await expireSession(page);
    await page.goto("/app/clients");
    await expect(page).toHaveURL(/\/login\?.*expired=1/);
    await expect(page).toHaveURL(/next=%2Fapp%2Fclients/);
    await expect(page.getByRole("status")).toContainText("Sesja wygasła. Zaloguj się ponownie.");

    // Po zalogowaniu wracamy tam, dokąd użytkownik szedł
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByLabel("Hasło").fill(owner.password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL(/\/app\/clients/);
  });

  test("formularz wysłany po wygaśnięciu sesji odsyła do logowania z wyjaśnieniem", async ({ page }) => {
    const owner = await createAccount("sesja-formularz");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    await page.goto("/app/clients/new");
    await page.getByLabel("Imię", { exact: true }).fill("Anna");
    await page.getByLabel("Nazwisko").fill("Wygasła");
    await expireSession(page);
    await page.getByRole("button", { name: "Dodaj klienta" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("status")).toContainText("Sesja wygasła. Zaloguj się ponownie.");
  });

  test("zwykłe wejście bez sesji nie pokazuje komunikatu o wygaśnięciu", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/expired/);
    await expect(page.getByText("Sesja wygasła")).toHaveCount(0);
  });
});

test.describe("linki powrotu w aplikacji zainstalowanej na ekranie głównym", () => {
  test("podstrony z menu „Więcej” mają link powrotu w panelu trenera i klienta @mobile", async ({ page, browser }) => {
    const owner = await createAccount("powrot");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);
    for (const path of ["/app/team", "/app/notifications", "/app/feedback"]) {
      await page.goto(path);
      await expect(page.getByTestId("back-link"), path).toHaveAttribute("href", "/app/more");
    }
    await page.getByTestId("back-link").click();
    await expect(page).toHaveURL(/\/app\/more/);

    const client = await addClient(owner, school.id, "Ola", "Powrotna");
    const account = await createAccount("klient-powrot");
    await grantPortalAccess(school.id, client.id, account.id);
    const context = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await context.newPage();
    await login(clientPage, account.email, account.password, /\/portal/);
    for (const path of ["/portal/notifications", "/portal/feedback"]) {
      await clientPage.goto(path);
      await expect(clientPage.getByTestId("back-link"), path).toHaveAttribute("href", "/portal/more");
    }
    await context.close();
  });
});
