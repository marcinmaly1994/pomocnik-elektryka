import { test, expect, type Locator, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Żaden widok nie przewija się w poziomie na żadnej z siedmiu szerokości ze specu
 * redesignu — od najmniejszego telefonu po monitor Full HD.
 *
 * Przy okazji, gdy ustawiona jest zmienna ZRZUTY=<katalog>, zapisuje zrzut każdego
 * widoku: to materiał „przed/po” do opisu PR-ów redesignu, a nie asercja.
 * Bez zmiennej test tylko sprawdza.
 */
const SZEROKOSCI = [360, 390, 430, 768, 1024, 1366, 1920] as const;
const ZRZUTY = process.env.ZRZUTY;

/**
 * `kotwica` to treść unikalna dla widoku i widoczna na KAŻDEJ szerokości. Bez niej
 * test mógłby zmierzyć pustą stronę (jeszcze nie wczytany leniwy fragment) albo
 * przekierowanie na ekran startowy — i przejść, bo pusta strona nie przewija się
 * w poziomie. Mierzymy więc dopiero po tym, jak widok faktycznie się wyrysuje.
 */
type Widok = { nazwa: string; wejdz: (page: Page) => Promise<void>; kotwica: (page: Page) => Locator };

const kafel = (page: Page, tytul: string) => page.getByRole("button", { name: tytul, exact: true }).first();
const naglowek = (page: Page, tytul: string) => page.getByRole("heading", { name: tytul, exact: true }).first();

const WIDOKI: Widok[] = [
  { nazwa: "start", wejdz: async () => {}, kotwica: (p) => naglowek(p, "Zaprojektuj instalację elektryczną w swoim domu") },
  { nazwa: "instalacja", wejdz: (p) => wczytajPrzyklad(p, "mieszkanie"), kotwica: (p) => p.getByTestId("plan-okno") },
  { nazwa: "rozdzielnica", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Rozdzielnica").click(); }, kotwica: (p) => naglowek(p, "Rozdzielnica elektryczna") },
  { nazwa: "schemat", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Schemat").click(); }, kotwica: (p) => naglowek(p, "Schemat instalacji (jednokreskowy)") },
  { nazwa: "kosztorys", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Kosztorys").click(); }, kotwica: (p) => naglowek(p, "Kosztorys instalacji elektrycznej") },
  { nazwa: "kalkulatory", wejdz: (p) => p.goto("/kalkulatory").then(() => undefined), kotwica: (p) => naglowek(p, "Kalkulatory elektryczne") },
  // Stary adres „/kalkulatory/przekroj" przekierowuje na „/kalkulatory/obwod?tryb=przekroj".
  { nazwa: "dobor-obwodu", wejdz: (p) => p.goto("/kalkulatory/przekroj").then(() => undefined), kotwica: (p) => naglowek(p, "Dobór obwodu") },
  { nazwa: "protokoly", wejdz: (p) => p.goto("/protokoly").then(() => undefined), kotwica: (p) => naglowek(p, "Protokoły pomiarowe") },
];

for (const szer of SZEROKOSCI) {
  test.describe(`${szer} px`, () => {
    test.use({ viewport: { width: szer, height: szer < 768 ? 844 : 900 } });

    for (const widok of WIDOKI) {
      test(`${widok.nazwa}: bez poziomego przewijania`, async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await widok.wejdz(page);
        await expect(widok.kotwica(page)).toBeVisible();
        // Zamiana fontu zmienia szerokości — mierzymy dopiero po załadowaniu fontów.
        await page.evaluate(() => document.fonts.ready);

        // Sprawdzamy tylko przewijanie CAŁEJ strony (documentElement), nie wewnętrzne
        // kontenery z własnym overflow — te mogą przewijać się celowo.

        const { scroll, okno } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          okno: window.innerWidth,
        }));
        expect(scroll, `szerokość dokumentu na ${szer} px`).toBeLessThanOrEqual(okno);

        if (ZRZUTY) await page.screenshot({ path: `${ZRZUTY}/${szer}-${widok.nazwa}.png`, fullPage: true });
      });
    }
  });
}
