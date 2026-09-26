import { test, expect, type Page } from "@playwright/test";

/**
 * Nawigacja po rzucie jest jedyną rzeczą wziętą w tej aplikacji wprost z programów
 * CAD: `Ctrl` + kółko przybliża, wciśnięta rolka przesuwa, a samo kółko przewija
 * STRONĘ. Kto nie siedział w AutoCAD-zie, ten kręci kółkiem nad planem, ucieka mu
 * cała strona i nic tego nie tłumaczy.
 *
 * Reguła „komu i kiedy pokazać" ma testy jednostkowe w `src/lib/podpowiedziNawigacji.test.ts`.
 * Tutaj sprawdzamy to, czego nie widać bez przeglądarki: że dymek faktycznie wstaje po
 * wgraniu rzutu, że komunikat o `Ctrl` wyskakuje w chwili pomyłki i że jedno przybliżenie
 * ucisza obie podpowiedzi — także po odświeżeniu strony.
 */

// 1x1 px PNG — wystarczy, żeby aplikacja uznała podkład za wgrany
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const O_NAWIGACJI = /Rzut przybliżysz/;
/**
 * Dymek o skali czeka w kolejce ZA podpowiedzią o nawigacji (patrz `poWgraniuPodkladu`
 * w DesignTab.tsx): dwóch punktów o znanej odległości nie da się wskazać na rzucie,
 * którego nie umie się przybliżyć.
 */
const O_SKALI = /Kliknij dwa punkty o znanej odległości/;

/**
 * Sam dymek, a nie „gdziekolwiek ten tekst".
 *
 * Instrukcja o mierzeniu skali stoi jednocześnie w panelu bocznym, więc szukanie po
 * samej treści łapie dwa elementy naraz. `CoachMark` ma `role="dialog"` i własną
 * etykietę — to jedyny pewny uchwyt.
 */
function dymek(page: Page) {
  return page.getByRole("dialog", { name: "Podpowiedź" });
}

async function wgrajRzut(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.setInputFiles('input[accept*="image"]', {
    name: "rzut.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();
}

/**
 * Odświeżenie strony z powrotem do edytora.
 *
 * Czeka, aż PODKŁAD FAKTYCZNIE trafi do `localStorage`. Autozapis jest opóźniony
 * o 600 ms (patrz `wykonajAutozapis` w useProjectStore.ts), a przeładowanie w tym
 * oknie gubi rzut i wyrzuca z powrotem na ekran startowy — test sprawdzałby wtedy
 * brak dymka tam, gdzie nie ma nawet płótna, czyli nie sprawdzałby niczego.
 *
 * Szukamy `data:image` w dowolnym wpisie, zamiast układać nazwę klucza projektu:
 * test ma pilnować podpowiedzi, a nie schematu zapisu.
 */
async function odswiezDoEdytora(page: Page) {
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? "").includes("data:image"))
  );
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(page.locator("[data-testid=plan-okno]").first()).toBeVisible();
}

/** Kółko myszy nad środkiem płótna. `ctrl` rozstrzyga, czy to przybliżenie, czy pomyłka. */
async function kolkoNadPlanem(page: Page, { ctrl }: { ctrl: boolean }) {
  const ramka = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.move(ramka.x + ramka.width / 2, ramka.y + ramka.height / 2);
  if (ctrl) await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  if (ctrl) await page.keyboard.up("Control");
}

test("po wgraniu rzutu dymek tłumaczy, jak ruszać planem", async ({ page }) => {
  await wgrajRzut(page);

  // PIERWSZY dymek po wgraniu — przed tym o skali. Mówi o OBU gestach; to jedyne
  // miejsce w interfejsie, gdzie ktoś się o nich dowie.
  await expect(dymek(page)).toContainText(O_NAWIGACJI);
  await expect(dymek(page)).toContainText("kółkiem myszy");
  await expect(dymek(page)).toContainText("rolką");

  // „Rozumiem" oddaje scenę dymkowi o skali — przewodnik idzie dalej, nie urywa się
  await page.getByRole("button", { name: "Rozumiem" }).click();
  await expect(dymek(page)).toContainText(O_SKALI);
  await page.getByRole("button", { name: "Rozumiem" }).click();

  // i już nie wraca — także po odświeżeniu strony
  await expect(dymek(page)).toHaveCount(0);
  await odswiezDoEdytora(page);
  await expect(dymek(page)).toHaveCount(0);
});

test("kółko bez Ctrl tłumaczy się samo, w chwili pomyłki", async ({ page }) => {
  await wgrajRzut(page);
  // Dymki zeszłyby z drogi komunikatowi (patrz `czyPokazacPodpowiedzKolka`) — zamykamy
  // oba, żeby sprawdzić sam gest.
  await expect(dymek(page)).toContainText(O_NAWIGACJI);
  await page.getByRole("button", { name: "Rozumiem" }).click();
  await expect(dymek(page)).toContainText(O_SKALI);
  await page.getByRole("button", { name: "Rozumiem" }).click();

  await expect(page.getByTestId("podpowiedz-kolka")).toBeHidden();
  await kolkoNadPlanem(page, { ctrl: false });
  await expect(page.getByTestId("podpowiedz-kolka")).toBeVisible();
  await expect(page.getByTestId("podpowiedz-kolka")).toContainText(/Przytrzymaj\s+Ctrl/);

  /**
   * Gaśnie SAM. To nie okno dialogowe: podpowiedź wyskakuje w trakcie gestu, więc
   * czekanie na „Rozumiem" robiłoby z niej przeszkodę dokładnie wtedy, gdy ktoś pracuje.
   */
  await expect(page.getByTestId("podpowiedz-kolka")).toBeHidden({ timeout: 5000 });
});

test("jedno przybliżenie ucisza obie podpowiedzi na dobre", async ({ page }) => {
  await wgrajRzut(page);
  await expect(dymek(page)).toContainText(O_NAWIGACJI);

  // Przybliżenie ZAMIAST kliknięcia „Rozumiem" — dymek o nawigacji nie ma już czego
  // tłumaczyć i ustępuje miejsca temu o skali, zamiast urywać przewodnik.
  await kolkoNadPlanem(page, { ctrl: true });
  await expect(dymek(page)).toContainText(O_SKALI);
  await page.getByRole("button", { name: "Rozumiem" }).click();

  // i kółko bez Ctrl nie zaczepia kogoś, kto właśnie pokazał, że umie
  await kolkoNadPlanem(page, { ctrl: false });
  await expect(page.getByTestId("podpowiedz-kolka")).toBeHidden();

  // po odświeżeniu też nie wracają
  await odswiezDoEdytora(page);
  await expect(dymek(page)).toHaveCount(0);
  await kolkoNadPlanem(page, { ctrl: false });
  await expect(page.getByTestId("podpowiedz-kolka")).toBeHidden();
});

test("bez wgranego rzutu podpowiedź nie zaczepia — na pustej kratce nie ma czego oglądać", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Pomiń — zacznę na pustym planie" }).click();

  // Edytor już stoi — panel narzędzi z nagłówkiem bieżącego narzędzia.
  await expect(page.getByTestId("naglowek-narzedzia")).toBeVisible();
  await expect(dymek(page)).toHaveCount(0);
});

test("dymek PODŚWIETLA przyciski powiększenia, zamiast tylko o nich mówić", async ({ page }) => {
  await wgrajRzut(page);
  await expect(dymek(page)).toContainText(O_NAWIGACJI);

  // Strzałka dymka celuje w bok paska, a przyciski są szare wśród kilkunastu innych
  // szarych ikon — obwódka mówi „TE, nie tamte", zanim ktokolwiek zacznie czytać.
  const grupaZoomu = page.locator(".pe-wskazane");
  await expect(grupaZoomu).toBeVisible();
  await expect(grupaZoomu.getByRole("button", { name: "Przybliż widok" })).toBeVisible();

  // Podświetlenie żyje dokładnie tyle, co dymek — nie zostaje na pasku na zawsze.
  await page.getByRole("button", { name: "Rozumiem" }).click();
  await expect(page.locator(".pe-wskazane")).toHaveCount(0);
});

/**
 * Szczypanie na ekranie dotykowym.
 *
 * Zdarzenia składamy ręcznie, bo Playwright potrafi dotknąć ekranu tylko JEDNYM
 * palcem, a gest z definicji wymaga dwóch. Sprawdzamy więc to, co naprawdę jest nasze:
 * że nasłuch płótna zamienia rozstaw palców na powiększenie rzutu. Tego, czy
 * przeglądarka odda nam gest na prawdziwym telefonie, żaden test bez telefonu nie
 * rozstrzygnie — o to dba `touch-action` na płótnie.
 */
async function szczypnij(page: Page, kroki: { typ: "touchstart" | "touchmove" | "touchend"; rozstaw: number }[]) {
  await page.evaluate((kroki) => {
    const el = document.querySelector("[data-plan-okno]")!;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const { typ, rozstaw } of kroki) {
      // Palce rozstawione symetrycznie wokół środka płótna — tam, gdzie siedzi rzut.
      const touches =
        typ === "touchend"
          ? []
          : [
              new Touch({ identifier: 1, target: el, clientX: x - rozstaw, clientY: y }),
              new Touch({ identifier: 2, target: el, clientX: x + rozstaw, clientY: y }),
            ];
      el.dispatchEvent(
        new TouchEvent(typ, { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true })
      );
    }
  }, kroki);
}

/** Powiększenie odczytane z paska — ta sama liczba, którą widzi użytkownik. */
async function powiekszenie(page: Page): Promise<number> {
  const etykieta = await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).getAttribute("aria-label");
  return Number(etykieta!.match(/(\d+) procent/)![1]);
}

test("szczypanie dwoma palcami przybliża rzut, a nie całą stronę", async ({ page }) => {
  await wgrajRzut(page);
  await page.getByRole("button", { name: "Rozumiem" }).click();
  await expect(dymek(page)).toContainText(O_SKALI);
  await page.getByRole("button", { name: "Rozumiem" }).click();

  const przed = await powiekszenie(page);

  // rozsunięcie palców — przybliża
  await szczypnij(page, [
    { typ: "touchstart", rozstaw: 40 },
    { typ: "touchmove", rozstaw: 120 },
  ]);
  const po = await powiekszenie(page);
  expect(po).toBeGreaterThan(przed);

  // zsunięcie palców — oddala. Nowy gest liczy się OD NOWA, od bieżącego powiększenia.
  await szczypnij(page, [
    { typ: "touchend", rozstaw: 0 },
    { typ: "touchstart", rozstaw: 150 },
    { typ: "touchmove", rozstaw: 50 },
  ]);
  expect(await powiekszenie(page)).toBeLessThan(po);
});
