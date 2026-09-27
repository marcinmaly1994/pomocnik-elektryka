import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Rozdzielnica na monitorze: front i lista aparatów.
 *
 * Front miał sztywne 720 px, a lista rozciągała się na resztę — przy 1920 px na
 * 1132 px, z ikonkami kilkaset pikseli od nazwy aparatu. Lista miała też sztywny
 * limit 26rem, więc przy 14 aparatach i wysokim frontcie obok ostatnie trzeba było
 * doprzewijać w małym okienku. Od `xl` lista ma stałą szerokość i jedzie przy
 * przewijaniu obok frontu, a front bierze resztę i rośnie do 125%.
 */

async function otworz(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).first().click();
  await expect(page.getByTestId("lista-aparatow")).toBeVisible();
}

for (const r of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${r.width}×${r.height}`, () => {
    test.use({ viewport: r });

    test("lista aparatów ma stałą szerokość, mieści 14 aparatów i jedzie obok frontu", async ({ page }) => {
      await otworz(page);
      const lista = page.getByTestId("lista-aparatow");
      const b = (await lista.boundingBox())!;
      expect(b.width).toBeLessThanOrEqual(480);
      // Wszystkie aparaty bez wewnętrznego przewijania.
      expect(await lista.locator(".pe-scroll").evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);

      // Przewinięcie strony w głąb frontu — lista zostaje w kadrze.
      await page.evaluate(() => window.scrollBy(0, 900));
      await page.waitForTimeout(200);
      const po = (await lista.boundingBox())!;
      expect(po.y).toBeGreaterThanOrEqual(0);
      expect(po.y).toBeLessThan(200);
    });

    test("front bierze resztę szerokości i jest większy niż 100%", async ({ page }) => {
      await otworz(page);
      const etykieta = await page.getByRole("button", { name: /Powiększenie rozdzielnicy \d+ procent/ }).getAttribute("aria-label");
      expect(Number(etykieta!.match(/(\d+) procent/)![1])).toBeGreaterThan(100);
    });
  });
}

/**
 * Plakietka różnicówki („FI2 · 30 mA") stała na środku klamry, na wysokości oznaczeń
 * aparatów — i wchodziła na oznaczenie tego, który akurat wypadł pod środkiem klamry
 * (F7 obok FI2). Stoi teraz nad samą różnicówką, w miejscu jej oznaczenia.
 */
test("plakietka różnicówki nie nachodzi na oznaczenia aparatów", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworz(page);
  const kolizje = await page.evaluate(() => {
    const svg = [...document.querySelectorAll("svg")].find((s) => s.textContent?.includes("30 mA"))!;
    const plakietki = [...svg.querySelectorAll("rect")].filter((r) => r.getAttribute("fill") === "#FDF6EF").map((r) => r.getBoundingClientRect());
    const oznaczenia = [...svg.querySelectorAll("text")]
      .filter((t) => t.getAttribute("font-size") === "11" && /^[A-Z]+\d+$/.test((t.textContent || "").trim()))
      .map((t) => ({ tag: t.textContent!.trim(), r: t.getBoundingClientRect() }));
    const nachodzi = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      plakietek: plakietki.length,
      kolizje: oznaczenia.filter((o) => plakietki.some((p) => nachodzi(p, o.r))).map((o) => o.tag),
    };
  });
  expect(kolizje.plakietek).toBe(2);
  expect(kolizje.kolizje).toEqual([]);
});
