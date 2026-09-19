import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Osprzęt stawiany blisko siebie ma stanąć OBOK, a nie jeden na drugim.
 *
 * Klik decyduje o środku symbolu, a symbol ma swoją szerokość — o której klikający nie
 * myśli. Dwa gniazda lądowały więc jedno na drugim i spod wierzchniego nie dało się już
 * wyciągnąć tego pod spodem ani zobaczyć, że tam jest: na rysunku zostawało jedno
 * gniazdo, a w zestawieniu dwa.
 */

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Punkt planu na współrzędne ekranu — przez żywą transformację sceny. */
async function naEkranie(page: Page, x: number, y: number) {
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const s = await page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva
      .stages[0];
    return { skala: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: box.x + x * s.skala + s.x, y: box.y + y * s.skala + s.y };
}

async function zapisaneElementy(page: Page) {
  await page.waitForTimeout(900); // debounce autozapisu
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return raw ? (JSON.parse(raw).draft.elements as { x: number; y: number; type: string }[]) : [];
  });
}

/** Prostokąty zajmowane NA EKRANIE przez symbole stojące w podanych punktach planu. */
async function ramkiSymboli(page: Page, pozycje: { x: number; y: number }[]) {
  return page.evaluate((punkty) => {
    const stage = (
      window as unknown as {
        Konva: {
          stages: {
            find(sel: string): {
              x(): number;
              y(): number;
              getClientRect(): { x: number; y: number; width: number; height: number };
            }[];
          }[];
        };
      }
    ).Konva.stages[0];
    return punkty.map((p) => {
      const g = stage.find("Group").find((n) => Math.abs(n.x() - p.x) < 0.01 && Math.abs(n.y() - p.y) < 0.01);
      return g ? g.getClientRect() : null;
    });
  }, pozycje);
}

test("dwa gniazda postawione blisko siebie nie nachodzą na siebie", async ({ page }) => {
  await otworzPlan(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();

  // Drugi klik cztery jednostki (20 cm) od pierwszego — czyli w środek symbolu sąsiada.
  const a = await naEkranie(page, 150, 150);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(400); // patrz komentarz o dwukliku w teście niżej
  const b = await naEkranie(page, 154, 150);
  await page.mouse.click(b.x, b.y);

  const elementy = await zapisaneElementy(page);
  expect(elementy, "oba gniazda mają zostać na rysunku").toHaveLength(2);

  const ramki = await ramkiSymboli(page, elementy);
  expect(ramki[0], "symbol pierwszego gniazda musi być na scenie").not.toBeNull();
  expect(ramki[1], "symbol drugiego gniazda musi być na scenie").not.toBeNull();

  const [p, q] = ramki as { x: number; y: number; width: number; height: number }[];
  const nachodza = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
  expect(nachodza, "symbole nie mogą na siebie nachodzić").toBe(false);

  // Rozsunięte WZDŁUŻ ściany, czyli w rzędzie: wysokość montażu zostaje ta sama.
  expect(elementy[0].y).toBeCloseTo(elementy[1].y, 6);
  // I naprawdę obok siebie, a nie wyrzucone gdzieś daleko.
  expect(Math.abs(elementy[0].x - elementy[1].x)).toBeLessThan(60);
});

test("trzecie gniazdo dostawia się do rzędu, zamiast wchodzić na drugie", async ({ page }) => {
  await otworzPlan(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();

  // Każdy klik tuż ZA krawędzią symbolu, który już stoi, ale bliżej niż wymagany
  // odstęp — czyli rozsuwanie ma co robić. Klik w sam symbol go zaznacza, zamiast
  // stawiać kolejny (zmierzone: gniazdo sięga 3,8 jedn. od środka).
  for (const x of [150, 156, 164]) {
    const p = await naEkranie(page, x, 150);
    await page.mouse.click(p.x, p.y);
    // Przerwa, bo dwa kliknięcia obok siebie w krótkim odstępie przeglądarka zlewa
    // w DWUKLIK — a dwuklik w element otwiera jego edycję, zamiast postawić kolejny.
    await page.waitForTimeout(700);
  }

  const elementy = await zapisaneElementy(page);
  expect(elementy).toHaveLength(3);

  const ramki = (await ramkiSymboli(page, elementy)) as { x: number; y: number; width: number; height: number }[];
  for (let i = 0; i < ramki.length; i++) {
    for (let j = i + 1; j < ramki.length; j++) {
      const p = ramki[i];
      const q = ramki[j];
      const nachodza = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(nachodza, `symbole ${i} i ${j} nachodzą na siebie`).toBe(false);
    }
  }
});

/** Czy dwa prostokąty ekranowe na siebie nachodzą. */
function nachodza(
  p: { x: number; y: number; width: number; height: number },
  q: { x: number; y: number; width: number; height: number },
) {
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

/**
 * Klik W ISTNIEJĄCY element w trybie wstawiania stawia KOLEJNY, a nie zaznacza.
 *
 * Wcześniej taki klik tylko zaznaczał trafiony element, więc dostawienie gniazda obok
 * istniejącego wymagało trafienia poza jego symbol (ok. 4 jedn.). To zderzało się
 * z rozsuwaniem, które powstało po to, żeby gniazda klikane blisko siebie układały się
 * w rząd: pomoc włączała się dopiero wtedy, gdy i tak trafiło się w wolne miejsce.
 */
test("klik w stojące gniazdo dostawia obok kolejne, zamiast je zaznaczyć", async ({ page }) => {
  await otworzPlan(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();

  const a = await naEkranie(page, 150, 150);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(500); // inaczej drugi klik w to samo miejsce to DWUKLIK

  const pierwsze = (await zapisaneElementy(page))[0];
  const naSymbolu = await naEkranie(page, pierwsze.x, pierwsze.y);
  await page.mouse.click(naSymbolu.x, naSymbolu.y);

  const elementy = await zapisaneElementy(page);
  expect(elementy, "klik w symbol ma postawić drugie gniazdo").toHaveLength(2);

  const ramki = (await ramkiSymboli(page, elementy)) as { x: number; y: number; width: number; height: number }[];
  expect(nachodza(ramki[0], ramki[1]), "i ma stanąć OBOK, nie na wierzchu").toBe(false);
});

/**
 * Nasunięcie jednego gniazda na drugie PRZECIĄGNIĘCIEM też je rozsuwa.
 *
 * Bez tego zakaz nakładania obowiązywał w jedną stronę: postawić jedno na drugim się
 * nie dało, ale nasunąć ręcznie już tak — i wracał ten sam problem, bo spod wierzchniego
 * symbolu nie da się wyciągnąć tego pod spodem.
 */
test("przeciągnięcie gniazda na drugie rozsuwa je, zamiast nałożyć", async ({ page }) => {
  await otworzPlan(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();

  const a = await naEkranie(page, 150, 150);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(500);
  const b = await naEkranie(page, 260, 150);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(900);

  const przed = await zapisaneElementy(page);
  expect(przed).toHaveLength(2);

  // Przeciągamy drugie DOKŁADNIE na pierwsze.
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const skad = await naEkranie(page, przed[1].x, przed[1].y);
  const dokad = await naEkranie(page, przed[0].x, przed[0].y);
  await page.mouse.move(skad.x, skad.y);
  await page.mouse.down();
  await page.mouse.move(dokad.x, dokad.y, { steps: 10 });
  await page.mouse.up();

  const po = await zapisaneElementy(page);
  expect(po, "przeciąganie nie może gubić ani dublować elementów").toHaveLength(2);

  const ramki = (await ramkiSymboli(page, po)) as { x: number; y: number; width: number; height: number }[];
  expect(ramki[0], "symbol pierwszego gniazda musi być na scenie").not.toBeNull();
  expect(ramki[1], "symbol drugiego gniazda musi być na scenie").not.toBeNull();
  expect(nachodza(ramki[0], ramki[1]), "po puszczeniu symbole mają się rozsunąć").toBe(false);
});
