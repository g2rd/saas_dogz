import { expect, test } from "@playwright/test";
import { adminDb, createAccount, PASSWORD } from "./support/api";
import { alertOf, login, logout } from "./support/ui";

const stamp = () => crypto.randomUUID().slice(0, 8);

test.describe("konto trenera", () => {
  test("rejestracja wymaga zgody, zakłada konto i szkołę, zgoda zapisuje się z wersją dokumentów @mobile", async ({ page }) => {
    const email = `e2e-signup-${stamp()}@example.test`;
    await page.goto("/signup");

    // Pole zgody jest wymagane i prowadzi do obu dokumentów
    const consent = page.getByRole("checkbox", { name: /Akceptuję/ });
    await expect(consent).toHaveAttribute("required", "");
    await expect(page.getByRole("link", { name: "Regulamin testów" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Politykę prywatności" })).toHaveAttribute("href", "/privacy");

    await page.getByLabel("Imię i nazwisko").fill("Ola Trenerka");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Hasło").fill(PASSWORD);
    await consent.check();
    await page.getByRole("button", { name: "Załóż konto" }).click();

    // Nowe konto trafia do kreatora szkoły
    await expect(page.getByRole("heading", { name: "Panel trenera" })).toBeVisible();
    await page.getByLabel("Nazwa Twojej szkoły lub działalności").fill(`Szkoła E2E ${stamp()}`);
    await page.getByRole("button", { name: "Utwórz organizację" }).click();
    await expect(page.getByText("Dziś").first()).toBeVisible();

    // Zgoda zapisana w bazie dla obu dokumentów
    const { data: users } = await adminDb().auth.admin.listUsers({ perPage: 1000 });
    const user = users.users.find((u) => u.email === email);
    expect(user).toBeDefined();
    const { data: consents } = await adminDb().from("consents").select("document, version").eq("user_id", user!.id).order("document");
    expect(consents?.map((c) => c.document)).toEqual(["privacy", "terms"]);
    expect(consents?.[0].version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("logowanie: zły adres lub hasło daje jeden komunikat, poprawne dane wpuszczają i wylogowanie działa", async ({ page }) => {
    const owner = await createAccount("logowanie");
    await owner.db.rpc("create_organization", { p_name: `Szkoła logowania ${stamp()}`, p_slug: `e2e-log-${stamp()}` });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByLabel("Hasło").fill("zle-haslo-123");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(alertOf(page)).toContainText("Nieprawidłowy e-mail lub hasło");
    await expect(page).toHaveURL(/\/login/);

    await login(page, owner.email, owner.password, /\/app/);
    await expect(page.getByRole("heading", { name: "Panel trenera" })).toBeVisible();

    await logout(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("reset hasła nie zdradza, czy konto istnieje, a wiadomość trafia do skrzynki w języku konta", async ({ page, request }) => {
    const owner = await createAccount("reset", { locale: "en" });
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByRole("button", { name: "Wyślij link" }).click();
    await expect(page.getByRole("status")).toContainText("Jeśli konto z tym adresem istnieje");

    // Ten sam komunikat dla adresu, którego nie ma
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail").fill(`nie-ma-${stamp()}@example.test`);
    await page.getByRole("button", { name: "Wyślij link" }).click();
    await expect(page.getByRole("status")).toContainText("Jeśli konto z tym adresem istnieje");

    // Wiadomość Supabase Auth: szablon angielski dla konta z locale=en
    await expect
      .poll(async () => {
        const search = (await (await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${owner.email}`)}`)).json()) as { messages?: { ID: string }[] };
        return search.messages?.length ?? 0;
      })
      .toBeGreaterThan(0);
    const search = (await (await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${owner.email}`)}`)).json()) as { messages: { ID: string }[] };
    const mail = (await (await request.get(`http://127.0.0.1:54324/api/v1/message/${search.messages[0].ID}`)).json()) as { HTML: string };
    expect(mail.HTML).toContain("Reset your DogTrainer password");
  });
});
