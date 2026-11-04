import { test, expect, type Page } from "@playwright/test";
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

type Widok = { nazwa: string; wejdz: (page: Page) => Promise<void> };

const kafel = (page: Page, tytul: string) => page.getByRole("button", { name: tytul, exact: true }).first();

const WIDOKI: Widok[] = [
  { nazwa: "start", wejdz: async () => {} },
  { nazwa: "instalacja", wejdz: (p) => wczytajPrzyklad(p, "mieszkanie") },
  { nazwa: "rozdzielnica", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Rozdzielnica").click(); } },
  { nazwa: "schemat", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Schemat").click(); } },
  { nazwa: "kosztorys", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Kosztorys").click(); } },
  { nazwa: "kalkulatory", wejdz: (p) => p.goto("/kalkulatory").then(() => undefined) },
  { nazwa: "dobor-obwodu", wejdz: (p) => p.goto("/kalkulatory/przekroj").then(() => undefined) },
  { nazwa: "protokoly", wejdz: (p) => p.goto("/protokoly").then(() => undefined) },
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
        await page.waitForLoadState("networkidle");

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
