import { test, expect } from "@playwright/test";

/**
 * Ekran startowy na telefonie: oba wejścia — „Wgraj rzut / zdjęcie” i „Narysuj dom
 * samodzielnie” — mieszczą się na PIERWSZYM ekranie, bez przewijania.
 *
 * Po PR 3 redesignu „Co z tego powstanie” stało się siatką 2 × 2 (wcześniej przewijało
 * się w bok) i urosło o ok. 120 px — drugie wejście wylądowało przy 375 × 812 na
 * 823–863 px, czyli pod krawędzią. Decyzja produktowa: mniejsze miniatury na telefonie,
 * oba przyciski z powrotem w kadrze. Sprawdzamy też 360 px (wąski telefon i margines
 * na szersze czcionki w CI na Linuksie).
 */
for (const okno of [
  { width: 375, height: 812 },
  { width: 360, height: 780 },
]) {
  test(`${okno.width}×${okno.height}: oba wejścia ekranu startowego bez przewijania`, async ({ page }) => {
    await page.setViewportSize(okno);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    for (const nazwa of [/Wgraj rzut/, /Narysuj dom samodzielnie/]) {
      const przycisk = page.getByRole("button", { name: nazwa });
      await expect(przycisk).toBeVisible();
      const r = (await przycisk.boundingBox())!;
      expect(r.y + r.height, String(nazwa)).toBeLessThanOrEqual(okno.height);
    }
  });
}
