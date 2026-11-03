import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Cele dotykowe na telefonie mają co najmniej 24 × 24 px.
 *
 * To minimum z WCAG 2.2 (kryterium 2.5.8, poziom AA). Pomiar na telefonie pokazał osiem
 * elementów poniżej niego — wysokość 16–18 px mają m.in. linki „Prywatność i dane"
 * i „Regulamin" w stopce na każdym ekranie, przycisk „Projekty", status sprawdzenia
 * rzutu pod planem i uchwyt panelu bocznego; „Cofnij" i „Ponów" w rozdzielnicy miały
 * 23 px. Rozwijany spis skrótów pod kartami doboru dołożył do nich dziewiąty (17 px).
 *
 * Wyjątek z normy: link będący częścią zdania (inline, z tekstem wokół) — mierzony
 * tu tak samo jak w normie, czyli pomijany.
 *
 * Emulacja telefonu (`isMobile` + `hasTouch`) daje `pointer: coarse`, od którego zależą
 * zwiększone cele — patrz edytor-telefon-zwarty.spec.ts.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const MIN = 24;

/** Widoczne elementy interaktywne mniejsze niż `MIN` w którymkolwiek wymiarze. */
async function zaMale(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const sel =
      "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch]";
    const wynik: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (r.width >= min && r.height >= min) continue;
      const wTekscie =
        cs.display === "inline" &&
        !!e.parentElement &&
        (e.parentElement.textContent || "").trim().length > (e.textContent || "").trim().length + 12;
      if (wTekscie) continue;
      const nazwa = (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      wynik.push(`${e.tagName.toLowerCase()} „${nazwa}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return wynik;
  }, MIN);
}

async function idz(page: Page, sciezka: string) {
  await page.evaluate((p) => {
    history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, sciezka);
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("żaden element interaktywny nie jest mniejszy niż 24 × 24 px — na każdym ekranie telefonu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  expect(await zaMale(page), "ekran startowy").toEqual([]);

  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1200);
  expect(await zaMale(page), "rzut").toEqual([]);

  for (const [nazwa, sciezka] of [
    ["rozdzielnica", "/rozdzielnica"],
    ["schemat", "/schemat"],
    ["kosztorys", "/kosztorys"],
    ["protokoły", "/protokoly"],
    ["kalkulatory", "/kalkulatory"],
  ] as const) {
    await idz(page, sciezka);
    expect(await zaMale(page), nazwa).toEqual([]);
  }
});

test("przycisk wyjścia z przykładu i spis skrótów też mieszczą się w minimum", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1200);

  const wyjscie = page.getByRole("button", { name: "Zacznij własny projekt" }).first();
  await expect(wyjscie).toBeVisible();
  const rWyjscia = (await wyjscie.boundingBox())!;
  expect(rWyjscia.height).toBeGreaterThanOrEqual(MIN);

  await idz(page, "/rozdzielnica");
  const spis = page.locator("summary", { hasText: "Co oznaczają skróty?" });
  await expect(spis).toBeVisible();
  expect((await spis.boundingBox())!.height).toBeGreaterThanOrEqual(MIN);
});

test("na komputerze (mysz) te same elementy zostają małe — zmiana dotyczy tylko dotyku", async ({ browser }) => {
  // Opcje z `test.use` (dotyk, isMobile) przenoszą się też na `browser.newContext()`, więc
  // brak dotyku trzeba podać JAWNIE — inaczej „komputer" dostaje `pointer: coarse`.
  const kontekst = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
  const page = await kontekst.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const link = page.getByRole("link", { name: "Prywatność i dane" });
  await expect(link).toBeVisible();
  // Gdyby cel dotykowy przeciekał na mysz, link w stopce urósłby na komputerze z 16 do 32 px.
  expect((await link.boundingBox())!.height).toBeLessThan(MIN);
  await kontekst.close();
});
