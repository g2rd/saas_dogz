import { expect, type Page } from "@playwright/test";

/** Logowanie przez formularz (jak użytkownik); czeka na przejście do panelu. */
export async function login(page: Page, email: string, password: string, expectedPath: RegExp = /\/(app|portal)/) {
  await page.goto("/login");
  await page.getByLabel(/^(E-mail|Email)$/).fill(email);
  await page.getByLabel(/^(Hasło|Password)$/).fill(password);
  await page.getByRole("button", { name: /^(Zaloguj się|Log in)$/ }).click();
  await expect(page).toHaveURL(expectedPath);
}

/** Wylogowanie z menu „Więcej”. */
export async function logout(page: Page, portal = false) {
  await page.goto(portal ? "/portal/more" : "/app/more");
  await page.getByRole("button", { name: /^(Wyloguj|Log out)$/ }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Komunikat błędu formularza (bez niewidocznego ogłaszacza zmiany trasy, który też ma rolę alertu). */
export const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Potwierdza operację w oknie potwierdzenia (arkusz od dołu na telefonie): klika przycisk potwierdzający w otwartym oknie. */
export async function confirmDialog(page: Page, label: string | RegExp) {
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label }).click();
  await expect(dialog).toBeHidden();
}

/** Data za `days` dni w zapisie RRRR-MM-DD (strefa przeglądarki testowej to Europe/Warsaw). */
export function isoInDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(date);
}

/** Rozwija sekcję `<details>` z podanym nagłówkiem (formularze „Dodaj psa”, „Sprzedaj pakiet”, „Zaksięguj wpłatę”). */
export async function openSection(page: Page, title: string | RegExp) {
  await page.locator("summary").filter({ hasText: title }).first().click();
}

/** Planuje zajęcia przez formularz trenera (klient, rodzaj, data, godzina). */
export async function scheduleSessionViaUi(page: Page, clientLabel: string, typeName: string, date: string, time: string) {
  await page.goto("/app/sessions/new");
  await page.getByLabel("Klient").selectOption({ label: clientLabel });
  const typeValue = await page.getByLabel("Rodzaj zajęć").locator("option", { hasText: typeName }).getAttribute("value");
  await page.getByLabel("Rodzaj zajęć").selectOption(typeValue!);
  await page.getByLabel("Data").fill(date);
  await page.getByLabel("Godzina").fill(time);
  await page.getByRole("button", { name: "Zaplanuj zajęcia" }).click();
  // Koniec adresu: sam prefiks /app/sessions pasowałby też do formularza /app/sessions/new, zanim akcja się zakończy
  await expect(page).toHaveURL(/\/app\/sessions$/);
}
