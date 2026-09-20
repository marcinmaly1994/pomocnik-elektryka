import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kawałek Konvy, którego ten test naprawdę używa — zamiast `any`.
 *
 * Węzły czytamy z ŻYWEJ sceny, bo sprawdzamy rozmieszczenie, którego nie widać
 * w danych projektu: to wynik układania etykiet, a nie zapisana wartość.
 */
interface WezelTekstu {
  fontSize(): number;
  text(): string;
  getAbsolutePosition(): { x: number; y: number };
  /** Grupa symbolu, w której siedzi etykieta — jej pozycja to punkt elementu na planie. */
  getParent(): { x(): number; y(): number };
}

/** Element instalacji z autozapisu — tylko pola, po których tu szukamy. */
interface ZapisanyElement {
  x: number;
  y: number;
  type: string;
  room?: string;
}
interface WezelLinii {
  strokeWidth(): number;
  opacity(): number;
}
interface Scena {
  x(): number;
  y(): number;
  scaleX(): number;
  scaleY(): number;
  find<T>(selektor: string): T[];
}
/** Scena bywa jeszcze niezmontowana (DesignTab ładuje się leniwie), stąd znaki zapytania. */
type OknoZKonva = { Konva?: { stages?: Scena[] } };

/**
 * Numery grup sterowania przy ciasno postawionych łącznikach.
 *
 * Zgłoszenie brzmiało: „dwa łączniki schodowe w salonie mają różne numery, mimo że
 * sterują tymi samymi oprawami". Grupowanie było poprawne — oba mają 4 — ale tuż przy
 * jednym z nich stała cyfra „1" łącznika KUCHENNEGO, zza ściany. Dzieli je 67 cm,
 * a etykieta stoi 45 cm od swojego symbolu, więc żadne rozmieszczenie ich nie rozdziela.
 *
 * Dlatego etykieta, która musiała ustąpić, dostaje kreskę odniesienia do swojego
 * symbolu: dwuznaczność znika przez wskazanie właściciela, a nie przez walkę o piksele.
 */

async function przykladNaRzucie(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.getByRole("button", { name: "Rozdzielnica", exact: true })).toBeVisible();
  // Czekamy na SAME ETYKIETY, nie na stały czas: pod obciążeniem pełnego zestawu
  // scena bywała jeszcze nieustalona i test mierzył układ, który za chwilę się zmieni.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const st = (window as unknown as OknoZKonva).Konva?.stages?.[0];
        return st ? st.find<WezelTekstu>("Text").filter((t) => t.fontSize() === 9).length : 0;
      })
    )
    .toBeGreaterThan(5);

  // Autozapis jest opóźniony, a to z niego test odczytuje, który symbol jest który.
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))))
    .toBe(true);
}

/** Etykiety grup i kreski odniesienia odczytane z żywego rysunku, w jedn. planu. */
async function rysunek(page: Page) {
  return page.evaluate(() => {
    const st = (window as unknown as OknoZKonva).Konva!.stages![0];
    const prz = (a: { x: number; y: number }) => ({ x: (a.x - st.x()) / st.scaleX(), y: (a.y - st.y()) / st.scaleY() });
    const cyfry = st
      .find<WezelTekstu>("Text")
      .filter((t) => t.fontSize() === 9 && /^[0-9]+$/.test(t.text()))
      .map((t) => ({ tekst: t.text(), ...prz(t.getAbsolutePosition()) }));
    const kreski = st.find<WezelLinii>("Line").filter((l) => l.strokeWidth() === 0.8 && l.opacity() === 0.55).length;
    return { cyfry, kreski };
  });
}

test("stłoczone numery grup dostają kreskę wskazującą właściciela", async ({ page }) => {
  await przykladNaRzucie(page);
  const { cyfry, kreski } = await rysunek(page);

  expect(cyfry.length).toBeGreaterThan(5);
  // W projekcie przykładowym jest dokładnie jedno takie ciasne miejsce — gdyby kresek
  // nie było wcale, znaczyłoby to, że rozsuwanie przestało cokolwiek przesuwać.
  expect(kreski).toBeGreaterThanOrEqual(1);
});

/** Same numery muszą pozostać rozdzielone na tyle, żeby dało się je od siebie odróżnić.
 *  Przed zmianą najciaśniejsza para dzieliła 11,4 jedn. */
test("najciaśniejsza para numerów jest dalej od siebie niż przed zmianą", async ({ page }) => {
  await przykladNaRzucie(page);
  const { cyfry } = await rysunek(page);

  let min = Infinity;
  for (let i = 0; i < cyfry.length; i++) {
    for (let j = i + 1; j < cyfry.length; j++) {
      min = Math.min(min, Math.hypot(cyfry[i].x - cyfry[j].x, cyfry[i].y - cyfry[j].y));
    }
  }
  expect(min).toBeGreaterThan(11.4);
});

/** Oba schodowe sterują tym samym punktem, więc muszą pokazywać TEN SAM numer —
 *  to była treść zgłoszenia i warto, żeby ktoś to złamał świadomie, a nie przypadkiem.
 *
 *  Para stoi w PRZEDPOKOJU, odkąd rzut przykładowy dostał realny rozkład: układ schodowy
 *  robi się w mieszkaniu na komunikacji (zapala się przy wejściu, gasi na końcu korytarza),
 *  a nie w salonie, gdzie stał wcześniej. Pomieszczenie jest tu jedynie sposobem na
 *  WSKAZANIE tej pary na rysunku — treścią testu jest wspólny numer, nie adres. */
test("oba łączniki schodowe w przedpokoju mają ten sam numer grupy", async ({ page }) => {
  await przykladNaRzucie(page);

  const numery = await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!) as {
      draft: { elements: ZapisanyElement[] };
    };
    const st = (window as unknown as OknoZKonva).Konva!.stages![0];
    // Grupa elementu stoi WPROST we współrzędnych planu (x={el.x} y={el.y}), więc
    // czytamy je bez przeliczania transformacji sceny — ta bywa jeszcze nieustalona.
    const znajdz = (x: number, y: number) =>
      a.draft.elements.find((e) => Math.abs(e.x - x) < 0.6 && Math.abs(e.y - y) < 0.6);
    return st
      .find<WezelTekstu>("Text")
      .filter((t) => t.fontSize() === 9 && /^[0-9]+$/.test(t.text()))
      .map((t) => {
        const g = t.getParent();
        const el = znajdz(g.x(), g.y());
        return { tekst: t.text(), typ: el?.type, pokoj: el?.room };
      })
      .filter((o) => o.typ === "wlacznikSchodowy" && o.pokoj === "Przedpokój")
      .map((o) => o.tekst);
  });

  expect(numery.length).toBe(2);
  expect(numery[0]).toBe(numery[1]);
});
