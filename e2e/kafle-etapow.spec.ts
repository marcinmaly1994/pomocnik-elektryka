import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Pasek etapów 01→04: plakietki pokazujące STAN każdego etapu.
 *
 * Reguła (co znaczy „czeka", a co „gotowy") ma testy jednostkowe w
 * `src/lib/postepKrokow.test.ts`. Tutaj sprawdzamy to, czego nie widać bez
 * przeglądarki: że plakietka faktycznie trafia na kafel, że reaguje na zmianę
 * projektu i — najważniejsze — że kafel „czeka" nadal PROWADZI do zakładki,
 * zamiast zamieniać się w bramkę.
 */

async function swiezyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
}

/** Kafel etapu po tytule — plakietka i podtytuł są `aria-hidden`, więc nazwą
 *  dostępnościową przycisku jest sam tytuł. Wracamy z niego do kafla, żeby
 *  szukać plakietki W NIM, a nie gdziekolwiek na stronie. */
const kafel = (page: Page, tytul: string) =>
  page.getByRole("button", { name: tytul, exact: true }).first();

test("pusty projekt: 01 woła do siebie, a dalsze etapy przyznają się, że czekają", async ({ page }) => {
  await swiezyProjekt(page);

  await expect(kafel(page, "Instalacja")).toContainText("zacznij tutaj");
  for (const tytul of ["Rozdzielnica", "Schemat", "Kosztorys"]) {
    await expect(kafel(page, tytul)).toContainText("czeka");
  }

  // Plakietka mówi „czeka", ale dopiero opis mówi NA CO — i to jest właściwa
  // odpowiedź na „cztery identyczne kafle prowadzące w puste ekrany".
  await expect(kafel(page, "Rozdzielnica")).toHaveAttribute("title", /rozstawisz osprzęt/);
  await expect(kafel(page, "Kosztorys")).toHaveAttribute("title", /osprzętu na rzucie/);
});

test("projekt z osprzętem zapala wszystkie cztery kafle, z liczbami", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();

  await expect(kafel(page, "Instalacja")).toContainText(/\d+ el\./);
  await expect(kafel(page, "Rozdzielnica")).toContainText(/\d+ obw\./);
  await expect(kafel(page, "Schemat")).toContainText("gotowy");
  await expect(kafel(page, "Kosztorys")).toContainText("gotowy");

  // Liczba w plakietce i liczba w opisie to ta sama liczba, w poprawnej odmianie.
  const opis = await kafel(page, "Instalacja").getAttribute("title");
  expect(opis).toMatch(/Na rzucie stoi \d+ element(|y|ów)\./);
});

test("plakietki reagują na zmianę projektu, a nie zastygają przy wczytaniu", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(kafel(page, "Kosztorys")).toContainText("gotowy");

  // Wyjście z przykładu czyści projekt — kafle muszą wrócić do „czeka", inaczej
  // pasek kłamałby o pustym planie.
  await page.getByRole("button", { name: "Zacznij własny projekt" }).click();
  await page.getByRole("button", { name: "Tak, zacznij własny" }).click();
  await expect(kafel(page, "Kosztorys")).toContainText("czeka");
  await expect(kafel(page, "Instalacja")).toContainText("zacznij tutaj");
});

test("kafel „czeka” nadal prowadzi do zakładki — mówi prawdę, nie stawia bramki", async ({ page }) => {
  await swiezyProjekt(page);
  // Rozdzielnicę da się złożyć RĘCZNIE, bez rzutu, więc odbieranie tu nawigacji
  // byłoby gorsze niż problem, który plakietki naprawiają.
  await kafel(page, "Rozdzielnica").click();
  await expect(page).toHaveURL(/\/rozdzielnica$/);
  await expect(page.getByRole("button", { name: /Zbuduj rozdzielnicę bez rzutu/ })).toBeVisible();
});

test("ręcznie składana rozdzielnica zapala 02 i 03, ale nie kosztorys", async ({ page }) => {
  await swiezyProjekt(page);
  await kafel(page, "Rozdzielnica").click();
  await page.getByRole("button", { name: /Zbuduj rozdzielnicę bez rzutu/ }).click();

  await expect(kafel(page, "Rozdzielnica")).toContainText("ręcznie");
  await expect(kafel(page, "Schemat")).toContainText("gotowy");
  // Kosztorys liczy się WYŁĄCZNIE z rzutu: ręczna rozdzielnica nie mówi, ile
  // metrów kabla ani ile puszek trzeba kupić.
  await expect(kafel(page, "Kosztorys")).toContainText("czeka");
});
