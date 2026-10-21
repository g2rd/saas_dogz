import { expect, test } from "@playwright/test";
import { adminDb, addClient, createAccount, createSchool, grantPortalAccess } from "./support/api";
import { makePlatformAdmin } from "./support/platform";
import { login } from "./support/ui";

test.describe("zgłoszenia problemów i pomysłów", () => {
  test("trener i klient wysyłają zgłoszenie, właściciel platformy widzi je z autorem i oznacza jako obejrzane @mobile", async ({ page, browser }) => {
    const owner = await createAccount("opinia");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Klient", "Opinii");
    const clientAccount = await createAccount("klient-opinia");
    await grantPortalAccess(school.id, client.id, clientAccount.id);
    const admin = await createAccount("wlasciciel-opinii");
    await createSchool(admin, "adminowa");
    await makePlatformAdmin(admin);

    const marker = `E2E ${crypto.randomUUID().slice(0, 6)}`;

    // Trener: z „Więcej” do formularza
    await login(page, owner.email, owner.password, /\/app/);
    await page.goto("/app/more");
    await page.getByRole("link", { name: "Zgłoś problem lub pomysł" }).click();
    await expect(page).toHaveURL(/\/app\/feedback/);
    await page.getByLabel("Co chcesz zgłosić?").selectOption({ label: "Pomysł lub brakująca funkcja" });
    await page.getByLabel("Wiadomość").fill(`Widok tygodnia ${marker}`);
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
    await expect(page.getByText("Dziękujemy! Zgłoszenie dotarło do zespołu DogTrainer.")).toBeVisible();

    // Klient: ten sam formularz w swoim panelu
    const clientContext = await browser.newContext({ locale: "pl-PL" });
    const clientPage = await clientContext.newPage();
    await login(clientPage, clientAccount.email, clientAccount.password, /\/portal/);
    await clientPage.goto("/portal/feedback");
    await clientPage.getByLabel("Wiadomość").fill(`Przypomnienie dzień wcześniej ${marker}`);
    await clientPage.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
    await expect(clientPage.getByText("Dziękujemy! Zgłoszenie dotarło do zespołu DogTrainer.")).toBeVisible();
    await clientContext.close();

    // Baza: dwa wpisy z rolą autora
    const { data } = await adminDb().from("feedback").select("audience, kind, message").like("message", `%${marker}`).order("created_at");
    expect(data?.map((row) => row.audience)).toEqual(["staff", "client"]);
    expect(data?.[0].kind).toBe("idea");

    // Właściciel platformy: lista z nazwą szkoły i autorem, oznaczanie jako obejrzane
    const adminContext = await browser.newContext({ locale: "pl-PL" });
    const adminPage = await adminContext.newPage();
    await login(adminPage, admin.email, admin.password, /\/app/);
    await adminPage.goto("/admin/feedback");
    const entry = adminPage.getByRole("listitem").filter({ hasText: `Widok tygodnia ${marker}` });
    await expect(entry).toContainText(school.name);
    await expect(entry).toContainText(owner.email);
    await expect(entry).toContainText("Nowe");
    await entry.getByRole("button", { name: "Oznacz jako obejrzane" }).click();
    await expect(entry.getByRole("button", { name: "Oznacz jako nowe" })).toBeVisible();
    await adminContext.close();
  });

  test("pusta wiadomość nie jest wysyłana", async ({ page }) => {
    const owner = await createAccount("opinia-pusta");
    await createSchool(owner);
    await login(page, owner.email, owner.password, /\/app/);
    await page.goto("/app/feedback");
    await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
    // Pole jest wymagane: przeglądarka zatrzymuje formularz, nic nie trafia do bazy
    await expect(page.getByLabel("Wiadomość")).toHaveAttribute("required", "");
    await expect(page).toHaveURL(/\/app\/feedback/);
    await expect(page.getByText("Dziękujemy!")).toHaveCount(0);
  });
});
