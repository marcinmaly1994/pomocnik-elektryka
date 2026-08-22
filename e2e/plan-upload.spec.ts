import { test, expect } from "@playwright/test";

// 1x1 px PNG — wystarczy, żeby aplikacja uznała podkład za wgrany
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Wgranie podkładu to pierwsza czynność w przepływie, więc test pilnuje nie tylko tego,
 * ŻE kontrolka działa, ale też GDZIE stoi: w pierwszym ekranie i nad biblioteką
 * elementów. To akurat łatwo cofnąć przy przestawianiu JSX, a objawia się wyłącznie
 * tym, że nowy użytkownik nie znajduje punktu startowego.
 */
test("wgrywanie planu: widoczne bez scrollowania, zwija się po wgraniu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  const cta = page.getByRole("button", { name: /Wgraj rzut \/ zdjęcie/ });
  await expect(cta).toBeVisible();

  // najważniejsze: mieści się w pierwszym ekranie, bez przewijania
  const vh = page.viewportSize()!.height;
  const box = (await cta.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);

  // stoi NAD biblioteką elementów
  const lib = (await page.getByRole("button", { name: /Gniazda i zasilanie/ }).boundingBox())!;
  expect(box.y).toBeLessThan(lib.y);


  // po wgraniu blok zwija się do jednego wiersza
  await page.setInputFiles('input[type="file"]', {
    name: "rzut.png",
    mimeType: "image/png",
    buffer: PNG,
  });

  // Po wgraniu pliku otwiera się najpierw przycinanie — ten test go nie
  // dotyczy, więc pomijamy. Pominięcie ma zostawić wgrany podkład nietknięty.
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();
  // Po wgraniu sterowanie podkładem przenosi się do paska edytora i pokazuje NAZWĘ
  // pliku — przy kilku kondygnacjach to jedyny sposób sprawdzenia, który rzut leży pod spodem.
  await expect(page.getByText(/Podkład: rzut.png/)).toBeVisible();
  await expect(cta).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zmień" })).toBeVisible();


  // „Usuń" wraca do wezwania do działania
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(cta).toBeVisible();
});
