import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_CRON_SECRET } from "../playwright.config";
import { addClient, adminDb, createAccount, createSchool, lastEmailTo, PASSWORD, processNotifications } from "./support/api";
import { confirmDialog, login } from "./support/ui";

const BASE_URL = "http://localhost:3100";
const stamp = () => crypto.randomUUID().slice(0, 8);

/** Trener tworzy link szkoły na ekranie próśb i zwraca jego adres. */
async function createSchoolLink(page: Page): Promise<string> {
  await page.goto("/app/join-requests");
  await expect(page.getByText("Link szkoły jeszcze nie został utworzony.")).toBeVisible();
  await page.getByRole("button", { name: "Utwórz link szkoły" }).click();
  await expect(page.getByRole("img", { name: "Kod QR szkoły" })).toBeVisible();
  return (await page.getByTestId("school-link").textContent())!.trim();
}

/** Klient bez konta otwiera link szkoły, zakłada konto i wysyła prośbę; zwraca jego stronę i e-mail. */
async function requestAccess(browser: Browser, link: string, fullName: string, note: string) {
  const context = await browser.newContext({ locale: "pl-PL" });
  const page = await context.newPage();
  const email = `e2e-szkola-${stamp()}@example.test`;
  await page.goto(link);
  await page.getByLabel("Imię i nazwisko").fill(fullName);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /Akceptuję/ }).check();
  await page.getByRole("button", { name: "Załóż konto i dołącz" }).click();

  // Po założeniu konta wracamy na stronę linku z formularzem prośby (imię i nazwisko z konta)
  await expect(page.getByLabel("Imię", { exact: true })).toHaveValue(fullName.split(" ")[0]);
  await page.getByLabel("Telefon (opcjonalnie)").fill("600 100 200");
  await page.getByLabel("Wiadomość do trenera (opcjonalnie)").fill(note);
  await page.getByRole("button", { name: "Wyślij prośbę" }).click();
  await expect(page).toHaveURL(/\/school$/);
  await expect(page.getByText("Czeka na akceptację trenera").first()).toBeVisible();
  return { page, email, context };
}

test.describe("link szkoły z akceptacją trenera", () => {
  test("klient skanuje link, zakłada konto i wysyła prośbę, trener akceptuje i klient wchodzi do panelu @mobile", async ({ page, browser }) => {
    const owner = await createAccount("link-szkoly");
    const school = await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);
    const link = await createSchoolLink(page);
    expect(link).toMatch(/\/school\/[A-Za-z0-9_-]{43}$/);

    // Publiczna strona linku pokazuje nazwę szkoły
    const guest = await browser.newContext({ locale: "pl-PL" });
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await expect(guestPage.getByRole("heading", { name: `Dołącz do szkoły ${school.name}` })).toBeVisible();
    await guest.close();

    const { page: clientPage, email, context } = await requestAccess(browser, link, "Ola Skanująca", "Mam labradora Burka");

    // Trener dostaje powiadomienie e-mail o nowej prośbie
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    await expect.poll(async () => (await lastEmailTo(owner.email))?.subject ?? "", { timeout: 15_000 }).toBe("Ola Skanująca prosi o dołączenie");

    // Trener widzi prośbę z danymi i akceptuje (nowa kartoteka z danych prośby)
    await page.goto("/app/join-requests");
    const row = page.getByTestId("join-request");
    await expect(row).toContainText("Ola Skanująca");
    await expect(row).toContainText(email);
    await expect(row).toContainText("600 100 200");
    await expect(row).toContainText("Mam labradora Burka");
    await row.getByRole("button", { name: "Akceptuj" }).click();
    await confirmDialog(page, "Akceptuj");
    await expect(page.getByText("Brak oczekujących próśb.")).toBeVisible();

    const { data: clients } = await adminDb().from("clients").select("id, first_name, last_name, email").eq("organization_id", school.id).eq("email", email);
    expect(clients).toHaveLength(1);
    expect(clients![0]).toMatchObject({ first_name: "Ola", last_name: "Skanująca" });
    await page.goto(`/app/clients/${clients![0].id}`);
    await expect(page.getByRole("heading", { name: "Ola Skanująca" })).toBeVisible();

    // Klient dostaje e-mail o akceptacji
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    await expect.poll(async () => (await lastEmailTo(email))?.subject ?? "", { timeout: 15_000 }).toBe("Prośba zaakceptowana");

    // Klient widzi zaakceptowaną prośbę i wchodzi do panelu
    await clientPage.goto("/school");
    await expect(clientPage.getByText("Zaakceptowana")).toBeVisible();
    await clientPage.getByRole("link", { name: "Przejdź do panelu klienta" }).click();
    await expect(clientPage).toHaveURL(/\/portal/);
    await expect(clientPage.getByRole("heading", { name: /Cześć, Ola/ })).toBeVisible();
    await context.close();
  });

  test("odrzucenie, łączenie z istniejącym klientem i wymiana linku", async ({ page, browser }) => {
    const owner = await createAccount("link-szkoly-2");
    const school = await createSchool(owner);
    const existing = await addClient(owner, school.id, "Ewa", `Istniejąca${stamp()}`);
    await login(page, owner.email, owner.password, /\/app/);
    const link = await createSchoolLink(page);

    // Odrzucenie: osoba widzi status, kartoteka nie powstaje
    const rejected = await requestAccess(browser, link, "Adam Odrzucony", "Test");
    await page.goto("/app/join-requests");
    const rejectRow = page.getByTestId("join-request").filter({ hasText: "Adam Odrzucony" });
    await rejectRow.getByRole("button", { name: "Odrzuć" }).click();
    await confirmDialog(page, "Odrzuć prośbę");
    await expect(page.getByText("Brak oczekujących próśb.")).toBeVisible();
    await rejected.page.goto("/school");
    await expect(rejected.page.getByText("Odrzucona")).toBeVisible();
    const { data: none } = await adminDb().from("clients").select("id").eq("organization_id", school.id).eq("email", rejected.email);
    expect(none).toHaveLength(0);
    await rejected.context.close();

    // Połączenie z kartoteką, którą trener już prowadził: dostęp trafia do istniejącego klienta
    const linked = await requestAccess(browser, link, "Ewa Istniejąca", "Jestem już u Ciebie");
    await page.goto("/app/join-requests");
    const linkRow = page.getByTestId("join-request").filter({ hasText: "Ewa Istniejąca" });
    await linkRow.getByLabel("Połącz z istniejącym klientem").selectOption({ value: existing.id });
    await linkRow.getByRole("button", { name: "Akceptuj" }).click();
    await confirmDialog(page, "Akceptuj");
    await expect(page.getByText("Brak oczekujących próśb.")).toBeVisible();
    const { data: access } = await adminDb().from("client_access").select("client_id, status").eq("client_id", existing.id);
    expect(access).toEqual([{ client_id: existing.id, status: "active" }]);
    await linked.context.close();

    // Wymiana linku: stary przestaje działać, nowy działa
    await page.goto("/app/join-requests");
    await page.getByRole("button", { name: "Wygeneruj nowy link" }).click();
    await confirmDialog(page, "Wygeneruj nowy link");
    await expect(page.getByTestId("school-link")).not.toHaveText(link);
    const fresh = (await page.getByTestId("school-link").textContent())!.trim();

    const guest = await browser.newContext({ locale: "pl-PL" });
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await expect(guestPage.getByText("Link jest nieważny")).toBeVisible();
    await guestPage.goto(fresh);
    await expect(guestPage.getByRole("heading", { name: `Dołącz do szkoły ${school.name}` })).toBeVisible();
    await guest.close();
  });

  test("konto z innej szkoły nie widzi próśb o dołączenie", async ({ page }) => {
    const owner = await createAccount("link-szkoly-3");
    await createSchool(owner);
    const stranger = await createAccount("link-szkoly-obcy");
    await createSchool(stranger);
    await login(page, stranger.email, stranger.password, /\/app/);
    await page.goto("/app/join-requests");
    await expect(page.getByText("Brak oczekujących próśb.")).toBeVisible();
    await expect(page.getByTestId("join-request")).toHaveCount(0);
  });
});
