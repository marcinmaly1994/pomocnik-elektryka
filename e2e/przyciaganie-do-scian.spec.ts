import { test, expect, type Page } from "@playwright/test";

/**
 * Przyciaganie osprzetu do scian z obrotem symbolu.
 *
 * Sama geometria (wybor strony, prostopadlosc) ma komplet testow jednostkowych
 * w `lib/wallSnap.ts`. Tutaj chodzi o spiecie: czy dziala przy STAWIANIU i przy
 * PRZECIAGANIU, czy da sie je wylaczyc i czy nie dotyka tego, czego nie powinno.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

/**
 * Punkt PLANU przeliczony na wspolrzedne ekranu.
 *
 * Klikanie "na oko" offsetami ekranowymi zawodzi: widok sam dopasowuje powiekszenie,
 * a banery nad edytorem pojawiaja sie w trakcie pracy i przesuwaja plotno. Te testy
 * celuja w konkretna krawedz obrysu z dokladnoscia do kilku jednostek, wiec licza
 * pozycje z rzeczywistej skali sceny (ten sam wzorzec co `dwuklikWElement`
 * w light-groups.spec.ts).
 */
async function naEkranie(page: Page, x: number, y: number) {
  const box = await planBox(page);
  const skala = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva;
    return k.stages[0].scaleX();
  });
  return { x: box.x + x * skala, y: box.y + y * skala };
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Pomieszczenie o ZNANYCH wspolrzednych planu — jego krawedzie sluza za sciany. */
async function narysujPokoj(page: Page) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const a = await naEkranie(page, 200, 200);
  const b = await naEkranie(page, 600, 440);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
}

async function wybierz(page: Page, szukaj: string, nazwa: RegExp) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
}

async function klikNaPlanie(page: Page, x: number, y: number) {
  const p = await naEkranie(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function stan(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!).draft);
}

function lewaKrawedz(draft: { roomShapes: { points: { x: number }[] }[] }) {
  return Math.min(...draft.roomShapes[0].points.map((p) => p.x));
}

test("gniazdko postawione przy scianie przykleja sie do niej i obraca prostopadle", async ({ page }) => {
  await pustyProjekt(page);
  await narysujPokoj(page);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  // 4 jedn. planu w GLAB pokoju od lewej krawedzi — w zasiegu przyciagania (0,35 m = 7 jedn.).
  await klikNaPlanie(page, 204, 300);

  const draft = await stan(page);
  const g = draft.elements.find((e: { type: string }) => e.type === "gniazdko");
  expect(g).toBeTruthy();
  // Symbol stoi PO WEWNETRZNEJ stronie sciany i dotyka jej koncem trzonka — nie siedzi
  // na niej srodkiem, bo urzadzenie jest montowane W scianie, a nie na jej linii.
  // Dokladne odsuniecie (zasieg trzonka razy skala renderu symboli) pilnuja testy
  // jednostkowe snapElementToWall; tutaj chodzi o to, ze w ogole jest i idzie W GLAB.
  const odsuniecie = g.x - lewaKrawedz(draft);
  expect(odsuniecie).toBeGreaterThan(3);
  expect(odsuniecie).toBeLessThan(12);
  // Trzonek symbolu patrzy w lewo, czyli poza pomieszczenie — obrot 270 stopni.
  expect(g.rotation).toBeCloseTo(270, 0);
});

test("przeciagniecie do sciany przykleja tak samo jak postawienie", async ({ page }) => {
  await pustyProjekt(page);
  await narysujPokoj(page);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  // Srodek pokoju — daleko od krawedzi, wiec bez przyciagania.
  await klikNaPlanie(page, 400, 300);
  const przed = await stan(page);
  expect(przed.elements[0].rotation).toBe(0);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const skad = await naEkranie(page, 400, 300);
  const dokad = await naEkranie(page, 204, 300);
  await page.mouse.move(skad.x, skad.y);
  await page.mouse.down();
  await page.mouse.move(dokad.x, dokad.y, { steps: 8 });
  await page.mouse.up();

  const po = await stan(page);
  // Symbol stoi PO WEWNETRZNEJ stronie sciany i dotyka jej koncem trzonka — nie siedzi
  // na niej srodkiem, bo urzadzenie jest montowane W scianie, a nie na jej linii.
  // Dokladne odsuniecie (zasieg trzonka razy skala renderu symboli) pilnuja testy
  // jednostkowe snapElementToWall; tutaj chodzi o to, ze w ogole jest i idzie W GLAB.
  const odsuniecie = po.elements[0].x - lewaKrawedz(po);
  expect(odsuniecie).toBeGreaterThan(3);
  expect(odsuniecie).toBeLessThan(12);
  expect(po.elements[0].rotation).toBeCloseTo(270, 0);
});

test("punkt sufitowy NIE przykleja sie do sciany — wisi tam, gdzie go postawiono", async ({ page }) => {
  await pustyProjekt(page);
  await narysujPokoj(page);
  await wybierz(page, "sufit", /Punkt sufitowy/);
  await klikNaPlanie(page, 204, 300);

  const draft = await stan(page);
  const lampa = draft.elements.find((e: { type: string }) => e.type === "oswietlenie");
  expect(lampa.x).toBeGreaterThan(lewaKrawedz(draft) + 1);
  expect(lampa.rotation).toBe(0);
});

test("wylaczenie przyciagania zostawia element tam, gdzie klikneto", async ({ page }) => {
  await pustyProjekt(page);
  await narysujPokoj(page);
  await page.getByRole("checkbox", { name: "Przyciągaj osprzęt do ścian" }).uncheck();
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 204, 300);

  const draft = await stan(page);
  const g = draft.elements.find((e: { type: string }) => e.type === "gniazdko");
  expect(g.x).toBeGreaterThan(lewaKrawedz(draft) + 1);
  expect(g.rotation).toBe(0);
});

/**
 * Osprzet JUZ POSTAWIONY a zmiana skali symboli.
 *
 * `snapElementToWall` zapisuje pozycje odsunieta od sciany o tyle, ile mierzyl symbol
 * w chwili stawiania. Gdy skala zmieni sie pozniej — tu suwakiem rozmiaru, ale tak samo
 * dziala kalibracja rzutu i rozpoznana wielkosc rysunku — symbol rosl wokol starej
 * kotwicy i trzonek gniazdka wchodzil w mur. Arytmetyke przeliczenia pilnuje
 * `przeliczPrzyscienneDoSkali` w testach jednostkowych; tutaj chodzi o to, czy zmiana
 * skali w ogole DOCIERA do zapisanych elementow.
 */
test("powiekszenie symboli odsuwa juz postawione gniazdko, zeby dalej dotykalo sciany", async ({ page }) => {
  await pustyProjekt(page);
  await narysujPokoj(page);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 204, 300);

  const przed = await stan(page);
  const gPrzed = przed.elements.find((e: { type: string }) => e.type === "gniazdko");
  const odsunieciePrzed = gPrzed.x - lewaKrawedz(przed);

  // Suwak „Rozmiar elementow" z 1,0x na 2,0x — czyli symbol dwa razy wiekszy.
  await page.locator('input[type="range"]').first().fill("2");
  await page.waitForTimeout(300);

  const po = await stan(page);
  const gPo = po.elements.find((e: { type: string }) => e.type === "gniazdko");
  const odsunieciePo = gPo.x - lewaKrawedz(po);

  // Odsuniecie urosło proporcjonalnie do symbolu — trzonek dalej konczy sie na scianie,
  // zamiast wjechac w nia na polowe swojej dlugosci.
  expect(odsunieciePo / odsunieciePrzed).toBeCloseTo(2, 1);
  // Element nie powedrowal WZDLUZ sciany ani sie nie obrocil — zmienilo sie wylacznie
  // odsuniecie od niej.
  expect(gPo.y).toBeCloseTo(gPrzed.y, 5);
  expect(gPo.rotation).toBe(gPrzed.rotation);
});
