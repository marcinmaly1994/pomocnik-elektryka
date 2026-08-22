import { test, expect, type Page } from "@playwright/test";

/**
 * Tryb pełnoekranowy: plan dostaje całe okno, a paski chowają się za krawędzie
 * i wracają po najechaniu myszą.
 *
 * Testy mierzą FAKTYCZNE położenie paneli (`boundingBox`), a nie klasy CSS —
 * to jedyny sposób, żeby złapać przypadek, w którym transformacja jest zapisana
 * w atrybucie `style`, ale przeglądarka jej nie stosuje. Taki właśnie błąd
 * (schowany panel widoczny mimo poprawnego `style`) był realnym ryzykiem przy
 * pisaniu tej funkcji.
 */

/** Karta narzędzi (pionowy pasek + panel) — w pełnym ekranie wysuwana z lewej. */
function lewaKarta(page: Page) {
  return page.locator('nav[aria-label="Narzędzia rysowania"]').locator("..");
}

/** Pozycja X panelu; `expect.poll` czeka, aż animacja wysuwania się skończy. */
async function pozycjaX(locator: ReturnType<typeof lewaKarta>): Promise<number> {
  const box = await locator.boundingBox();
  return box ? Math.round(box.x) : NaN;
}

test("pełny ekran chowa paski za krawędzie i oddaje planowi całe okno", async ({ page }) => {
  await page.goto("/");

  const karta = lewaKarta(page);
  expect(await pozycjaX(karta)).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Panel zjeżdża w całości poza lewą krawędź — ujemny X, nie tylko „mniejszy".
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Płótno dostaje niemal całą wysokość okna: bez pasków nie ma na co zostawiać zapasu.
  const wysOkna = page.viewportSize()!.height;
  const plotno = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  expect(plotno.height).toBeGreaterThan(wysOkna * 0.85);
});

test("najechanie na lewą krawędź wysuwa narzędzia, odjechanie chowa je z powrotem", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Kursor na sam brzeg okna — tam leży pas wyzwalający.
  const wys = page.viewportSize()!.height;
  await page.mouse.move(2, Math.round(wys / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Zjazd myszą na środek płótna chowa panel z powrotem.
  await page.mouse.move(Math.round(page.viewportSize()!.width / 2), Math.round(wys / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);
});

test("Escape wychodzi z pełnego ekranu, ale najpierw porzuca rozpoczęty rysunek", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Zaczynamy ścianę: pierwszy Escape ma porzucić JĄ, a nie wyrzucić z trybu.
  await page.mouse.move(2, Math.round(page.viewportSize()!.height / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
  // Nazwa z PODPISU przycisku, nie z `title` — treść wygrywa z tytułem przy
  // wyliczaniu nazwy dostępnościowej (tak samo selekcjonują pozostałe testy).
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();

  // Po wyborze narzędzia kursor stoi NAD panelem, więc panel jest nadal wysunięty
  // i zasłania lewą część planu. Odsuwamy mysz i czekamy, aż się schowa — inaczej
  // kliknięcia „w plan" trafiłyby w panel.
  await page.mouse.move(Math.round(page.viewportSize()!.width / 2), Math.round(page.viewportSize()!.height / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  const plotno = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(plotno.x + 500, plotno.y + 150);
  await page.mouse.click(plotno.x + 620, plotno.y + 150);
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toBeVisible();

  await page.keyboard.press("Escape");
  // rysunek porzucony…
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toHaveCount(0);
  // …ale tryb pełnoekranowy trwa
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toBeVisible();

  // Dopiero drugi Escape wychodzi z trybu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Projektowanie na pełnym ekranie" })).toBeVisible();
});

test("uchwyt przy lewej krawędzi zapowiada schowane narzędzia i otwiera je kliknięciem", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Uchwyt to jedyny sygnał, że coś tam jest — bez niego tryb wygląda jak plan
  // bez narzędzi. Musi być widoczny od razu po wejściu, bez ruszania myszą.
  const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
  await expect(uchwyt).toBeVisible();
  await expect(uchwyt).toContainText("Narzędzia");

  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Kliknięcie, nie najechanie: na tablecie nie ma najeżdżania myszą, więc sam
  // hover nie wystarczy do otwarcia panelu.
  await uchwyt.click();
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Gdy panel jest już wysunięty, uchwyt nie ma czego zapowiadać.
  await expect(uchwyt).toHaveCount(0);
});

test("uchwyt mieści się w pasie wyzwalającym — najechanie na niego wysuwa panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
  const box = (await uchwyt.boundingBox())!;

  // Sedno: kursor na PRAWEJ krawędzi uchwytu, czyli najdalszym jego punkcie.
  // Gdyby uchwyt był szerszy niż pas wyzwalający, celowanie w widoczny element
  // nie dawałoby efektu — a to najgorszy rodzaj kontrolki.
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
});

test("pasek kontrolek stoi tuż nad płótnem, bez pustego rzędu pod spodem", async ({ page }) => {
  await page.goto("/");

  const pasek = (await page.getByLabel("Rozmiar elementów").locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]").boundingBox())!;
  const wiersz = (await page.locator('nav[aria-label="Narzędzia rysowania"]').locator("xpath=ancestor::div[contains(@class,'items-start')][1]").boundingBox())!;

  // Pusty rząd kontrolek kontekstowych ma znikać z układu (`empty:hidden`), a nie
  // zbierać margines z obu stron — inaczej wstawiał 32 px pustki między pasek
  // a płótno, mimo zerowej wysokości.
  const odstep = wiersz.y - (pasek.y + pasek.height);
  expect(odstep).toBeGreaterThanOrEqual(0);
  expect(odstep).toBeLessThan(12);
});

/** Grubość widocznego paska przewijania danego kontenera, w pikselach. Liczona
 *  z różnicy `offset*` i `client*` pomniejszonej o obramowanie — to jedyny sposób,
 *  żeby zmierzyć FAKTYCZNIE wyrenderowany suwak, a nie samą deklarację CSS. */
async function gruboscSuwakow(page: Page, selektor: string) {
  return page.locator(selektor).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const ramkaX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const ramkaY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
      pion: Math.round(el.offsetWidth - el.clientWidth - ramkaX),
      poziom: Math.round(el.offsetHeight - el.clientHeight - ramkaY),
      maCoPrzewijac: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    };
  });
}

test("plan po przybliżeniu przewija się, ale bez widocznych suwaków", async ({ page }) => {
  await page.goto("/");

  // Przybliżamy, aż rysunek przestanie się mieścić w oknie — dopiero wtedy
  // przeglądarka ma powód, żeby pokazać suwaki.
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();

  const plotno = await gruboscSuwakow(page, "div.overflow-auto.rounded-card.border");
  expect(plotno.maCoPrzewijac).toBe(true); // test miałby zerową wartość, gdyby nie było co przewijać
  expect(plotno.pion).toBe(0);
  expect(plotno.poziom).toBe(0);
});

test("panel narzędzi w pełnym ekranie ma JEDEN obszar przewijania, bez suwaków", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.getByRole("button", { name: "Pokaż narzędzia rysowania" }).click();
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Zagnieżdżone przewijanie (panel + lista w środku) dawało dwa suwaki obok
  // siebie. Przewijać ma się WYŁĄCZNIE lista elementów.
  const przewijalne = await page.evaluate(() => {
    const out: { klasa: string; suwakPion: number; suwakPoziom: number }[] = [];
    for (const el of document.querySelectorAll("div,nav")) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowY + cs.overflowX)) continue;
      const h = el as HTMLElement;
      if (!(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) continue;
      out.push({
        klasa: typeof el.className === "string" ? el.className : "",
        suwakPion: Math.round(h.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth))),
        suwakPoziom: Math.round(h.offsetHeight - el.clientHeight - (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth))),
      });
    }
    return out;
  });

  // Ani jeden realnie przewijalny kontener nie może rysować paska.
  for (const k of przewijalne) {
    expect(k.suwakPion, `suwak pionowy w: ${k.klasa}`).toBe(0);
    expect(k.suwakPoziom, `suwak poziomy w: ${k.klasa}`).toBe(0);
  }
});

/** Wchodzi w pełny ekran i odsłania lewy panel uchwytem. */
async function odslonNarzedzia(page: Page) {
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.getByRole("button", { name: "Pokaż narzędzia rysowania" }).click();
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
}

test("przypięty panel zostaje na widoku po zjechaniu myszą", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await odslonNarzedzia(page);

  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();

  // Zjazd na środek — nieprzypięty panel by się schował.
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.waitForTimeout(500);
  expect(await pozycjaX(lewaKarta(page))).toBeGreaterThanOrEqual(0);

  // Przypięty panel nie potrzebuje uchwytu — nie ma czego zapowiadać.
  await expect(page.getByRole("button", { name: "Pokaż narzędzia rysowania" })).toHaveCount(0);
});

test("przypięty panel ODSUWA płótno, zamiast je zasłaniać", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.waitForTimeout(400);

  const karta = (await lewaKarta(page).boundingBox())!;
  const plotno = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;

  // Sedno: panel przyklejony na stałe do rysunku byłby GORSZY od chowającego się —
  // zabierałby miejsce pracy bez możliwości zajrzenia pod spód.
  expect(plotno.x).toBeGreaterThanOrEqual(karta.x + karta.width - 2);
});

test("odpięcie przywraca chowanie, a przypięcie przeżywa odświeżenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.waitForTimeout(300);

  await page.reload();
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.waitForTimeout(400);
  // Po odświeżeniu panel jest od razu widoczny, bez dotykania myszą.
  expect(await pozycjaX(lewaKarta(page))).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Odepnij pasek: lewo" }).click();
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeLessThan(0);
});

test("przypięty panel po lewej NIE zasłania górnego paska", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  // Pinezka karty leży tuż pod górną krawędzią, więc kliknięcie jej wysuwa PRZY OKAZJI
  // górny pasek. Odsuwamy kursor i czekamy, aż wszystko wróci do stanu spoczynku,
  // żeby test sprawdzał układ, a nie skutek uboczny własnego kliknięcia.
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Pokaż pasek edytora" }).click();
  await page.waitForTimeout(400);

  const karta = (await lewaKarta(page).boundingBox())!;
  const pasek = (await page.getByLabel("Rozmiar elementów").locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]").boundingBox())!;

  // Wszystkie panele mają ten sam z-index, więc o wierzchu decydowała kolejność
  // w DOM — karta przykrywała lewy koniec paska, czyli kondygnacje i podkład.
  expect(karta.y).toBeGreaterThanOrEqual(pasek.y + pasek.height - 2);

  // Dowód użytkowy: klik w „Parter” ma trafić w „Parter”, a nie w narzędzie pod spodem.
  const parter = page.getByRole("button", { name: "Parter" });
  await expect(parter).toBeVisible();
  const trafiaWParter = await parter.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pod = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return pod ? pod.closest("button") === el : false;
  });
  expect(trafiaWParter).toBe(true);
});

test("przycisk Esc znika, gdy górny pasek jest na widoku — nie zasłania jego kontrolek", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Paski schowane — pigułka jest jedynym widocznym wyjściem i MUSI być.
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toBeVisible();

  await page.getByRole("button", { name: "Pokaż pasek edytora" }).click();
  await page.waitForTimeout(400);

  // Pasek ma własny przycisk wyjścia w tym samym rogu — pigułka tylko przykrywała
  // sąsiednie kontrolki („Dopasuj widok do planu”, pinezkę).
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wyjdź z pełnego ekranu" })).toBeVisible();

  const dopasuj = page.getByRole("button", { name: "Dopasuj widok do planu" });
  const klikalny = await dopasuj.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pod = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return pod ? pod.closest("button") === el : false;
  });
  expect(klikalny).toBe(true);
});

test("kondygnacje mieszkają w jednym pasku razem z podkładem i siatką", async ({ page }) => {
  await page.goto("/");

  // Wszystkie cztery kontrolki dzielą JEDNĄ kartę paska — po scaleniu nie ma już
  // osobnego rzędu na kondygnacje.
  const pasek = page.getByRole("button", { name: "Parter" }).locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
  await expect(pasek.getByRole("button", { name: "+ Dodaj kondygnację" })).toBeVisible();
  await expect(pasek.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();
  await expect(pasek.getByLabel("Przyciągaj do siatki")).toBeVisible();
  await expect(pasek.getByLabel("Rozmiar elementów")).toBeVisible();
});
