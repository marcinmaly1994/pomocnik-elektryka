import { test, expect, type Page } from "@playwright/test";

/**
 * Formularze konta po audycie z 10.11.2026 (punkty 5–12): walidacja po polsku,
 * potwierdzenie hasła przy rejestracji, pokaż/ukryj, `autocomplete`, ponowne
 * wysłanie linku potwierdzającego i zmiana adresu e-mail.
 *
 * Supabase jest PODSTAWIONY (`page.route`) — sprawdzamy, co aplikacja wysyła i co
 * pokazuje, bez zakładania prawdziwych kont.
 */

async function otworzLogowanie(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Zaloguj się" }).first().click();
  return page.getByRole("dialog");
}

test("logowanie: puste pola i zły adres dostają polski komunikat zamiast wyszarzonego przycisku", async ({ page }) => {
  const okno = await otworzLogowanie(page);
  const przycisk = okno.getByRole("button", { name: "Zaloguj się", exact: true });
  await expect(przycisk).toBeEnabled();

  await przycisk.click();
  await expect(okno.getByText("Podaj adres e-mail.")).toBeVisible();

  await okno.getByLabel("E-mail").fill("to-nie-email");
  await okno.getByLabel("E-mail").press("Enter");
  await expect(okno.getByText(/nie wygląda na adres e-mail/)).toBeVisible();

  await okno.getByLabel("E-mail").fill("jan@example.com");
  await przycisk.click();
  await expect(okno.getByText("Podaj hasło.")).toBeVisible();
});

test("pola mają autocomplete dla menedżerów haseł i siedzą w formularzu", async ({ page }) => {
  const okno = await otworzLogowanie(page);
  await expect(okno.locator("form")).toHaveCount(1);
  await expect(okno.getByLabel("E-mail")).toHaveAttribute("autocomplete", "username");
  await expect(okno.getByLabel("Hasło", { exact: true })).toHaveAttribute("autocomplete", "current-password");

  await okno.getByRole("button", { name: /Zarejestruj się/ }).click();
  await expect(okno.getByLabel("Hasło", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await expect(okno.getByLabel("Powtórz hasło")).toHaveAttribute("autocomplete", "new-password");
});

test("pokaż/ukryj przełącza widoczność hasła", async ({ page }) => {
  const okno = await otworzLogowanie(page);
  const pole = okno.getByLabel("Hasło", { exact: true });
  await pole.fill("tajne123");
  await expect(pole).toHaveAttribute("type", "password");
  await okno.getByRole("button", { name: "Pokaż wpisane znaki" }).click();
  await expect(pole).toHaveAttribute("type", "text");
  await okno.getByRole("button", { name: "Ukryj wpisane znaki" }).click();
  await expect(pole).toHaveAttribute("type", "password");
});

test("rejestracja: wymagania hasła widać od razu, a różne hasła nie wychodzą do serwera", async ({ page }) => {
  const zapytania: string[] = [];
  await page.route("**/auth/v1/signup", (r) => {
    zapytania.push(r.request().postData() ?? "");
    return r.fulfill({ json: { user: { id: "nowy", email: "jan@example.com" } } });
  });
  const okno = await otworzLogowanie(page);
  await okno.getByRole("button", { name: /Zarejestruj się/ }).click();
  await expect(okno.getByText("Co najmniej 8 znaków.")).toBeVisible();

  await okno.getByLabel("E-mail").fill("  jan@example.com ");
  await okno.getByLabel("Hasło", { exact: true }).fill("krotkie");
  await okno.getByLabel("Powtórz hasło").fill("krotkie");
  await okno.getByRole("button", { name: "Załóż konto" }).click();
  await expect(okno.getByText("Hasło musi mieć co najmniej 8 znaków.")).toBeVisible();

  await okno.getByLabel("Hasło", { exact: true }).fill("dlugiehaslo1");
  await okno.getByLabel("Powtórz hasło").fill("dlugiehaslo2");
  await okno.getByRole("button", { name: "Załóż konto" }).click();
  await expect(okno.getByText("Hasła nie są takie same.")).toBeVisible();
  expect(zapytania).toHaveLength(0);

  await okno.getByLabel("Powtórz hasło").fill("dlugiehaslo1");
  await okno.getByRole("button", { name: "Załóż konto" }).click();
  await expect(okno.getByText(/Wysłaliśmy link potwierdzający/)).toBeVisible();
  // Spacje z brzegów adresu nie idą do serwera.
  expect(JSON.parse(zapytania[0]).email).toBe("jan@example.com");
  await expect(okno.getByRole("button", { name: /Wyślij link potwierdzający ponownie/ })).toBeVisible();
});

test("niepotwierdzone konto: komunikat i ponowne wysłanie linku", async ({ page }) => {
  const ponowne: string[] = [];
  await page.route("**/auth/v1/token?grant_type=password", (r) =>
    r.fulfill({ status: 400, json: { error_code: "email_not_confirmed", msg: "Email not confirmed" } })
  );
  await page.route("**/auth/v1/resend", (r) => {
    ponowne.push(r.request().postData() ?? "");
    return r.fulfill({ json: {} });
  });
  const okno = await otworzLogowanie(page);
  await okno.getByLabel("E-mail").fill("jan@example.com");
  await okno.getByLabel("Hasło", { exact: true }).fill("cokolwiek");
  await okno.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(okno.getByText(/nie został jeszcze potwierdzony/)).toBeVisible();

  await okno.getByRole("button", { name: /Wyślij link potwierdzający ponownie/ }).click();
  await expect(okno.getByText(/wysłaliśmy nowy link na jan@example.com/)).toBeVisible();
  expect(JSON.parse(ponowne[0])).toEqual({ type: "signup", email: "jan@example.com" });
});

test("błąd formatu adresu z serwera wychodzi po polsku", async ({ page }) => {
  await page.route("**/auth/v1/recover", (r) =>
    r.fulfill({ status: 400, json: { error_code: "validation_failed", msg: "Unable to validate email address: invalid format" } })
  );
  const okno = await otworzLogowanie(page);
  await okno.getByRole("button", { name: "Zapomniałeś hasła?" }).click();
  // Adres przechodzi naszą luźną walidację, a serwer i tak go odrzuca.
  await okno.getByLabel("E-mail").fill("jan@przyklad.x");
  await okno.getByRole("button", { name: "Wyślij link resetujący" }).click();
  await expect(okno.getByText("Nieprawidłowy adres e-mail.")).toBeVisible();
});

test("link potwierdzający rejestrację: fragment z tokenem znika z adresu, a okno mówi, co dalej", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // Ta sama strona z innym `#` to nawigacja bez przeładowania — dopiero reload
  // odtwarza wejście z maila.
  await page.goto("/#access_token=eyJabc&refresh_token=r&type=signup");
  await page.reload();
  await expect(page.getByRole("dialog").getByText("Adres e-mail potwierdzony. Możesz się zalogować.")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("zmiana adresu e-mail: wymaga hasła i wysyła nowy adres świeżym tokenem", async ({ page }) => {
  const SESJA = { token: "fake-token", user: { id: "u1", email: "elektryk@example.com" } };
  const zmiany: { auth: string; body: unknown }[] = [];
  await page.route("**/auth/v1/token?grant_type=password", (r) =>
    r.fulfill({ json: { access_token: "swiezy-token", refresh_token: "r", expires_in: 3600, user: SESJA.user } })
  );
  await page.route("**/auth/v1/user", (r) => {
    zmiany.push({ auth: r.request().headers()["authorization"] ?? "", body: r.request().postDataJSON() });
    return r.fulfill({ json: SESJA.user });
  });
  await page.route("**/auth/v1/logout**", (r) => r.fulfill({ status: 204, body: "" }));

  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("pomocnikelektryka_sesja", JSON.stringify(s));
  }, SESJA);
  await page.reload();
  await page.getByTitle(SESJA.user.email).click();
  await page.getByRole("menuitem", { name: "Profil" }).click();

  await page.getByLabel("Nowy adres e-mail").fill("elektryk@example.com");
  await page.getByRole("button", { name: "Zmień adres" }).click();
  await expect(page.getByText("To jest obecny adres tego konta.")).toBeVisible();

  await page.getByLabel("Nowy adres e-mail").fill("nowy@example.com");
  await page.getByRole("button", { name: "Zmień adres" }).click();
  await expect(page.getByText("Podaj obecne hasło.")).toBeVisible();

  await page.getByLabel("Hasło do konta").fill("obecne-haslo");
  await page.getByRole("button", { name: "Zmień adres" }).click();
  await expect(page.getByText(/Wysłaliśmy link potwierdzający na nowy@example.com/)).toBeVisible();
  expect(zmiany).toEqual([{ auth: "Bearer swiezy-token", body: { email: "nowy@example.com" } }]);
});
