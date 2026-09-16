import { test, expect, type Page } from "@playwright/test";

/**
 * Pasek wyboru protokołu.
 *
 * Kafelki miały różne szerokości (`flex flex-wrap`), więc siódmy — „Ochrona odgromowa
 * (LPS)" — zostawał sam w drugim rzędzie i czytał się jak coś, co się nie zmieściło,
 * a nie jak układ. Równe kolumny to naprawiają: niepełny ostatni rząd wygląda wtedy
 * normalnie.
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function protokoly(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).click();
  await expect(page.getByRole("heading", { name: "Protokoły pomiarowe" })).toBeVisible();
}

/** Prostokąty wszystkich kafelków wyboru protokołu. */
async function kafelki(page: Page) {
  return page.evaluate(() => {
    // Szukamy po PRZYCISKU, nie po dowolnym divie z tym tekstem — ten drugi trafiał
    // w nadrzędny kontener strony, którego `closest("button")` jest puste.
    const przycisk = [...document.querySelectorAll("button")].find((b) =>
      /^Oględziny instalacji/.test((b.textContent ?? "").trim())
    );
    const pasek = przycisk?.parentElement;
    if (!pasek) return null;
    return [...pasek.children].map((el) => {
      const r = el.getBoundingClientRect();
      return { tekst: (el.textContent ?? "").slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    });
  });
}

test("kafelki protokołów mają równe szerokości", async ({ page }) => {
  await protokoly(page);
  const k = (await kafelki(page))!;
  expect(k.length).toBe(7);

  const szerokosci = [...new Set(k.map((x) => x.w))];
  expect(szerokosci.length, `różne szerokości: ${szerokosci.join(", ")}`).toBe(1);
});

test("żaden rząd nie zostaje z pojedynczym kafelkiem", async ({ page }) => {
  await protokoly(page);
  const k = (await kafelki(page))!;

  const rzedy = new Map<number, number>();
  for (const x of k) rzedy.set(x.y, (rzedy.get(x.y) ?? 0) + 1);

  const osierocone = [...rzedy.entries()].filter(([, ile]) => ile === 1);
  expect(osierocone.length, `rzędy z jednym kafelkiem: ${osierocone.map(([y]) => y).join(", ")}`).toBe(0);
});
