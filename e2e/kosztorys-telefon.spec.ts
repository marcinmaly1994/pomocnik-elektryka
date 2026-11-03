import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kosztorys na telefonie mieści się w ekranie — łącznie z kolumną wartości.
 *
 * Tabela miała pięć kolumn o stałych szerokościach pól (ilość, cena, wartość) i na
 * 375 px wychodziła poza kartę: kolumna „Wartość" leżała za prawą krawędzią, dostępna
 * tylko przez przewinięcie tabeli w bok, o którym nic nie mówiło. Na wąskim ekranie
 * wiersz jest teraz kartą: nazwa u góry, trzy podpisane pola pod spodem.
 *
 * Emulacja telefonu (`isMobile`) — patrz edytor-telefon-zwarty.spec.ts.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test("wartość pozycji widać na telefonie bez przewijania tabeli w bok", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();

  const wartosc = page.getByLabel(/^Wartość pozycji: Gniazdo RJ45/);
  await expect(wartosc).toBeVisible();

  const pomiar = await page.evaluate(() => {
    const tabela = document.querySelector("table")!;
    const okno = tabela.parentElement!;
    const pole = document.querySelector<HTMLInputElement>('input[aria-label^="Wartość pozycji: Gniazdo RJ45"]')!;
    return {
      przewijanaWBok: okno.scrollWidth > okno.clientWidth + 1,
      stronaWBok: document.documentElement.scrollWidth > window.innerWidth + 1,
      prawaPola: pole.getBoundingClientRect().right,
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanaWBok).toBe(false);
  expect(pomiar.stronaWBok).toBe(false);
  expect(pomiar.prawaPola).toBeLessThanOrEqual(pomiar.szerokoscOkna);

  // Podpisy pól zastępują nagłówek tabeli, który na telefonie jest schowany.
  // Jednostka stoi w podpisie („Wartość, zł"), a nie obok liczby — patrz test niżej.
  await expect(page.locator("tbody").getByText("Wartość, zł", { exact: true }).first()).toBeVisible();
});

/**
 * Pola kosztorysu na telefonie mieszczą swoje liczby — przy każdej szerokości telefonu.
 *
 * Proporcje kolumn karty (ilość / cena / wartość) dały polu wartości za mało miejsca:
 * „220,00" wyglądało jak „220,0", bo pole dzieli szerokość z jednostką i przyciskiem
 * cofania. Przy 375 px ucinało się 13 z 32 pól, przy 320 px wszystkie. Test mierzy
 * szerokość tekstu i szerokość wnętrza pola, więc łapie ucięcie, którego żaden
 * `scrollWidth` nie widzi (pole `input` przycina tekst bez przewijania).
 */
test("żadne pole kosztorysu nie ucina liczby na telefonie — od 320 do 430 px", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  await expect(page.getByLabel(/^Wartość pozycji: Gniazdo RJ45/)).toBeVisible();

  for (const szerokosc of [320, 360, 375, 430]) {
    await page.setViewportSize({ width: szerokosc, height: 812 });
    await page.waitForTimeout(150);
    const ucinane = await page.evaluate(() => {
      const plotno = document.createElement("canvas").getContext("2d")!;
      const wynik: string[] = [];
      for (const pole of document.querySelectorAll<HTMLInputElement>("tbody input")) {
        const nazwa = pole.getAttribute("aria-label") ?? "";
        if (!/^(Ilość|Cena jednostkowa|Wartość pozycji):/.test(nazwa)) continue;
        const stylPola = getComputedStyle(pole);
        plotno.font = `${stylPola.fontWeight} ${stylPola.fontSize} ${stylPola.fontFamily}`;
        const tekst = pole.value || pole.placeholder;
        const miejsce = pole.clientWidth - parseFloat(stylPola.paddingLeft) - parseFloat(stylPola.paddingRight);
        if (plotno.measureText(tekst).width > miejsce) wynik.push(`${nazwa} = ${tekst}`);
      }
      return wynik;
    });
    expect(ucinane, `szerokość ${szerokosc} px`).toEqual([]);

    // Pola jednego wiersza stoją na tej samej wysokości: gdyby podpis którejś kolumny
    // łamał się na dwie linie (jak „Cena jedn." w wąskiej kolumnie), pole pod nim
    // zjeżdżałoby niżej od sąsiadów.
    const wysokosci = await page.evaluate(() => {
      const pole = (etykieta: string) =>
        document.querySelector<HTMLInputElement>(`input[aria-label^="${etykieta}: Gniazdko 230V podtynkowe"]`)!.getBoundingClientRect().top;
      return [pole("Ilość"), pole("Cena jednostkowa"), pole("Wartość pozycji")];
    });
    expect(Math.max(...wysokosci) - Math.min(...wysokosci), `szerokość ${szerokosc} px`).toBeLessThan(2);
  }
});

test("na komputerze kosztorys zostaje tabelą z nagłówkiem", async ({ browser }) => {
  const kontekst = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await kontekst.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  await expect(page.getByRole("columnheader", { name: /Wartość/ })).toBeVisible();
  const wyswietlanie = await page.evaluate(() => getComputedStyle(document.querySelector("table")!).display);
  expect(wyswietlanie).toBe("table");
  await kontekst.close();
});
