import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska } from "./_flow";

/**
 * Skalowanie symboli razem ze skala rzutu.
 *
 * Sama arytmetyka ma komplet testow jednostkowych w `lib/symbolScale.test.ts`.
 * Tutaj chodzi o to, czego one nie widza: czy skala rzutu w ogole DOCIERA do
 * renderu, czy obrys wanny NA PLOTNIE pokrywa sie ze strefa 1 i czy suwak
 * rozmiaru rusza osprzetem, ale nie przyborami.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function naEkranie(page: Page, x: number, y: number) {
  const box = await planBox(page);
  // Kadr planu bywa przesunięty (widok startowy siada na rysunku, a użytkownik może
  // go przesunąć), więc samo powiększenie nie wystarcza: punkt planu ląduje na ekranie
  // tam, gdzie stoi SCENA. Bez składnika `x()`/`y()` ten przelicznik trafiał dobrze
  // tylko przy kadrze w zerze.
  const scena = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const s = k.stages[0];
    return { skala: s.scaleX(), x: s.x(), y: s.y() };
  });
  return { x: box.x + x * scena.skala + scena.x, y: box.y + y * scena.skala + scena.y };
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
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

/**
 * Kalibracja skali odcinkiem o ZNANEJ dlugosci w jednostkach planu: klikamy punkty
 * odlegle o `jednostki` i podajemy, ze to `metry`. Wynikowe `mpu` jest wiec z gory
 * wiadome i test moze sprawdzac konkretne liczby, a nie tylko "cos sie zmienilo".
 */
async function skalibruj(page: Page, jednostki: number, metry: number) {
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await klikNaPlanie(page, 100, 120);
  await klikNaPlanie(page, 100 + jednostki, 120);
  await page.getByLabel("Długość odcinka w metrach").fill(String(metry));
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
}

/** Skala renderu grupy trzymajacej symbol danego typu — to nia steruje cala zmiana. */
async function skalaSymbolu(page: Page, cornerRadius: number) {
  return page.evaluate((cr) => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type R = { fill(): string; cornerRadius(): number; getParent(): { scaleX(): number } };
    const rect = (k.stages[0].find("Rect") as R[]).find((n) => n.fill() === "#fff" && n.cornerRadius() === cr);
    return rect ? rect.getParent().scaleX() : null;
  }, cornerRadius);
}

/** Obrys wanny i prostokat strefy 1 — w pikselach sceny, prosto z Konvy. */
async function obrysy(page: Page) {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type R = { fill(): string; stroke(): string; cornerRadius(): number; getClientRect(): { width: number; height: number } };
    const rects = k.stages[0].find("Rect") as R[];
    const wanna = rects.find((n) => n.fill() === "#fff" && n.cornerRadius() === 9);
    const strefa1 = rects.find((n) => n.stroke() === "#C6433A");
    return {
      wanna: wanna ? wanna.getClientRect() : null,
      strefa1: strefa1 ? strefa1.getClientRect() : null,
    };
  });
}

/**
 * Rozmiar symbolu przy skali odniesienia, czyli `BASE_ELEMENT_SCALE` z symbolScale.ts.
 *
 * Ten plik testuje MATEMATYKĘ skalowania (kalibracja ×5 powiększa symbol ×5), więc
 * punkt odniesienia musi skądś wziąć. Trzymany w JEDNEJ stałej, a nie wpisany
 * czterokrotnie: sama wartość bazowa reguluje czytelność rysunku i wolno ją zmieniać,
 * a wtedy to ma być poprawka w jednej linijce, nie polowanie po pliku.
 */
const BAZA = 0.42;

test("bez kalibracji symbole zostaja przy dotychczasowym rozmiarze", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 400, 300);

  // Rysowanie od zera idzie na MANUAL_DRAW_SCALE_MPU, czyli dokladnie na skali
  // odniesienia — zaden istniejacy projekt nie ma prawa zmienic wygladu.
  const rect = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  expect(rect).toBeCloseTo(BAZA, 5);
});

test("gestsza kalibracja powieksza symbol dokladnie tyle, ile trzeba, by zajmowal tyle samo metrow", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  await klikNaPlanie(page, 400, 300);
  const przed = await skalaSymbolu(page, 9);

  // 200 jedn. = 2 m, czyli 1 jedn. = 1 cm — piec razy gesciej niz skala odniesienia.
  await skalibruj(page, 200, 2);
  const po = await skalaSymbolu(page, 9);

  expect(przed).toBeCloseTo(BAZA, 5);
  expect(po).toBeCloseTo(BAZA * 5, 4);
});

test("obrys wanny pokrywa sie ze strefa 1, ta sama, ktora liczy walidator", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  await klikNaPlanie(page, 400, 300);
  await skalibruj(page, 200, 2);

  const { wanna, strefa1 } = await obrysy(page);
  expect(wanna).toBeTruthy();
  expect(strefa1).toBeTruthy();
  // Roznica to wylacznie grubsza kreska obrysu (2 vs 1,2 jedn.) liczona przez
  // `getClientRect` — geometria jest ta sama co do jednostki.
  const luz = wanna!.width * 0.05;
  expect(Math.abs(wanna!.width - strefa1!.width)).toBeLessThan(luz);
  expect(Math.abs(wanna!.height - strefa1!.height)).toBeLessThan(luz);
});

test("suwak rozmiaru rusza osprzetem, ale nie przyborem sanitarnym", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  // Oba w granicach startowego kadru: rysowanie od zera otwiera się w skali 40 px/m
  // (patrz `PIKSELI_NA_METR_RYSOWANIA`), więc okno pokazuje około 480 × 300 jedn.
  await klikNaPlanie(page, 150, 150);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 350, 220);

  const gniazdoPrzed = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  const wannaPrzed = await skalaSymbolu(page, 9);

  await otworzMenuPaska(page, "Rysunek");
  const suwak = page.getByLabel("Rozmiar elementów");
  await suwak.fill("2");

  const gniazdoPo = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  const wannaPo = await skalaSymbolu(page, 9);

  expect(gniazdoPo).toBeCloseTo(gniazdoPrzed! * 2, 4);
  // Wanna ma pozostac wanna: jej obrys jest strefa ochronna, a nie ozdoba.
  expect(wannaPo).toBeCloseTo(wannaPrzed!, 5);
});

/**
 * Rzut BEZ skalibrowanej skali: rozmiar symboli bierze sie z WIELKOSCI RYSUNKU.
 *
 * Bez kalibracji nie wiadomo, ile metrow ma jednostka planu, wiec symbole mialy tu
 * po prostu rozmiar bazowy — na rysunku rozciagnietym na caly obszar planu gniazdko
 * schodzilo do kilku pikseli. Arytmetyka ma testy w `lib/symbolScale.test.ts`;
 * tutaj chodzi o to, czy rozpietosc NARYSOWANEGO rzutu w ogole dociera do renderu.
 */
async function pustyBezSkali(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  // „Pomiń — zacznę na pustym planie" NIE ustawia skali (robi to dopiero „Narysuj dom
  // samodzielnie" albo kalibracja) — i o ten stan tu chodzi.
  const naPustym = page.getByRole("button", { name: "Pomiń — zacznę na pustym planie" });
  await naPustym.waitFor({ state: "visible", timeout: 5000 });
  await naPustym.click();
  await expect(page.getByText(/Siatka:\s*skala nieustawiona/)).toBeVisible();
}

/**
 * Oddala widok, aż w oknie zmieści się podana szerokość planu.
 *
 * Potrzebne tam, gdzie rysunek MUSI być duży, bo o jego rozmiarze jest sam test
 * (domyślanie skali symboli z rozpiętości rzutu). Startowy kadr pokazuje około
 * 480 jedn. wszerz, więc pokój na 540 jedn. nie mieści się w nim z definicji.
 */
async function zmiescWKadrze(page: Page, jednostki: number) {
  const oddal = page.getByRole("button", { name: "Oddal widok" });
  for (let i = 0; i < 40; i++) {
    const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
    const zoom = await page.evaluate(
      () => (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva.stages[0].scaleX(),
    );
    if (jednostki * zoom < box.width && jednostki * zoom < box.height * 2) return;
    if (await oddal.isDisabled()) return;
    await oddal.click();
  }
}

async function narysujPokoj(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const a = await naEkranie(page, x1, y1);
  const b = await naEkranie(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
}

/** Skala renderu symbolu osprzetu — ta sama sciezka pomiaru, co w tescie wyzej. */
async function skalaOsprzetu(page: Page) {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    const p = k.stages[0].find("Path") as P[];
    return p.length ? p[0].getParent().scaleX() : null;
  });
}

test("bez skali symbol ROSNIE razem z rysunkiem", async ({ page }) => {
  await pustyBezSkali(page);
  // Pokoj szeroki na 540 jedn. — rysunek ponad dwa razy wiekszy od typowego domu
  // w skali odniesienia (240 jedn.). Takiego z zalozenia nie widac w calosci w kadrze
  // startowym, wiec najpierw robimy mu miejsce.
  await zmiescWKadrze(page, 700);
  await narysujPokoj(page, 60, 60, 600, 300);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 300, 70);

  const skala = await skalaOsprzetu(page);
  // 540 / 240 = 2,25 razy rozmiar bazowy.
  expect(skala).toBeCloseTo(BAZA * (540 / 240), 1);
});

test("bez skali MALY rysunek zostaje przy dotychczasowym rozmiarze", async ({ page }) => {
  await pustyBezSkali(page);
  await narysujPokoj(page, 100, 100, 300, 250);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 200, 110);

  // Domysl z rysunku tylko POWIEKSZA: rysunek mniejszy od typowego bywa po prostu
  // zaczety, a zmniejszanie symboli na takiej podstawie psuloby czytelnosc.
  expect(await skalaOsprzetu(page)).toBeCloseTo(BAZA, 5);
});

/**
 * Obszar TRAFIENIA nie może maleć razem z symbolem.
 *
 * Symbol jest rysowany w skali czytelności i dodatkowo zmniejszany powiększeniem
 * widoku. Przy oddalonym rzucie punkt sufitowy schodził przez to do kilku pikselów
 * i przestawał być klikalny — a kliknięcie w element to najczęstsza czynność
 * w edytorze. Regresja tego rodzaju nie boli w żadnym teście funkcjonalnym: element
 * ISTNIEJE i rysuje się poprawnie, tylko nie da się w niego trafić.
 */
test("w punkt sufitowy da sie kliknac takze przy mocno oddalonym widoku", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "sufit", /Punkt sufitowy/);
  await klikNaPlanie(page, 400, 300);

  // Oddalamy widok do minimum — tu symbol robi sie najmniejszy.
  // Przycisk blokuje sie po osiagnieciu minimum, wiec klikamy DOPOKI jest aktywny,
  // zamiast zgadywac, ile razy da sie go nacisnac.
  const oddal = page.getByRole("button", { name: "Oddal widok" });
  for (let i = 0; i < 12 && !(await oddal.isDisabled()); i++) await oddal.click();
  await page.waitForTimeout(400);

  // Klik liczony w RZECZYWISTY srodek elementu (stawianie przyciaga do siatki).
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const el = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements[0];
  });
  const canvas = (await page.locator(".konvajs-content").first().boundingBox())!;
  const widok = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), dx: st.x(), dy: st.y() };
  });
  await page.mouse.dblclick(canvas.x + el.x * widok.skala + widok.dx, canvas.y + el.y * widok.skala + widok.dy);

  await expect(page.getByText("Edytuj element")).toBeVisible();
});
