import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Autozapis lokalny, gdy przegladarka odmawia zapisu.
 *
 * Podklad rzutu potrafi zajac prawie caly budzet `localStorage` (zmierzone: zdjecie
 * 4000 x 2800 to 4,8 MB przy okolo 5 MB limitu). Po przekroczeniu limitu `setItem`
 * rzuca wyjatkiem, a ten byl po cichu polykany: wskaznik pokazywal godzine OSTATNIEGO
 * UDANEGO zapisu i przestawal sie zmieniac, wiec uzytkownik zamykal karte w przekonaniu,
 * ze praca jest zapisana.
 *
 * Odmowe wywolujemy PODMIENIAJAC `setItem`, a nie zapychajac pamiec naprawde: realne
 * zapchanie zostawia nieprzewidywalny zapas (przegladarka zwalnia stara wartosc klucza,
 * ktory nadpisujemy), wiec test raz przechodzil, raz nie. Aplikacji i tak nie wolno
 * odrozniac tych dwoch sytuacji — dostaje ten sam wyjatek co przy prawdziwym limicie.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function postawGniazdko(page: Page, dx: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill("gniazdo 230");
  await page.locator("button.w-full.items-center.gap-2.rounded-md").filter({ hasText: /Gniazdo 230 V/ }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + dx, box.y + 90);
}

/** Przegladarka odmawia zapisu projektu — dokladnie tym wyjatkiem, co przy limicie. */
async function odmawiajZapisu(page: Page, odmawiaj: boolean) {
  await page.evaluate((wlacz) => {
    const w = window as unknown as { _oryginalnySetItem?: Storage["setItem"] };
    if (wlacz) {
      w._oryginalnySetItem ??= localStorage.setItem.bind(localStorage);
      localStorage.setItem = (klucz: string, wartosc: string) => {
        if (klucz.includes("projekt_autosave")) throw new DOMException("pelno", "QuotaExceededError");
        w._oryginalnySetItem!(klucz, wartosc);
      };
    } else if (w._oryginalnySetItem) {
      localStorage.setItem = w._oryginalnySetItem;
    }
  }, odmawiaj);
}

/** Wskaznik zapisu w naglowku — jedyny widoczny z KAZDEJ zakladki. */
function wskaznik(page: Page) {
  return page.getByRole("button", { name: /Zapisano lokalnie|NIE ZAPISANO|bez podk/i });
}

async function zacznijProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await postawGniazdko(page, 200);
  await page.waitForTimeout(900);
  await expect(wskaznik(page)).toContainText("Zapisano lokalnie");
}

test("odmowa zapisu jest widoczna, zamiast zamrozonej godziny", async ({ page }) => {
  await zacznijProjekt(page);

  await odmawiajZapisu(page, true);
  await postawGniazdko(page, 320);
  await page.waitForTimeout(1200);

  await expect(wskaznik(page)).toContainText("NIE ZAPISANO");
  // Aplikacja pracuje dalej — nieudany zapis nie zabiera nikomu roboty z ekranu.
  await expect(page.getByRole("button", { name: /Gniazda i zasilanie/ })).toBeVisible();
});

test("gdy zapis znow dziala, ostrzezenie znika", async ({ page }) => {
  await zacznijProjekt(page);

  await odmawiajZapisu(page, true);
  await postawGniazdko(page, 320);
  await page.waitForTimeout(1200);
  await expect(wskaznik(page)).toContainText("NIE ZAPISANO");

  await odmawiajZapisu(page, false);
  await postawGniazdko(page, 420);
  await page.waitForTimeout(1200);

  await expect(wskaznik(page)).toContainText("Zapisano lokalnie");
});

/**
 * Rysunek jest cenniejszy niz podklad: powstawal godzinami, a podklad wgrywa sie
 * z pliku w dziesiec sekund. Gdy caly projekt sie nie miesci, druga proba idzie bez
 * podkladow — i uzytkownik dostaje o tym jasna informacje, a nie ciche zniknięcie tla.
 */
test("gdy nie miesci sie tylko podklad, rysunek zostaje zapisany", async ({ page }) => {
  await zacznijProjekt(page);

  // Odmawiamy zapisu, dopoki w projekcie jest jakikolwiek podklad — czyli dokladnie
  // tak, jak zachowuje sie limit przekroczony wlasnie przez ten podklad.
  await page.evaluate(() => {
    const w = window as unknown as { _oryginalnySetItem?: Storage["setItem"] };
    w._oryginalnySetItem ??= localStorage.setItem.bind(localStorage);
    localStorage.setItem = (klucz: string, wartosc: string) => {
      if (klucz.includes("projekt_autosave") && wartosc.includes("data:image")) {
        throw new DOMException("pelno", "QuotaExceededError");
      }
      w._oryginalnySetItem!(klucz, wartosc);
    };
  });

  // Podklad wstawiamy przez zwykla sciezke aplikacji: wgranie pliku.
  const { makePng } = await import("./_png");
  await page.setInputFiles('input[type="file"]', { name: "rzut.png", mimeType: "image/png", buffer: makePng(1200, 800) });
  // Po wgraniu aplikacja proponuje kolejno przyciecie i kalibracje skali — oba
  // pomijamy, bo ten test dotyczy zapisu, nie obrobki rzutu.
  for (const nazwa of ["Pomiń — użyj całego rzutu", "Pomiń — ustawię później"]) {
    const przycisk = page.getByRole("button", { name: nazwa });
    // `waitFor`, nie `count()`: okna pojawiają się po kolei i sprawdzenie „czy jest"
    // tuż po wgraniu pliku trafia w moment, gdy pierwszego jeszcze nie ma.
    await przycisk.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    if (await przycisk.count()) await przycisk.click();
  }
  await page.waitForTimeout(1500);

  await expect(wskaznik(page)).toContainText("bez podk");

  // Rysunek ZAPISUJE SIE DALEJ: gniazdko postawione JUZ PO nieudanym zapisie podkladu
  // trafia do pamieci. To ta asercja odroznia „uratowalismy rysunek" od „zapis przestal
  // dzialac, a stara migawka przypadkiem zawiera elementy".
  await postawGniazdko(page, 420);
  await page.waitForTimeout(1200);

  const zapisane = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    const p = JSON.parse(raw ?? "{}");
    return { elementow: p.draft?.elements?.length ?? 0, podkladow: Object.keys(p.bgImages ?? {}).length };
  });
  // Jedno gniazdko sprzed wgrania podkladu i jedno po nim. Bez ratunkowego zapisu
  // w pamieci zostalaby migawka sprzed wgrania, czyli JEDNO.
  expect(zapisane.elementow).toBe(2);
  expect(zapisane.podkladow).toBe(0);
});
