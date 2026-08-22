import { test, expect } from "@playwright/test";

/**
 * Panel konta: zakładki „Profil" (tożsamość, dane wykonawcy, zmiana hasła) i
 * „Ustawienia" (eksport danych, strefa zagrożenia) — dostępne z menu konta w
 * nagłówku po zalogowaniu.
 *
 * Supabase nie jest skonfigurowany w tym środowisku, więc sesja jest seedowana
 * wprost w localStorage (ten sam wzorzec co `account-menu.spec.ts`) — testujemy
 * SAMO UI, nie rzeczywiste wywołania sieciowe do Supabase.
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

async function otworzMenuKonta(page: import("@playwright/test").Page) {
  await page.getByTitle(FAKE_SESSION.user.email).click();
}

test("„Profil” z menu konta otwiera panel na zakładce Profil", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Profil" }).click();

  await expect(page.getByRole("heading", { name: "Twoje konto" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Profil" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(FAKE_SESSION.user.email, { exact: true })).toBeVisible();
  await expect(page.getByText("Dane wykonawcy")).toBeVisible();
  await expect(page.getByLabel("Imię i nazwisko")).toBeVisible();
});

test("„Ustawienia” z menu konta otwiera panel wprost na zakładce Ustawienia", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Ustawienia" }).click();

  await expect(page.getByRole("heading", { name: "Twoje konto" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ustawienia" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Twoje dane")).toBeVisible();
  await expect(page.getByText("Strefa zagrożenia")).toBeVisible();
});

test("zakładki w panelu konta przełączają się kliknięciem", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Profil" }).click();

  await page.getByRole("tab", { name: "Ustawienia" }).click();
  await expect(page.getByRole("tab", { name: "Ustawienia" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Pobierz kopię danych" })).toBeVisible();

  await page.getByRole("tab", { name: "Profil" }).click();
  await expect(page.getByRole("tab", { name: "Profil" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Imię i nazwisko")).toBeVisible();
});

test("dane wykonawcy z Profilu zapisują się do projektu (współdzielone z Protokołami)", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Profil" }).click();

  await page.getByLabel("Imię i nazwisko").fill("Jan Kowalski");
  await page.getByLabel("Nr uprawnień (SEP E/D)").fill("E/D 1234/56");
  await page.keyboard.press("Escape"); // zamyka modal, dane mają zostać w store mimo zamknięcia

  await page.waitForTimeout(900); // debounce autozapisu
  const wykonawca = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).docHeader;
  });
  expect(wykonawca.wykonawca).toBe("Jan Kowalski");
  expect(wykonawca.uprawnienia).toBe("E/D 1234/56");

  // ten sam formularz w Protokołach musi pokazać te same wartości — jedno źródło prawdy
  await page.getByRole("button", { name: "Protokoły" }).click();
  await expect(page.getByLabel("Wykonawca pomiarów")).toHaveValue("Jan Kowalski");
});

test("zmiana hasła: walidacja krótkiego hasła i niezgodnego potwierdzenia bez wywołania sieci", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Profil" }).click();

  await page.getByLabel("Nowe hasło", { exact: true }).fill("abc");
  await page.getByRole("button", { name: "Zmień hasło" }).click();
  await expect(page.getByText("Hasło musi mieć co najmniej 6 znaków.")).toBeVisible();

  await page.getByLabel("Nowe hasło", { exact: true }).fill("abcdef");
  await page.getByLabel("Powtórz nowe hasło").fill("ghijkl");
  await page.getByRole("button", { name: "Zmień hasło" }).click();
  await expect(page.getByText("Hasła nie są takie same.")).toBeVisible();
});

test("eksport danych pobiera plik JSON z projektem", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Ustawienia" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz kopię danych" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test("„Usuń wszystkie projekty z chmury” pyta o potwierdzenie przed jakimkolwiek działaniem", async ({ page }) => {
  await wejdzZalogowany(page);
  await otworzMenuKonta(page);
  await page.getByRole("menuitem", { name: "Ustawienia" }).click();

  let dialogText = "";
  page.once("dialog", async (dialog) => {
    dialogText = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Usuń wszystkie projekty z chmury" }).click();
  await expect.poll(() => dialogText).toContain("Usunąć WSZYSTKIE projekty zapisane w chmurze?");
});
