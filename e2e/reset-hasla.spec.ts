import { test, expect } from "@playwright/test";

/**
 * Dokończenie resetu hasła: użytkownik klika link w mailu, Supabase odsyła go
 * pod adres aplikacji z tokenem we fragmencie, a aplikacja ma z tego zrobić
 * okno „ustaw nowe hasło".
 *
 * Tu sprawdzamy SAMO zachowanie na fragment — samej zmiany hasła nie wołamy,
 * bo token w tych testach jest zmyślony i nie ma po drugiej stronie konta.
 */

const FRAGMENT_RESETU = "#access_token=zmyslony-token&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery";

/** Prawdziwy fragment zaobserwowany na tym projekcie przy zużytym linku. */
const FRAGMENT_BLEDU =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";

test("link resetujący otwiera okno ustawienia nowego hasła", async ({ page }) => {
  await page.goto(`/${FRAGMENT_RESETU}`);

  await expect(page.getByRole("heading", { name: "Ustaw nowe hasło" })).toBeVisible();
  await expect(page.getByLabel("Nowe hasło", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Powtórz nowe hasło")).toBeVisible();
});

/**
 * Token z fragmentu pozwala ZMIENIĆ HASŁO. Zostawiony w pasku adresu ląduje
 * w historii przeglądarki i w każdym udostępnionym zrzucie ekranu, a odświeżenie
 * strony otwierałoby to okno w kółko.
 */
test("token znika z adresu zaraz po otwarciu okna", async ({ page }) => {
  await page.goto(`/${FRAGMENT_RESETU}`);
  await expect(page.getByRole("heading", { name: "Ustaw nowe hasło" })).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  expect(await page.evaluate(() => window.location.href)).not.toContain("zmyslony-token");
});

test("nowe hasło jest sprawdzane przed wysłaniem czegokolwiek", async ({ page }) => {
  await page.goto(`/${FRAGMENT_RESETU}`);

  await page.getByLabel("Nowe hasło", { exact: true }).fill("abc");
  await page.getByRole("button", { name: "Zapisz nowe hasło" }).click();
  await expect(page.getByText("Hasło musi mieć co najmniej 6 znaków.")).toBeVisible();

  await page.getByLabel("Nowe hasło", { exact: true }).fill("abcdef");
  await page.getByLabel("Powtórz nowe hasło").fill("ghijkl");
  await page.getByRole("button", { name: "Zapisz nowe hasło" }).click();
  await expect(page.getByText("Hasła nie są takie same.")).toBeVisible();
});

/**
 * Najczęstszy przypadek w praktyce: ktoś klika w link drugi raz albo po dwóch
 * dniach. Bez tego użytkownik ląduje na zwykłym ekranie startowym i nie ma
 * pojęcia, czemu reset „nie zadziałał".
 */
test("zużyty link tłumaczy, co się stało, zamiast milczeć", async ({ page }) => {
  await page.goto(`/${FRAGMENT_BLEDU}`);

  await expect(page.getByText("Link wygasł lub został już użyty. Poproś o nowy.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
});

test("zwykłe wejście na stronę nie otwiera żadnego z tych okien", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Ustaw nowe hasło" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeHidden();
});
