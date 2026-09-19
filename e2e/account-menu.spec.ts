import { test, expect } from "@playwright/test";

/**
 * Wygląd aplikacji po zalogowaniu: menu konta w nagłówku (avatar → Moje projekty /
 * Zapisz teraz / Wyloguj) i reset hasła w panelu logowania.
 *
 * Supabase nie jest skonfigurowany w tym środowisku (brak `.env`), więc prawdziwego
 * logowania nie da się przetestować e2e — seedujemy więc sesję wprost w localStorage
 * pod tym samym kluczem, którego używa `loadStoredSession()` w store, żeby przetestować
 * SAMO UI stanu zalogowanego bez zależności od backendu.
 */

const SESJA_KEY = "pomocnikelektryka_sesja";
const FAKE_SESSION = { token: "fake-token", user: { id: "u1", email: "elektryk@example.com" } };

async function wejdzZalogowany(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(
    ([key, session]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(session));
    },
    [SESJA_KEY, FAKE_SESSION] as const
  );
  await page.reload();
}

test("po zalogowaniu nagłówek pokazuje avatar zamiast „Zaloguj się”", async ({ page }) => {
  await wejdzZalogowany(page);
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeHidden();
  await expect(page.getByTitle(FAKE_SESSION.user.email)).toBeVisible();
});

test("menu konta pokazuje e-mail i pozwala otworzyć „Moje projekty”", async ({ page }) => {
  await wejdzZalogowany(page);
  await page.getByTitle(FAKE_SESSION.user.email).click();

  await expect(page.getByText(FAKE_SESSION.user.email, { exact: true })).toBeVisible();
  const projektyItem = page.getByRole("menuitem", { name: /Moje projekty/ });
  await expect(projektyItem).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Zapisz teraz/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Wyloguj/ })).toBeVisible();

  await projektyItem.click();
  // Okno nazywa się „Moje projekty", a nie „…w chmurze", odkąd pokazuje OBIE listy.
  // Zalogowany widzi jedną i drugą — i dopiero zestawione obok siebie tłumaczą, czym
  // różni się projekt trzymany w przeglądarce od tego na koncie.
  const okno = page.getByRole("dialog");
  await expect(okno.getByRole("heading", { name: "Moje projekty" })).toBeVisible();
  await expect(okno.getByRole("heading", { name: "W tej przeglądarce" })).toBeVisible();
  await expect(okno.getByRole("heading", { name: "Na koncie" })).toBeVisible();
});

test("„Wyloguj” w menu konta wraca do stanu niezalogowanego", async ({ page }) => {
  await wejdzZalogowany(page);
  await page.getByTitle(FAKE_SESSION.user.email).click();
  await page.getByRole("menuitem", { name: /Wyloguj/ }).click();

  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();
  await expect(page.getByTitle(FAKE_SESSION.user.email)).toBeHidden();

  // sesja realnie zniknęła, nie tylko wizualnie
  const sesjaPoWylogowaniu = await page.evaluate((key) => localStorage.getItem(key), SESJA_KEY);
  expect(sesjaPoWylogowaniu).toBeNull();
});

test("panel logowania: „Zapomniałeś hasła?” otwiera reset i da się wrócić do logowania", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  await page.getByRole("button", { name: "Zapomniałeś hasła?" }).click();
  await expect(page.getByRole("heading", { name: "Zresetuj hasło" })).toBeVisible();
  // pole hasła znika w trybie resetu — reset dotyczy tylko e-maila
  await expect(page.locator('input[type="password"]')).toBeHidden();

  await page.getByRole("button", { name: "Wróć do logowania" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
});
