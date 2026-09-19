import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Wpisywanie długości rysowanego odcinka.
 *
 * Do tej pory jedyną drogą do konkretnego wymiaru było celowanie myszą w piksel —
 * przy planie mieszkania oznaczało to kilkanaście prób i tak nigdy nie dawało równych
 * 4,20 m. Teraz klika się z grubsza, a potem wpisuje liczbę.
 *
 * Test MUSI sięgnąć do ZAPISU, a nie do etykiety na płótnie: chodzi o to, czy odcinek
 * naprawdę ma podaną długość w danych projektu, a nie o to, co akurat narysowano.
 */

/** Skala wpisana wprost do zapisu: kalibracja myszą to osobny, długi przepływ,
 *  a tutaj potrzebny jest tylko znany przelicznik jednostek na metry. */
const METROW_NA_JEDNOSTKE = 0.05;

async function planZeSkala(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // Zapis musi już ISTNIEĆ, zanim go podmienimy: autozapis chodzi z opóźnieniem, więc
  // tuż po wejściu w zakładkę slotu projektu jeszcze nie ma i `JSON.parse(null)` rzuca.
  await page.waitForFunction(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return !!id && !!localStorage.getItem(`pomocnikelektryka_projekt_${id}`);
  });
  await page.evaluate((mpu) => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const klucz = `pomocnikelektryka_projekt_${id}`;
    const a = JSON.parse(localStorage.getItem(klucz)!);
    a.scales = { f1: mpu };
    localStorage.setItem(klucz, JSON.stringify(a));
  }, METROW_NA_JEDNOSTKE);
  await page.reload();
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Ściany zapisane w projekcie — wprost z pamięci przeglądarki. */
async function zapisaneSciany(page: Page) {
  return page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = localStorage.getItem(`pomocnikelektryka_projekt_${id}`);
    return JSON.parse(raw!).draft.walls as { points: { x: number; y: number }[] }[];
  });
}

test("wpisana długość trafia do zapisanej ściany, a kąt zostaje nietknięty", async ({ page }) => {
  const box = await planZeSkala(page);

  // Odcinek poziomy, długość z grubsza — dokładnie tak, jak klika człowiek.
  await page.mouse.click(box.x + 150, box.y + 200);
  await page.mouse.click(box.x + 310, box.y + 200);

  const pole = page.getByTestId("wall-segment-length-input");
  await expect(pole).toBeVisible();
  await pole.fill("4,2");
  await pole.press("Enter");

  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const sciany = await zapisaneSciany(page);
  expect(sciany).toHaveLength(1);
  const [a, b] = sciany[0].points;
  const dlugoscM = Math.hypot(b.x - a.x, b.y - a.y) * METROW_NA_JEDNOSTKE;
  expect(dlugoscM).toBeCloseTo(4.2, 2);
  // Kąt bez zmian: odcinek był poziomy i ma taki zostać.
  expect(b.y).toBeCloseTo(a.y, 6);
});

test("przecinek dziesiętny działa tak samo jak kropka", async ({ page }) => {
  const box = await planZeSkala(page);
  await page.mouse.click(box.x + 150, box.y + 250);
  await page.mouse.click(box.x + 300, box.y + 250);

  const pole = page.getByTestId("wall-segment-length-input");
  // Na polskiej klawiaturze numerycznej pod ręką jest przecinek, a `Number("4,2")`
  // daje NaN — bez zamiany pole po cichu odrzucałoby połowę wpisywanych wartości.
  await pole.fill("2,5");
  await pole.press("Enter");
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const [{ points }] = await zapisaneSciany(page);
  const dlugoscM = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) * METROW_NA_JEDNOSTKE;
  expect(dlugoscM).toBeCloseTo(2.5, 2);
});

test("Enter w polu długości NIE kończy rysowania ściany", async ({ page }) => {
  const box = await planZeSkala(page);
  await page.mouse.click(box.x + 150, box.y + 300);
  await page.mouse.click(box.x + 280, box.y + 300);

  const pole = page.getByTestId("wall-segment-length-input");
  await pole.fill("3");
  await pole.press("Enter");

  // Poza polem Enter zatwierdza całą ścianę. W polu ma zatwierdzić samą liczbę —
  // inaczej wpisanie wymiaru kończyłoby rysowanie w połowie ściany.
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toBeVisible();
});

test("bzdurna wartość nie rusza odcinka", async ({ page }) => {
  const box = await planZeSkala(page);
  await page.mouse.click(box.x + 150, box.y + 350);
  await page.mouse.click(box.x + 310, box.y + 350);

  const pole = page.getByTestId("wall-segment-length-input");
  const przed = await pole.inputValue();
  await pole.fill("-7");
  await pole.press("Enter");

  // Pole wraca do poprzedniej wartości, zamiast zapisać ujemną długość.
  await expect(pole).toHaveValue(przed);
});
