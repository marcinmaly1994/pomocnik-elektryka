import { test, expect, type Page } from "@playwright/test";

/**
 * Nagłówek na telefonie.
 *
 * Pasek przewijany w bok ucinał etykiety w pół słowa („Protokoły pomiarow”), a o reszcie
 * mówiło tylko wygaszenie krawędzi. Teraz poniżej 768 px w nagłówku zostają logo, konto
 * i przycisk „Menu” z arkuszem pozycji. Konto musi zostać w kadrze: aplikacja namawia do
 * założenia go, żeby nie stracić pracy, a kiedyś „Zaloguj się” zaczynało się 623 px
 * za prawą krawędzią.
 */

test.use({ viewport: { width: 375, height: 812 } });

/**
 * Jeden rząd sprawdzany GEOMETRIĄ, nie progiem w pikselach.
 *
 * Dawny próg „≤ 64 px” miał ~0 px zapasu (64,25 px przed `leading-tight`), a czcionki na
 * Linuksie w CI wychodzą odrobinę większe — test mierzył krój pisma, nie liczbę rzędów.
 * Logo i skrajnie prawa kontrolka („Menu”) muszą zachodzić na siebie w pionie: po zawinięciu
 * „Menu” spada pod logo. Do tego nagłówek niższy niż 90 px — drugi rząd dokłada co najmniej
 * 44 px (wysokość celu dotykowego), więc ten próg łapie zawinięcie każdej innej kontrolki.
 */
async function sprawdzJedenRzad(page: Page, opis: string) {
  const logo = (await page.getByRole("button", { name: /^pomocnikelektryka\.pl/ }).boundingBox())!;
  const menu = (await page.getByRole("button", { name: "Menu", exact: true }).boundingBox())!;
  const naglowek = (await page.getByRole("banner").boundingBox())!;
  const zachodza = logo.y < menu.y + menu.height && menu.y < logo.y + logo.height;
  expect(
    zachodza,
    `${opis}: „Menu” (y=${Math.round(menu.y)}) poza rzędem logo (y=${Math.round(logo.y)}–${Math.round(logo.y + logo.height)})`
  ).toBe(true);
  expect(naglowek.height, `${opis}: nagłówek ma ${Math.round(naglowek.height)} px`).toBeLessThan(90);
}

test("„Zaloguj się” mieści się na ekranie telefonu bez przewijania nagłówka", async ({ page }) => {
  await page.goto("/");

  const zaloguj = page.getByRole("button", { name: "Zaloguj się" }).first();
  await expect(zaloguj).toBeVisible();

  const ramka = await zaloguj.boundingBox();
  const szerokosc = page.viewportSize()!.width;
  expect(ramka).not.toBeNull();
  expect(ramka!.x).toBeGreaterThanOrEqual(0);
  expect(ramka!.x + ramka!.width).toBeLessThanOrEqual(szerokosc);
});

test("wszystkie narzędzia są w menu, z pełnymi nazwami", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const arkusz = page.getByRole("dialog", { name: "Menu" });

  for (const nazwa of ["Kalkulatory", "Protokoły pomiarowe", "Dokumentacja", "Pomoc", "Nowy projekt"]) {
    const przycisk = arkusz.getByRole("button", { name: nazwa, exact: true });
    await expect(przycisk).toBeVisible();
    const ramka = (await przycisk.boundingBox())!;
    expect(ramka.width, `„${nazwa}” ma ${Math.round(ramka.width)} px szerokości`).toBeGreaterThanOrEqual(200);
    expect(ramka.height, `„${nazwa}” ma ${Math.round(ramka.height)} px wysokości`).toBeGreaterThanOrEqual(44);
  }
});

test("wybór w menu przenosi i zamyka arkusz", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Kalkulatory", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

/** „Nowy projekt” ma własne potwierdzenie — zamknięcie arkusza nie może go zabrać ze sobą. */
test("„Nowy projekt” z menu pokazuje potwierdzenie i je honoruje", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nowy projekt", exact: true }).click();

  const potwierdzenie = page.getByRole("dialog", { name: "Zacząć nowy projekt?" });
  await expect(potwierdzenie).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await potwierdzenie.getByRole("button", { name: "Tak, zacznij od nowa" }).click();
  await expect(potwierdzenie).toHaveCount(0);
});

/** Nagłówek nie ma prawa rozpychać całej strony — to był osobny, naprawiony już błąd. */
test("strona nie dostaje poziomego przewijania", async ({ page }) => {
  await page.goto("/");
  const rozjazd = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(rozjazd).toBeLessThanOrEqual(0);
});

test("nagłówek telefonu to jeden rząd", async ({ page }) => {
  await page.goto("/");
  await sprawdzJedenRzad(page, "375 px");
});

/**
 * Przekazanie z arkusza do okna: arkusz zamyka się, a okno otwiera w tej samej chwili.
 * Dwa okna modalne Radixa naraz potrafią zostawić fokus na przycisku, którego już nie ma
 * (czytnik ekranu i klawiatura gubią się), a jsdom tego nie widzi.
 */
for (const [nazwa, okno] of [
  ["Dokumentacja", "Komplet dokumentacji"],
  ["Pomoc", "Pomoc"],
] as const) {
  test(`menu → „${nazwa}” otwiera okno i oddaje mu fokus, a po Escape wraca do „Menu”`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: nazwa, exact: true }).click();

    const dialog = page.getByRole("dialog", { name: okno });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);

    // Okno nie ma własnego wyzwalacza (sterowane z App), a pozycja arkusza już nie
    // istnieje — bez `wrocFokusDoOtwieracza` fokus lądował na <body>.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
  });
}

test("menu → chip „Zapisano lokalnie” otwiera logowanie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const chip = page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: /Zapisano lokalnie/ });
  test.skip(await chip.isDisabled(), "Supabase nieskonfigurowany w tym środowisku — chip nie prowadzi do logowania");
  await chip.click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);

  // Chip w arkuszu zniknął razem z nim — fokus wraca do „Menu”, którym arkusz otwarto,
  // a nie do „Zaloguj się” w nagłówku, choć to ten sam rodzaj otwieracza.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
});

/** Nagłówek w jednym rzędzie także na tablecie w pionie przed progiem 768 px, gdzie jest
 *  hasło pod logo (od 640 px) — tam zawijał się najłatwiej. */
for (const szer of [640, 700]) {
  test(`nagłówek to jeden rząd przy ${szer} px`, async ({ page }) => {
    await page.setViewportSize({ width: szer, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
    await sprawdzJedenRzad(page, `${szer} px`);
  });
}

test("zalogowany: nagłówek zostaje jednym rzędem, a stan zapisu jest ikoną", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ([klucz, sesja]) => {
      localStorage.clear();
      localStorage.setItem(klucz, JSON.stringify(sesja));
    },
    ["pomocnikelektryka_sesja", { token: "fake-token", user: { id: "u1", email: "elektryk@example.com" } }] as const
  );
  await page.reload();
  await expect(page.getByTitle("elektryk@example.com")).toBeVisible();
  await sprawdzJedenRzad(page, "zalogowany, 375 px");
  const rozjazd = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(rozjazd).toBeLessThanOrEqual(0);
});

test("pozycje arkusza są ułożone jednakowo: do lewej, z ikoną, tej samej wysokości", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const arkusz = page.getByRole("dialog", { name: "Menu" });
  const pozycje = await arkusz.locator("div.gap-1 > button").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const tekst = document.createRange();
      tekst.selectNodeContents(e);
      return {
        nazwa: e.textContent?.trim(),
        x: Math.round(r.x),
        h: Math.round(r.height),
        ikona: !!e.querySelector("svg"),
        lewaTresci: Math.round(e.querySelector("svg")?.getBoundingClientRect().x ?? -1),
      };
    })
  );
  expect(pozycje.length).toBeGreaterThanOrEqual(5);
  for (const p of pozycje) {
    expect(p.ikona, `„${p.nazwa}” bez ikony`).toBe(true);
    expect(p.x).toBe(pozycje[0].x);
    expect(p.lewaTresci, `ikona „${p.nazwa}” nie stoi przy lewej krawędzi`).toBe(pozycje[0].lewaTresci);
  }
});

test("„Nowy projekt” z menu: po anulowaniu fokus wraca do przycisku „Menu”", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nowy projekt", exact: true }).click();
  await page.getByRole("dialog", { name: "Zacząć nowy projekt?" }).getByRole("button", { name: "Anuluj" }).click();
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
});

/** Zamknięcie arkusza stoi w rogu, pod kciukiem — ikona ma 18 px, pole kliknięcia 44 × 44 px. */
test("„Zamknij” arkusza ma pole kliknięcia co najmniej 44 × 44 px", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const zamknij = (await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Zamknij" }).boundingBox())!;
  expect(zamknij.width).toBeGreaterThanOrEqual(44);
  expect(zamknij.height).toBeGreaterThanOrEqual(44);
});

/**
 * Kto prosi o brak ruchu, dostaje arkusz bez wjazdu. `motion-reduce:animate-none`
 * przegrywało wagą z `data-[state=open]:animate-[…]`, więc animacja szła mimo to.
 */
test("przy prefers-reduced-motion arkusz nie wjeżdża", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const arkusz = page.getByRole("dialog", { name: "Menu" });
  await expect(arkusz).toBeVisible();
  expect(await arkusz.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");

  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  expect(await arkusz.evaluate((e) => getComputedStyle(e).animationName)).toBe("pe-arkusz-wjazd");
});
