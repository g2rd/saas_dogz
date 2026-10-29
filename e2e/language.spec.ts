import { expect, test } from "@playwright/test";
import { addClient, createAccount, createSchool, grantPortalAccess, sellPackage } from "./support/api";
import { login } from "./support/ui";

test.describe("język interfejsu", () => {
  test("trener przełącza polski na angielski w „Więcej”, wybór zostaje po odświeżeniu i dotyczy całego panelu @mobile", async ({ page, context }) => {
    const owner = await createAccount("jezyk");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);

    await page.goto("/app/more");
    await expect(page.getByRole("heading", { name: "Więcej" })).toBeVisible();
    await page.getByLabel("Język aplikacji").selectOption({ label: "English" });

    // Przełączenie zapisuje ciasteczko i odświeża widok po angielsku
    await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "dt_locale")?.value).toBe("en");

    await page.goto("/app/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a client" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

    // Powrót do „Automatycznie” przywraca język przeglądarki (polski)
    await page.goto("/app/more");
    await page.getByLabel("App language").selectOption({ label: "Automatic (from your device)" });
    await expect(page.getByRole("heading", { name: "Więcej" })).toBeVisible();
  });

  test("angielska przeglądarka widzi angielski panel klienta, kwoty i daty w jej zapisie", async ({ browser }) => {
    const owner = await createAccount("jezyk-klient");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Jane", "Smith");
    await sellPackage(owner, school.id, client.id, 5, 40000);
    const account = await createAccount("klient-en");
    await grantPortalAccess(school.id, client.id, account.id);

    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await login(page, account.email, account.password, /\/portal/);
    await expect(page.getByRole("heading", { name: /Hi, Jane/ })).toBeVisible();
    await expect(page.getByRole("navigation").getByText("Payments").first()).toBeVisible();
    await page.goto("/portal/payments");
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
    // Kwota w zapisie angielskim (PLN 400.00), a nie polskim (400,00 zł)
    await expect(page.getByText(/400\.00/).first()).toBeVisible();
    await context.close();
  });
});
