import { expect, test, type Page } from "@playwright/test";
import { addClient, addDog, createAccount, createSchool, grantPortalAccess, sellPackage } from "./support/api";
import { login } from "./support/ui";

/**
 * Układ przy wydłużonych tekstach (pseudo-lokalizacja, `src/shared/i18n/pseudo.ts`): ekrany na telefonie nie mogą przewijać się w poziomie.
 * Ciasteczko `dt_pseudo=1` działa tylko, gdy serwer testowy ma `ENABLE_PSEUDO_LOCALE=1`; wydłużone teksty mają samogłoski podwojone i nawiasy [ ].
 */
async function enablePseudo(page: Page) {
  await page.context().addCookies([{ name: "dt_pseudo", value: "1", url: "http://localhost:3100" }]);
}

/** Elementy wystające poza prawą krawędź okna (do komunikatu o błędzie) i szerokość przewijania strony. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > width + 1 && getComputedStyle(element).position !== "fixed") {
        offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)} "${(element.textContent ?? "").trim().slice(0, 40)}" → ${Math.round(rect.right)}px`);
      }
      if (offenders.length >= 5) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
  });
}

async function expectNoHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // Pseudo-lokalizacja musi być aktywna (nawiasy w tekstach interfejsu), inaczej test niczego nie sprawdza
  await expect(page.locator("main, body").first()).toContainText("[");
  const result = await overflow(page);
  expect(result.scrollWidth, `${path}: ${result.offenders.join(" | ")}`).toBeLessThanOrEqual(result.width + 1);
}

test.describe("pseudo-lokalizacja", () => {
  test.skip(({ isMobile }) => !isMobile, "Układ sprawdzamy w widoku telefonu");

  test("ekrany trenera i klienta mieszczą wydłużone teksty bez przewijania w poziomie @mobile", async ({ page, browser }) => {
    const owner = await createAccount("pseudo");
    const school = await createSchool(owner);
    const client = await addClient(owner, school.id, "Anna", "Pseudolokalna");
    await addDog(owner, school.id, client.id, "Burek");
    await sellPackage(owner, school.id, client.id, 10, 80000);
    // Logujemy się w zwykłym języku (formularz szukany po etykietach), pseudo-lokalizację włączamy po zalogowaniu
    await login(page, owner.email, owner.password, /\/app/);
    await enablePseudo(page);

    for (const path of [
      "/app",
      "/app/clients",
      "/app/clients/new",
      `/app/clients/${client.id}`,
      "/app/sessions",
      "/app/sessions/new",
      "/app/sessions/types",
      "/app/packages",
      "/app/packages/new",
      "/app/requests",
      "/app/more",
      "/app/notifications",
      "/app/notifications/settings",
      "/app/settings",
      "/app/team",
      "/app/feedback",
    ]) {
      await expectNoHorizontalScroll(page, path);
    }

    const account = await createAccount("klient-pseudo");
    await grantPortalAccess(school.id, client.id, account.id);
    const context = await browser.newContext({ locale: "pl-PL", viewport: { width: 412, height: 915 }, isMobile: true });
    const clientPage = await context.newPage();
    await login(clientPage, account.email, account.password, /\/portal/);
    await enablePseudo(clientPage);
    for (const path of ["/portal", "/portal/sessions", "/portal/payments", "/portal/dogs", "/portal/more", "/portal/notifications", "/portal/feedback"]) {
      await expectNoHorizontalScroll(clientPage, path);
    }
    await context.close();
  });
});
