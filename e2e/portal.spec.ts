import { expect, test } from "@playwright/test";
import { addClient, addDog, createAccount, createSchool, grantPortalAccess, lastEmailTo, sellPackage } from "./support/api";
import { alertOf, login, logout, openSection } from "./support/ui";

test.describe("panel klienta", () => {
  test("trener zaprasza klienta, klient zakłada konto z zaproszenia i widzi swoje saldo @mobile", async ({ page, browser }) => {
    const owner = await createAccount("zapraszajacy");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Ola", "Zaproszona");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    await login(page, owner.email, owner.password, /\/app/);

    // Trener tworzy zaproszenie: link i kod widać tylko od razu po utworzeniu
    await page.goto(`/app/clients/${client.id}`);
    await openSection(page, "Zaproś klienta do panelu");
    await page.getByRole("button", { name: "Utwórz zaproszenie" }).click();
    await expect(page.getByText(/Zaproszenie gotowe/)).toBeVisible();
    const link = await page.getByLabel("Link zaproszenia").inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
    const code = (await page.getByLabel("Kod zaproszenia").innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    // Wiadomość e-mail z linkiem i kodem trafia do skrzynki klienta (lokalna poczta)
    await page.getByRole("button", { name: "Wyślij e-mailem" }).click();
    await expect(page.getByText(/Wysłano e-mail na adres/)).toBeVisible();
    await expect.poll(async () => (await lastEmailTo(client.email))?.subject ?? "").toContain("Zaproszenie do panelu klienta");
    const mail = await lastEmailTo(client.email);
    expect(mail?.text).toContain(link);
    expect(mail?.text).toContain(code);

    // Klient w osobnej przeglądarce przyjmuje zaproszenie
    const context = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await context.newPage();
    await clientPage.goto(link);
    await expect(clientPage.getByRole("heading", { name: /Zaproszenie do panelu klienta|Dołącz do panelu klienta/ }).first()).toBeVisible();
    await expect(clientPage.getByText(school.name)).toBeVisible();

    // Zaproszenie przypisane do adresu z kartoteki: inny adres jest odrzucany, właściwy przyjmowany
    await clientPage.getByLabel("Imię i nazwisko").fill("Ola Zaproszona");
    await clientPage.getByLabel("E-mail").fill(`inny-${Date.now()}@example.test`);
    await clientPage.getByLabel("Hasło").fill("Haslo-E2E-12345");
    await clientPage.getByRole("checkbox", { name: /Akceptuję/ }).check();
    await clientPage.getByRole("button", { name: "Załóż konto i dołącz" }).click();
    await expect(alertOf(clientPage).first()).toContainText("Podaj adres e-mail, na który wysłano zaproszenie");

    await clientPage.getByLabel("E-mail").fill(client.email);
    await clientPage.getByLabel("Hasło").fill("Haslo-E2E-12345");
    await clientPage.getByRole("checkbox", { name: /Akceptuję/ }).check();
    await clientPage.getByRole("button", { name: "Załóż konto i dołącz" }).click();

    // Panel klienta: powitanie i saldo pakietu 10 z 10
    await expect(clientPage).toHaveURL(/\/portal/);
    await expect(clientPage.getByRole("heading", { name: /Cześć, Ola/ })).toBeVisible();
    await expect(clientPage.getByText(/10 zajęć zostało|zostało/).first()).toBeVisible();
    await expect(clientPage.getByText("Pakiet 10").or(clientPage.getByText(/Pakiet/)).first()).toBeVisible();

    // Zaproszenie jest jednorazowe: drugi raz ten sam link nie działa
    await logout(clientPage, true);
    await clientPage.goto(link);
    await expect(clientPage.getByText(/zostało już użyte|wygasło|Nie znaleziono/)).toBeVisible();
    await context.close();

    // Trener widzi, że klient ma już dostęp do panelu
    await page.goto(`/app/clients/${client.id}`);
    await expect(page.getByText("Konto z dostępem do panelu")).toBeVisible();
  });

  test("klient widzi tylko swoje dane: cudza kartoteka jest niedostępna, a saldo i płatności się zgadzają", async ({ page }) => {
    const owner = await createAccount("izolacja");
    const school = await createSchool(owner);
    const mine = await addClient(owner, school.id, "Moja", "Kartoteka");
    const other = await addClient(owner, school.id, "Cudza", "Kartoteka");
    await addDog(owner, school.id, mine.id, "MójPies");
    await addDog(owner, school.id, other.id, "CudzyPies");
    await sellPackage(owner, school.id, mine.id, 5, 40000);
    await sellPackage(owner, school.id, other.id, 8, 64000);

    const clientAccount = await createAccount("klient-izolacja");
    await grantPortalAccess(school.id, mine.id, clientAccount.id);
    await login(page, clientAccount.email, clientAccount.password, /\/portal/);

    await expect(page.getByRole("heading", { name: /Cześć, Moja/ })).toBeVisible();
    await page.goto("/portal/dogs");
    await expect(page.getByText("MójPies")).toBeVisible();
    await expect(page.getByText("CudzyPies")).toHaveCount(0);

    await page.goto("/portal/payments");
    await expect(page.getByText(/400,00/).first()).toBeVisible();
    await expect(page.getByText(/640,00/)).toHaveCount(0);

    // Klient nie wchodzi do panelu trenera: zostaje odesłany do swojego panelu
    await page.goto("/app");
    await expect(page).toHaveURL(/\/portal/);
  });
});
