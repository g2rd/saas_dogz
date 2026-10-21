import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "../playwright.config";
import { addClient, createAccount, createSchool, grantPortalAccess, processNotifications, sellPackage, waitForEvent } from "./support/api";
import { confirmDialog, isoInDays, login, openSection, scheduleSessionViaUi } from "./support/ui";

const BASE_URL = "http://localhost:3100";

/**
 * Wolne terminy: trener odwołuje zajęcia, ogłasza zwolniony termin, klient z listy chętnych zgłasza „Biorę”, trener wybiera osobę,
 * a klient dostaje komunikat „Miejsce jest dla Ciebie!”.
 */
test.describe("wolne terminy", () => {
  test("odwołane zajęcia, ogłoszenie, zgłoszenie „Biorę” i wybór trenera", async ({ page, browser }) => {
    const owner = await createAccount("wolne-terminy");
    const school = await createSchool(owner);
    const original = await addClient(owner, school.id, "Ania", "Odwołująca");
    const waiting = await addClient(owner, school.id, "Basia", "Chętna");
    await sellPackage(owner, school.id, original.id, 10, 80000);
    await sellPackage(owner, school.id, waiting.id, 10, 80000);
    const waitingAccount = await createAccount("klient-chetny");
    await grantPortalAccess(school.id, waiting.id, waitingAccount.id);

    // Klientka zapisuje się na listę chętnych
    const waitingContext = await browser.newContext({ locale: "pl-PL" });
    const waitingPage = await waitingContext.newPage();
    await login(waitingPage, waitingAccount.email, waitingAccount.password, /\/portal/);
    await waitingPage.goto("/portal/sessions");
    await waitingPage.getByRole("button", { name: "Zapisz mnie na listę chętnych" }).click();
    await expect(waitingPage.getByText("Jesteś na liście chętnych")).toBeVisible();

    // Trener planuje zajęcia pierwszej klientki i je odwołuje bez konsekwencji dla pakietu
    await login(page, owner.email, owner.password, /\/app/);
    await scheduleSessionViaUi(page, "Ania Odwołująca", school.sessionTypeName, isoInDays(2), "11:00");
    await openSection(page, "Odwołaj zajęcia");
    await page.getByRole("button", { name: "Odwołaj zajęcia" }).first().click();
    await confirmDialog(page, /Odwołaj/);
    await expect(page.getByText("Odwołane terminy")).toBeVisible();

    // Ogłoszenie zwolnionego terminu
    await page.getByText("Ogłoś wolny termin").first().click();
    await page.getByLabel("Notatka (opcjonalnie)").fill("Zwolnił się termin");
    await page.getByRole("button", { name: "Wyślij ogłoszenie" }).click();
    await confirmDialog(page, /Ogłoś|Wyślij/);
    await expect(page.getByText(/Wolny termin ogłoszony/)).toBeVisible();

    // Powiadomienie o wolnym terminie trafia do osoby z listy chętnych
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    await waitingPage.goto("/portal/notifications");
    await expect(waitingPage.getByRole("button", { name: /Wolny termin/ })).toContainText("Zwolnił się termin");

    // Klientka zgłasza „Biorę”
    await waitingPage.goto("/portal/sessions");
    await waitingPage.getByRole("button", { name: "Biorę" }).first().click();
    await expect(waitingPage.getByText(/Zgłoszono|Czekasz na decyzję trenera/).first()).toBeVisible();

    // Trener widzi zgłoszenie i wybiera osobę
    await page.goto("/app/sessions");
    await expect(page.getByText(/Zgłoszeń: 1/)).toBeVisible();
    await page.getByRole("button", { name: "Wybierz" }).first().click();
    await confirmDialog(page, /Wybierz i zarezerwuj/);
    // Akcja trwa po zamknięciu okna: czekamy na zdarzenie, zanim uruchomimy procesor powiadomień
    await waitForEvent(school.id, "slot_claim.accepted");

    // Klientka dostaje potwierdzenie miejsca i zajęcia w swoim terminarzu
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    await waitingPage.goto("/portal/notifications");
    await expect(waitingPage.getByRole("button", { name: /Miejsce jest dla Ciebie!/ })).toBeVisible();
    await waitingPage.goto("/portal/sessions");
    await expect(waitingPage.getByText("11:00").first()).toBeVisible();
    await waitingContext.close();
  });
});
