import { expect, test } from "@playwright/test";
import { addClient, createAccount, createSchool, sellPackage } from "./support/api";
import { confirmDialog, login } from "./support/ui";

test.describe("historia zmian", () => {
  test("wpisy z opisem, cofnięcie wpłaty i pakietu z historii, starsze wpisy bez przycisku @mobile", async ({ page }) => {
    const owner = await createAccount("historia");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Anna", "Historyczna");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    const payment = await owner.db.rpc("record_payment", {
      p_org: school.id,
      p_client: client.id,
      p_amount_minor: 30000,
      p_currency: "PLN",
      p_method: "cash",
      p_paid_at: new Date().toISOString(),
      p_reference: null,
      p_allocations: [],
    });
    expect(payment.error).toBeNull();

    await login(page, owner.email, owner.password, /\/app/);
    await page.goto("/app/history");
    const entries = page.getByTestId("history-entry");

    // Opisy w języku widza: co, kogo dotyczy, kiedy i kto
    const paymentEntry = entries.filter({ hasText: "Wpłata" });
    await expect(paymentEntry).toContainText("300,00");
    await expect(paymentEntry).toContainText("Anna Historyczna");
    await expect(paymentEntry).toContainText("Test historia");
    const packageEntry = entries.filter({ hasText: "Sprzedano pakiet" });
    await expect(packageEntry).toContainText("Pakiet 10");
    await expect(entries.filter({ hasText: "Utworzono szkołę" })).toHaveCount(1);
    await expect(entries.filter({ hasText: "Utworzono szkołę" }).getByRole("button", { name: "Cofnij" })).toHaveCount(0);

    // Cofnięcie wpłaty: wpis dostaje wpis o anulowaniu, a przycisk znika
    await paymentEntry.getByRole("button", { name: "Cofnij" }).click();
    await confirmDialog(page, "Anuluj wpłatę");
    await expect(entries.filter({ hasText: "Anulowano wpłatę" })).toHaveCount(1);
    await expect(entries.filter({ hasText: "Wpłata 300,00" }).getByRole("button", { name: "Cofnij" })).toHaveCount(0);

    // Cofnięcie sprzedaży pakietu (pakiet nieużywany)
    await packageEntry.getByRole("button", { name: "Cofnij" }).click();
    await confirmDialog(page, "Anuluj pakiet");
    await expect(entries.filter({ hasText: "Anulowano pakiet" })).toHaveCount(1);
    await expect(entries.filter({ hasText: "Sprzedano pakiet" }).getByRole("button", { name: "Cofnij" })).toHaveCount(0);

    // Menu „Więcej” prowadzi do historii, a strona ma link powrotu
    await page.goto("/app/more");
    await page.getByRole("link", { name: "Historia zmian" }).click();
    await expect(page).toHaveURL(/\/app\/history/);
  });

  test("zakończone zajęcia można cofnąć z historii tego samego dnia, a odmowę reguł widać pod wpisem", async ({ page }) => {
    const owner = await createAccount("historia-zajecia");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Ola", "Zajęciowa");
    const packageId = await sellPackage(owner, school.id, client.id, 5, 40000);

    // Zajęcia zaplanowane na przeszłość i zakończone (zużywają pakiet), potem cofnięcie z historii
    const start = new Date(Date.now() - 2 * 3600_000);
    const created = await owner.db.rpc("schedule_session", {
      p_org: school.id,
      p_type: school.sessionTypeId,
      p_trainer: owner.id,
      p_starts_at: start.toISOString(),
      p_location: null,
      p_client: client.id,
      p_dog: null,
    });
    expect(created.error).toBeNull();
    const done = await owner.db.rpc("complete_session", { p_org: school.id, p_session: created.data, p_package: packageId, p_note: null, p_without_package: false });
    expect(done.error).toBeNull();

    await login(page, owner.email, owner.password, /\/app/);
    await page.goto("/app/history");
    const completed = page.getByTestId("history-entry").filter({ hasText: "Zakończono zajęcia" });
    await expect(completed).toContainText("Ola Zajęciowa");
    await completed.getByRole("button", { name: "Cofnij" }).click();
    await confirmDialog(page, "Cofnij zakończenie");
    await expect(page.getByTestId("history-entry").filter({ hasText: "Cofnięto zakończenie zajęć" })).toHaveCount(1);
    await expect(page.getByTestId("history-entry").filter({ hasText: "Zakończono zajęcia" }).getByRole("button", { name: "Cofnij" })).toHaveCount(0);

    // Pakiet był już używany: baza odmawia anulowania, a powód widać pod wpisem
    await page.getByTestId("history-entry").filter({ hasText: "Sprzedano pakiet" }).getByRole("button", { name: "Cofnij" }).click();
    await confirmDialog(page, "Anuluj pakiet");
    await expect(page.getByText("Pakiet był już używany")).toBeVisible();
  });
});
