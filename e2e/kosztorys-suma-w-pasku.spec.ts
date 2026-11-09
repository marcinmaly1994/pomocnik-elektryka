import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Suma brutto kosztorysu jest stale widoczna w przyklejonym pasku kroku.
 *
 * Kosztorys ma ~30 pozycji; przy poprawianiu cen w połowie listy suma była albo
 * 1500 px wyżej (podsumowanie u góry), albo niżej (stopka tabeli). Pasek „Cofnij:
 * Schemat” i tak stoi na dole ekranu, a na Kosztorysie ma wolną prawą stronę.
 * Napis „Suma brutto”, nie „RAZEM brutto” — tamten szukają testy w podsumowaniu i stopce.
 */
for (const okno of [
  { width: 375, height: 812 },
  { width: 1366, height: 900 },
]) {
  test(`${okno.width} px: suma w pasku zgadza się z podsumowaniem i nadąża za zmianą ceny`, async ({ page }) => {
    await page.setViewportSize(okno);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

    const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
    const suma = pasek.getByTestId("suma-w-pasku");
    await expect(suma).toContainText("Suma brutto");

    const kwota = async (t: string) => Number(t.replace(/[^\d,]/g, "").replace(",", "."));
    const zPodsumowania = await kwota(await page.getByTestId("podsumowanie-brutto").innerText());
    expect(await kwota(await suma.innerText())).toBeCloseTo(zPodsumowania, 2);

    // Zastrzeżenie z etykiety podsumowania (np. „sam materiał”) musi być też w pasku.
    const etykieta = await page.getByTestId("podsumowanie-kosztorysu").locator("div.text-sm.font-semibold").first().innerText();
    const zastrzezenie = etykieta.split(" — ")[1];
    if (zastrzezenie) await expect(suma).toContainText(zastrzezenie);
    else await expect(suma).not.toContainText("(");
    expect(await suma.innerText()).not.toContain("RAZEM");

    // W połowie listy suma nadal w kadrze.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    const r = (await suma.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(okno.height);

    const przed = await kwota(await suma.innerText());
    const cena = page.getByLabel(/^Cena jednostkowa: Gniazdko 230V podwójne/);
    await cena.fill(String(Number(await cena.inputValue()) + 10));
    await expect.poll(async () => kwota(await suma.innerText())).toBeGreaterThan(przed);
  });
}
