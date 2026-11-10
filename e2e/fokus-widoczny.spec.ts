import { test, expect } from "@playwright/test";

/**
 * Fokus z klawiatury widać na KAŻDYM elemencie, i wygląda wszędzie tak samo.
 *
 * Po PR 2 przyciski i pola miały pierścień z tokenów, ale przełączniki trybu,
 * przycisk „i”, `<summary>` i kafle etapów zostały przy domyślnym obrysie
 * przeglądarki — innym w Chrome, innym w Firefoksie, na ciemnym tle niewidocznym.
 */
test("Tab po kalkulatorze: każdy zatrzymany element ma pierścień w kolorze głównym", async ({ page }) => {
  await page.goto("/kalkulatory/obwod?tryb=przekroj");
  await expect(page.getByRole("heading", { name: "Dobór obwodu" })).toBeVisible();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const bezPierscienia: string[] = [];
  const zatrzymane: { opis: string; etykieta: string; pole: boolean }[] = [];
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press("Tab");
    const stan = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const etykieta = (el.getAttribute("aria-label") || el.textContent || "").trim();
      const opis = `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}”`;
      const obrys = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && s.outlineColor === "rgb(45, 90, 140)";
      const pierscien = /rgb\(45, 90, 140\)/.test(s.boxShadow);
      return { opis, etykieta, pole: el.classList.contains("pe-input"), ok: obrys || pierscien };
    });
    if (!stan) continue;
    zatrzymane.push(stan);
    if (!stan.ok) bezPierscienia.push(stan.opis);
  }
  // Same puste przystanki (fokus na body) dawałyby zielony test przy pułapce fokusu albo
  // zepsutej kolejności Tab — dlatego sprawdzamy też, że Tab dotarł do znanych elementów.
  expect(zatrzymane.length, "Tab ma się zatrzymać na wielu elementach").toBeGreaterThanOrEqual(15);
  expect(zatrzymane.some((z) => /^(Szukam przekroju|Mam przekrój|WLZ|Pełny dobór)$/.test(z.etykieta)), "przełącznik trybu").toBe(true);
  expect(zatrzymane.some((z) => z.etykieta === "Pokaż podpowiedź"), "przycisk „i”").toBe(true);
  expect(zatrzymane.some((z) => z.pole), "pole .pe-input").toBe(true);
  expect(bezPierscienia).toEqual([]);
});
