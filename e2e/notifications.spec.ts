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

  test("koniec dostępu: właściciel dostaje e-mail 7 dni i 1 dzień przed końcem, bez powtórek i bez zapowiedzi dla odległego terminu", async () => {
    const owner = await createAccount("koniec-dostepu");
    const school = await createSchool(owner);
    const other = await createAccount("dostep-daleko");
    const farSchool = await createSchool(other);
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const events = async (schoolId: string) =>
      ((await adminDb().from("outbox_events").select("payload").eq("organization_id", schoolId).eq("type", "organization.access_ending")).data ?? []).map(
        (row) => (row.payload as { days: number }).days,
      );

    // Szkoła w okresie próbnym kończy dostęp za 5 dni, druga dopiero za 20
    await adminDb().from("organizations").update({ status: "trial", access_until: inDays(5) }).eq("id", school.id);
    await adminDb().from("organizations").update({ status: "trial", access_until: inDays(20) }).eq("id", farSchool.id);
    await processNotifications(BASE_URL, E2E_CRON_SECRET);

    await expect.poll(async () => (await lastEmailTo(owner.email))?.subject ?? "", { timeout: 15_000 }).toBe("Dostęp do konta kończy się wkrótce");
    expect((await lastEmailTo(owner.email))?.text).toContain("za 7 dni");
    expect(await events(school.id)).toEqual([7]);
    expect(await events(farSchool.id)).toEqual([]);

    // Ponowne uruchomienie reguł dziennych niczego nie dubluje
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    expect(await events(school.id)).toEqual([7]);

    // Doba przed końcem: druga zapowiedź (za 1 dzień)
    await adminDb().from("organizations").update({ access_until: inDays(0.5) }).eq("id", school.id);
    await processNotifications(BASE_URL, E2E_CRON_SECRET);
    await expect.poll(async () => (await lastEmailTo(owner.email))?.text ?? "", { timeout: 15_000 }).toContain("za 1 dzień");
    expect((await events(school.id)).sort()).toEqual([1, 7]);
  });
});
