import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska, wczytajPrzyklad } from "./_flow";

/**
 * Zestawienie ilosciowe w zakladce Instalacja.
 *
 * Arytmetyka ma testy jednostkowe (`summarizeFloor`). Tutaj chodzi o spiecie: czy karta
 * liczy z BIEZACEJ kondygnacji, czy odswieza sie po kazdej zmianie planu i czy podaje
 * te same liczby, co pasek stanu — rozjazd miedzy nimi bylby gorszy niz brak zestawienia.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
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

async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

const karta = (page: Page) => page.locator("div.pe-card", { hasText: "Zestawienie elementów" });

async function rozwin(page: Page) {
  await karta(page).getByRole("button", { name: /Zestawienie elementów/ }).click();
}

test("zestawienie rosnie razem z rysunkiem i zgadza sie z paskiem stanu", async ({ page }) => {
  await pustyProjekt(page);
  await expect(karta(page)).toContainText("nic jeszcze nie postawiono");

  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 280, 200);
  await postaw(page, "sufit", /Punkt sufitowy/, 350, 260);

  await expect(karta(page)).toContainText("3 szt.");
  // Ta sama liczba w pasku stanu — dwa miejsca nie moga podawac roznych sum.
  await expect(page.getByText(/Elementy:\s*3/)).toBeVisible();

  await rozwin(page);
  await expect(karta(page)).toContainText("Gniazdo 230 V");
  await expect(karta(page)).toContainText("Punkt sufitowy");
});

test("wyposazenie sanitarne nie jest liczone jako osprzet", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await postaw(page, "wanna", /Wanna/, 350, 260);

  // Pasek stanu liczy WSZYSTKIE elementy na planie, zestawienie tylko osprzet —
  // stad celowa roznica 2 kontra 1.
  await expect(page.getByText(/Elementy:\s*2/)).toBeVisible();
  await expect(karta(page)).toContainText("1 szt. osprzętu");
  await rozwin(page);
  await expect(karta(page)).not.toContainText("Wanna");
});

test("zestawienie dotyczy BIEZACEJ kondygnacji", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await expect(karta(page)).toContainText("1 szt.");

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await expect(karta(page)).toContainText("nic jeszcze nie postawiono");
});

/**
 * Nagłówek zestawienia na telefonie. Tytuł i suma walczyły o ok. 170 px w jednym rzędzie
 * i łamały się na dwie linie każde („Zestawienie / elementów", „50 szt. / osprzętu"),
 * co wyglądało jak błąd układu — a suma, która zmienia się z każdym elementem, jest
 * pierwszą rzeczą, na którą patrzy się w tym nagłówku.
 */
test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("tytuł i suma w nagłówku zestawienia nie łamią się wewnątrz — od 320 do 430 px", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "dom");
    await expect(karta(page)).toContainText("szt. osprzętu");

    for (const szerokosc of [320, 375, 430]) {
      await page.setViewportSize({ width: szerokosc, height: 812 });
      await page.waitForTimeout(150);
      const rozbite = await page.evaluate(() => {
        const naglowek = [...document.querySelectorAll("button[aria-expanded]")].find((b) => b.textContent?.includes("Zestawienie elementów"))!;
        const wynik: string[] = [];
        const chodzik = document.createTreeWalker(naglowek, NodeFilter.SHOW_TEXT);
        for (let w = chodzik.nextNode(); w; w = chodzik.nextNode()) {
          const tekst = w.textContent?.trim();
          if (!tekst) continue;
          const zakres = document.createRange();
          zakres.selectNodeContents(w);
          // Węzeł tekstowy w jednej linii ma jeden prostokąt; w dwóch liniach — dwa.
          if (zakres.getClientRects().length > 1) wynik.push(tekst);
        }
        return wynik;
      });
      expect(rozbite, `szerokość ${szerokosc} px`).toEqual([]);
    }
  });

  test("na komputerze tytuł i suma stoją obok siebie w jednej linii", async ({ browser }) => {
    const kontekst = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await kontekst.newPage();
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "dom");
    await expect(karta(page)).toContainText("szt. osprzętu");
    const wysokosci = await page.evaluate(() => {
      const naglowek = [...document.querySelectorAll("button[aria-expanded]")].find((b) => b.textContent?.includes("Zestawienie elementów"))!;
      const tytul = [...naglowek.querySelectorAll("span")].find((s) => s.textContent === "Zestawienie elementów")!;
      const suma = [...naglowek.querySelectorAll("span")].find((s) => s.textContent?.includes("szt. osprzętu") && s !== tytul)!;
      return { tytul: tytul.getBoundingClientRect().top, suma: suma.getBoundingClientRect().top };
    });
    // Obok siebie: górne krawędzie różnią się o różnicę rozmiarów czcionek, nie o linię.
    expect(Math.abs(wysokosci.tytul - wysokosci.suma)).toBeLessThan(8);
    await kontekst.close();
  });
});
