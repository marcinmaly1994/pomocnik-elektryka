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
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const stan = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const opis = `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}”`;
      const obrys = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && s.outlineColor === "rgb(45, 90, 140)";
      const pierscien = /rgb\(45, 90, 140\)/.test(s.boxShadow);
      return { opis, ok: obrys || pierscien };
    });
    if (stan && !stan.ok) bezPierscienia.push(stan.opis);
  }
  expect(bezPierscienia).toEqual([]);
});
