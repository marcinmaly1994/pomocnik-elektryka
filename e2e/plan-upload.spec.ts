import { test, expect } from "@playwright/test";

// 1x1 px PNG — wystarczy, żeby aplikacja uznała podkład za wgrany
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Wgranie podkładu to pierwsza czynność w całym przepływie. Na zupełnie świeżym
 * projekcie jedynym wezwaniem do działania jest ekran startowy (patrz
 * `showEntryScreen` w DesignTab.tsx — jeden wybór zamiast banera + karty
 * onboardingu + pustej siatki naraz), więc test pilnuje GO, nie starego banera:
 * że kontrolka jest widoczna bez przewijania, że to jedyne wezwanie do działania
 * na ekranie, i że wgranie faktycznie działa i zwija się po zakończeniu.
 */
test("wgrywanie planu: ekran startowy widoczny bez scrollowania, zwija się po wgraniu", async ({ page }) => {
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

  // JEDYNE wezwanie do działania — biblioteka elementów (edytor) jeszcze nie
  // istnieje, a stary, trwały baner "Zacznij od wgrania rzutu" jest na czas
  // ekranu startowego zgaszony (dublowałby dokładnie ten sam wybór).
  await expect(page.getByRole("button", { name: /Gniazda i zasilanie/ })).toHaveCount(0);
  await expect(page.getByText("Zacznij od wgrania rzutu mieszkania")).toHaveCount(0);

  // wgranie działa z ekranu startowego dokładnie tak samo jak dawny baner
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
  // ekran startowy nie wraca — edytor (biblioteka elementów) jest teraz widoczny
  await expect(page.getByRole("button", { name: /Gniazda i zasilanie/ })).toBeVisible();

  // „Usuń" wraca do wezwania do działania — projekt jest znów zupełnie świeży
  // (bez podkładu, skali, elementów), więc to znów ekran startowy, nie edytor
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(cta).toBeVisible();
});
