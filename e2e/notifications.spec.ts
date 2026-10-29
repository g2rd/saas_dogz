import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "../playwright.config";
import { addClient, adminDb, createAccount, createSchool, grantPortalAccess, lastEmailTo, processNotifications, sellPackage } from "./support/api";
import { isoInDays, login, scheduleSessionViaUi } from "./support/ui";

const BASE_URL = "http://localhost:3100";

/** Wyświetlana data zajęć w zapisie polskim (DD.MM.RRRR) dla daty RRRR-MM-DD. */
const plDate = (iso: string) => iso.split("-").reverse().join(".");

test.describe("powiadomienia", () => {
  test("zaplanowane zajęcia: klient dostaje powiadomienie w dzwonku, a e-mail w języku swojego konta @mobile", async ({ page, browser }) => {
    const owner = await createAccount("powiadomienia");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Ola", "Powiadomiona");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    const clientAccount = await createAccount("klient-powiadomienia");
    await grantPortalAccess(school.id, client.id, clientAccount.id);
    // Konto klienta ma angielski jako język powiadomień (e-mail), a przeglądarka klienta jest polska (dzwonek)
    await adminDb().from("profiles").update({ locale: "en" }).eq("id", clientAccount.id);

    await login(page, owner.email, owner.password, /\/app/);
    const date = isoInDays(2);
    await scheduleSessionViaUi(page, "Ola Powiadomiona", school.sessionTypeName, date, "10:00");

    // Zdarzenia z akcji trenera czekają 30 s (okno „Cofnij”); test zdejmuje to opóźnienie i uruchamia procesor
    await processNotifications(BASE_URL, E2E_CRON_SECRET);

    // E-mail: język z profilu odbiorcy (angielski), treść z parametrów
    await expect.poll(async () => (await lastEmailTo(clientAccount.email))?.subject ?? "", { timeout: 15_000 }).toBe("Session scheduled");
    const mail = await lastEmailTo(clientAccount.email);
    expect(mail?.text).toContain("10:00");
    expect(mail?.text).toContain(`${BASE_URL}/portal/sessions`);

    // Dzwonek w panelu klienta: język przeglądarki (polski), nieprzeczytane, kliknięcie otwiera zajęcia i oznacza jako przeczytane
    const clientContext = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await clientContext.newPage();
    await login(clientPage, clientAccount.email, clientAccount.password, /\/portal/);
    await clientPage.goto("/portal/notifications");
    const item = clientPage.getByRole("button", { name: /Zaplanowano zajęcia/ });
    await expect(item).toContainText(plDate(date));
    await expect(item).toContainText("Nieprzeczytane");
    await item.click();
    await expect(clientPage).toHaveURL(/\/portal\/sessions/);
    await clientPage.goto("/portal/notifications");
    await expect(clientPage.getByRole("button", { name: /Zaplanowano zajęcia/ })).not.toContainText("Nieprzeczytane");
    await clientContext.close();
  });

  test("klient zgłasza „Nie mogę przyjść”, trener dostaje prośbę i powiadomienie", async ({ page, browser }) => {
    const owner = await createAccount("prosby");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Kasia", "Zajęta");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    const clientAccount = await createAccount("klient-prosby");
    await grantPortalAccess(school.id, client.id, clientAccount.id);

    await login(page, owner.email, owner.password, /\/app/);
    await scheduleSessionViaUi(page, "Kasia Zajęta", school.sessionTypeName, isoInDays(3), "16:00");
    await processNotifications(BASE_URL, E2E_CRON_SECRET);

    const clientContext = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await clientContext.newPage();
    await login(clientPage, clientAccount.email, clientAccount.password, /\/portal/);
    await clientPage.goto("/portal/sessions");
    await clientPage.getByRole("button", { name: "Nie mogę przyjść" }).first().click();
    await expect(clientPage.getByText(/Dziękujemy! Trener dostał informację, że nie możesz przyjść/)).toBeVisible();
    await clientContext.close();

    await processNotifications(BASE_URL, E2E_CRON_SECRET);

    // Trener: prośba na liście próśb i powiadomienie w dzwonku
    await page.goto("/app/requests");
    await expect(page.getByText("Kasia Zajęta").first()).toBeVisible();
    await expect(page.getByText("Nie mogę przyjść").first()).toBeVisible();
    await page.goto("/app/notifications");
    await expect(page.getByText("Kasia Zajęta nie może przyjść na zajęcia").first()).toBeVisible();
  });
});
