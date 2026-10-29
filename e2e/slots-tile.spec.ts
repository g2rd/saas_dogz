import { expect, test } from "@playwright/test";
import { addClient, adminDb, createAccount, createSchool } from "./support/api";
import { login } from "./support/ui";

test.describe("kafelek wolnych terminów na pulpicie", () => {
  test("bez chętnych i ogłoszeń kafelka nie ma, z chętnymi pokazuje ich liczbę i prowadzi do zajęć @mobile", async ({ page }) => {
    const owner = await createAccount("kafelek");
    const school = await createSchool(owner);
    const first = await addClient(owner, school.id, "Ania", "Pierwsza");
    const second = await addClient(owner, school.id, "Basia", "Druga");
    await login(page, owner.email, owner.password, /\/app/);
    await expect(page.getByText("Dziś").first()).toBeVisible();
    await expect(page.getByTestId("slots-tile")).toHaveCount(0);

    // Jeden chętny, brak ogłoszeń
    await adminDb().from("waitlist_entries").insert({ organization_id: school.id, client_id: first.id });
    await page.goto("/app");
    const tile = page.getByTestId("slots-tile");
    await expect(tile).toContainText("1 chętny na wolny termin");
    await expect(tile).toContainText("Nie ma teraz ogłoszonych wolnych terminów.");

    // Dwóch chętnych
    await adminDb().from("waitlist_entries").insert({ organization_id: school.id, client_id: second.id });
    await page.goto("/app");
    await expect(tile).toContainText("2 chętnych na wolny termin");

    await tile.click();
    await expect(page).toHaveURL(/\/app\/sessions/);
  });
});
