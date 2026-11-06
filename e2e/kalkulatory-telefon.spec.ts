import { test, expect, type Page } from "@playwright/test";

/**
 * Kalkulatory na telefonie — przegląd wszystkich dziewiętnastu naraz.
 *
 * Co tu było nie tak:
 * - Bilans mocy: nazwa, moc, „W" i kosz w jednym rzędzie nie mieściły się w karcie,
 *   kosz wypadał za krawędź, a cała strona przewijała się w bok.
 * - Bilans faz: pięć pól w rzędzie ściskało nazwę odbioru do pustego kwadracika.
 * - Wszystkie pola miały 14 px — Safari na iPhonie przybliża wtedy stronę przy każdym
 *   stuknięciu w pole i sam jej nie oddala.
 * - Ikonki podpowiedzi „i" miały 12 × 12 px, a dymki wychodziły poza ekran (23 dymki
 *   w 14 kalkulatorach, nawet o 77 px — tekstu nie dało się doczytać).
 * - Wyszukiwarka pokazywała skrót ⌘K, bez znaczenia na dotyku.
 */

const NAZWY = [
  "Bilans mocy budynku", "Dobór obwodu", "Dobór wkładki gG", "Spadek napięcia", "Maksymalna długość obwodu",
  "Impedancja przewodu", "Prądy zwarciowe", "Impedancja pętli zwarcia", "Rezystancja uziemienia",
  "Uziom — dobór geometrii", "Dobór wyłącznika różnicowoprądowego", "Dobór przewodu PE i N", "Bilans faz i prąd w N",
  "Kompensacja mocy biernej", "Silnik indukcyjny", "Ochronniki przepięć (SPD)", "Instalacja fotowoltaiczna",
  "Ładowarka pojazdu elektrycznego", "Dobór oświetlenia",
];
const zaczynaSieOd = (s: string) => new RegExp("^" + s.replace(/[()]/g, (c) => "\\" + c));

async function otworzKalkulatory(page: Page, pierwszy: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await page.getByRole("button", { name: zaczynaSieOd(pierwszy) }).first().click();
}

/** Wybór kalkulatora z rozwijanej listy na telefonie (grupa „Zaawansowane" bywa zwinięta). */
async function wybierz(page: Page, nazwa: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Zmień kalkulator" }).click();
  const pozycja = page.getByRole("button", { name: zaczynaSieOd(nazwa) }).first();
  if (!(await pozycja.isVisible())) await page.getByRole("button", { name: /^Zaawansowane/ }).first().click();
  await pozycja.click();
}

test.describe("na telefonie", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("żaden kalkulator nie przewija się w bok, pola mają 16 px, a dymki mieszczą się w ekranie", async ({ page }) => {
    test.setTimeout(180_000);
    await otworzKalkulatory(page, NAZWY[0]);
    for (const nazwa of NAZWY) {
      await wybierz(page, nazwa);
      const m = await page.evaluate(() => {
        const pola = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")].filter(
          (e) => e.getBoundingClientRect().width > 0
        );
        return {
          szerStrony: document.documentElement.scrollWidth,
          drobne: pola.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length,
        };
      });
      expect(m.szerStrony, nazwa).toBeLessThanOrEqual(375);
      expect(m.drobne, nazwa).toBe(0);

      const podpowiedzi = page.getByRole("button", { name: "Pokaż podpowiedź" });
      const ile = await podpowiedzi.count();
      for (let i = 0; i < ile; i++) {
        await podpowiedzi.nth(i).scrollIntoViewIfNeeded();
        await podpowiedzi.nth(i).click();
        const r = (await page.getByRole("tooltip").boundingBox())!;
        expect(r.x, `${nazwa}: dymek ${i + 1}`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, `${nazwa}: dymek ${i + 1}`).toBeLessThanOrEqual(375);
        await page.getByRole("button", { name: "Ukryj podpowiedź" }).click();
      }
    }
  });

  test("bilans mocy i bilans faz: nazwa i faza czytelne, kosz w ekranie", async ({ page }) => {
    await otworzKalkulatory(page, "Bilans mocy budynku");
    const nazwa = (await page.getByLabel("Nazwa odbiornika").first().boundingBox())!;
    expect(nazwa.width).toBeGreaterThan(250);
    const kosz = (await page.getByRole("button", { name: /^Usuń odbiornik: / }).first().boundingBox())!;
    expect(kosz.x + kosz.width).toBeLessThanOrEqual(375);
    expect(kosz.width).toBeGreaterThanOrEqual(44);

    await wybierz(page, "Bilans faz i prąd w N");
    // Nazwa dzieli linię z fazą — ma być czytelna, a faza nie może ucinać „3-fazowy".
    expect((await page.getByLabel("Nazwa odbioru").first().boundingBox())!.width).toBeGreaterThan(150);
    const faza = page.getByRole("combobox", { name: /^Faza: / }).first();
    await faza.selectOption("3f");
    expect(await faza.evaluate((s: HTMLSelectElement) => s.scrollWidth <= s.clientWidth + 1 && s.clientWidth >= 100)).toBe(true);
    const koszFaz = (await page.getByRole("button", { name: /^Usuń odbiór: / }).first().boundingBox())!;
    expect(koszFaz.x + koszFaz.width).toBeLessThanOrEqual(375);
  });

  test("ikonka podpowiedzi łapie palec w promieniu kilkunastu pikseli, a ⌘K jest schowane", async ({ page }) => {
    await otworzKalkulatory(page, "Dobór obwodu");
    const ikonka = page.getByRole("button", { name: "Pokaż podpowiedź" }).first();
    await ikonka.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const b = (await ikonka.boundingBox())!;
    // 14 px w prawo od środka 12-pikselowej ikonki — dawniej pudło.
    await page.touchscreen.tap(b.x + b.width / 2 + 14, b.y + b.height / 2);
    await expect(page.getByRole("tooltip")).toBeVisible();

    await wybierz(page, "Dobór oświetlenia");
    await page.getByRole("button", { name: "Zmień kalkulator" }).click();
    // Wyszukiwarka stoi i na ekranie startowym, i w rozwijanej liście — obie bez skrótu.
    const skroty = await page.getByText(/^(⌘K|Ctrl K)$/).all();
    expect(skroty.length).toBeGreaterThan(0);
    for (const s of skroty) await expect(s).toBeHidden();
  });
});

/** Podpis skrótu zgodny z systemem: poza Makiem „Ctrl K", nie „⌘K" (audyt 5.11.2026, B12).
 *  Testy jadą w Chromium na Windowsie i Linuksie, więc tu zawsze oczekujemy „Ctrl K". */
test("na komputerze bez Maca wyszukiwarka podpowiada Ctrl K", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).first().click();
  await expect(page.getByText("Ctrl K").first()).toBeVisible();
  await expect(page.getByText("⌘K")).toHaveCount(0);
});

test("na komputerze wiersz bilansu mocy zostaje w jednej linii", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await otworzKalkulatory(page, "Bilans mocy budynku");
  const nazwa = (await page.getByLabel("Nazwa odbiornika").first().boundingBox())!;
  const kosz = (await page.getByRole("button", { name: /^Usuń odbiornik: / }).first().boundingBox())!;
  expect(Math.abs(nazwa.y + nazwa.height / 2 - (kosz.y + kosz.height / 2))).toBeLessThan(4);
});
