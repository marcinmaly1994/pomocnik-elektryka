import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Front rozdzielnicy na telefonie: powiększanie przyciskami i szczypaniem.
 *
 * Front mieścił się w szerokości ekranu, ale opisy obwodów pod aparatami miały wtedy
 * kilka pikseli i nie dało się ich przeczytać — a powiększyć nie było jak. Po
 * powiększeniu rysunek musi się dać przesuwać palcem w bok, a aparaty nadal
 * przenosić po szynie: oba gesty są poziome, więc to one tu się spotykają.
 *
 * Emulacja telefonu (`isMobile`) i dotyk przez CDP — `page.touchscreen` potrafi tylko
 * pojedyncze dotknięcie.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const okno = (page: Page) => page.getByTestId("rozdzielnica-okno");
const rysunek = (page: Page) => page.getByRole("img", { name: "Widok czołowy rozdzielnicy" });

async function otworz(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(rysunek(page)).toBeVisible();
}

async function powiekszenie(page: Page): Promise<number> {
  const e = await page.getByRole("button", { name: /Powiększenie rozdzielnicy \d+ procent/ }).getAttribute("aria-label");
  return Number(e!.match(/(\d+) procent/)![1]);
}

async function przeciagnij(cdp: CDPSession, punkty: { x: number; y: number }[][]) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: punkty[0].map((p, i) => ({ ...p, id: i + 1 })),
  });
  for (const krok of punkty.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: krok.map((p, i) => ({ ...p, id: i + 1 })) });
    await new Promise((r) => setTimeout(r, 40));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Oznaczenia aparatów pierwszego rzędu, od lewej. */
async function pierwszyRzad(page: Page) {
  return rysunek(page).evaluate((svg) => {
    const grupy = [...svg.querySelectorAll("g[style*='cursor']")]
      .map((g) => {
        const tag = [...g.querySelectorAll("text")]
          .map((t) => (t.textContent ?? "").trim())
          .find((t) => /^(Q\d+|FI\d+|F\d+)$/.test(t));
        const lico = [...g.querySelectorAll("rect")]
          .map((r) => r.getBoundingClientRect())
          .sort((a, z) => z.width * z.height - a.width * a.height)[0];
        return tag && lico ? { tag, y: Math.round(g.getBoundingClientRect().y), cx: lico.x + lico.width / 2, cy: lico.y + lico.height / 2 } : null;
      })
      .filter((v): v is { tag: string; y: number; cx: number; cy: number } => v !== null)
      .sort((a, b) => a.y - b.y || a.cx - b.cx);
    return grupy.filter((g) => g.y === grupy[0].y);
  });
}

test("front otwiera się dopasowany do szerokości", async ({ page }) => {
  await otworz(page);
  const w = await okno(page).evaluate((el) => ({
    rysunek: el.querySelector("svg")!.getBoundingClientRect().width,
    miejsce: el.clientWidth,
    przewijalny: el.scrollWidth > el.clientWidth + 1,
  }));
  expect(w.przewijalny).toBe(false);
  expect(w.rysunek).toBeGreaterThan(w.miejsce - 4);
  expect(await powiekszenie(page)).toBeLessThan(100);
});

test("rozsunięcie palców powiększa front", async ({ page }) => {
  await otworz(page);
  const przed = await powiekszenie(page);
  const box = (await okno(page).boundingBox())!;
  await okno(page).scrollIntoViewIfNeeded();
  const b = (await okno(page).boundingBox())!;
  const sx = b.x + b.width / 2;
  const sy = Math.min(b.y + 200, 700);
  const cdp = await page.context().newCDPSession(page);
  await przeciagnij(
    cdp,
    [0, 20, 40, 60, 80].map((d) => [
      { x: sx - 30 - d, y: sy },
      { x: sx + 30 + d, y: sy },
    ])
  );
  await cdp.detach();
  expect(box.width).toBeGreaterThan(0);
  expect(await powiekszenie(page)).toBeGreaterThan(przed * 2);
});

/**
 * Palec obok aparatu przewija powiększony rysunek w bok. Startujemy na legendzie
 * „Oznaczenia" — to nie aparat, więc gest należy do przewijania.
 */
test("po powiększeniu palec obok aparatu przewija rysunek w bok", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: "Powiększ rozdzielnicę" }).click();
  await page.getByRole("button", { name: "Powiększ rozdzielnicę" }).click();
  await page.getByRole("button", { name: "Powiększ rozdzielnicę" }).click();
  // Pionowe przewijanie zostaje przeglądarce; poziome prowadzi sam rysunek (patrz
  // `przesuw` w PanelRender) — `pan-x` oddałoby przeglądarce też przeciąganie aparatów.
  await expect(okno(page)).toHaveCSS("touch-action", "pan-y");

  const legenda = page.getByText("OZNACZENIA", { exact: false }).first();
  await legenda.scrollIntoViewIfNeeded();
  const l = (await legenda.boundingBox())!;
  const y = l.y + l.height / 2;
  const przed = await okno(page).evaluate((el) => el.scrollLeft);
  const cdp = await page.context().newCDPSession(page);
  await przeciagnij(cdp, [0, 1, 2, 3, 4, 5, 6].map((k) => [{ x: 300 - k * 30, y }]));
  await cdp.detach();
  await expect.poll(() => okno(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(przed + 50);
});

/** Poziomy gest NA aparacie dalej go przenosi — przewijanie go nie przejmuje. */
test("po powiększeniu aparat nadal przenosi się palcem", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: "Powiększ rozdzielnicę" }).click();
  await okno(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  const rzad = await pierwszyRzad(page);
  const z = rzad[1];
  const na = rzad.filter((g) => g.cx < 360).at(-1)!;
  expect(na.tag, "test potrzebuje dwóch różnych aparatów w kadrze").not.toBe(z.tag);

  const przewiniecie = await okno(page).evaluate((el) => el.scrollLeft);
  const cdp = await page.context().newCDPSession(page);
  await przeciagnij(cdp, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [{ x: z.cx + ((na.cx - z.cx) * i) / 8, y: z.cy }]));
  await cdp.detach();

  expect(await okno(page).evaluate((el) => el.scrollLeft), "rysunek nie może pojechać razem z palcem").toBe(przewiniecie);
  const po = (await pierwszyRzad(page)).map((g) => g.tag);
  // Chwycony aparat zmienił miejsce w rzędzie.
  expect(po).not.toEqual(rzad.map((g) => g.tag));
});

test("przyciski powiększają i wracają do dopasowania", async ({ page }) => {
  await otworz(page);
  const dopasowane = await powiekszenie(page);
  await page.getByRole("button", { name: "Powiększ rozdzielnicę" }).click();
  expect(await powiekszenie(page)).toBeGreaterThan(dopasowane);
  await page.getByRole("button", { name: "Dopasuj rozdzielnicę do szerokości" }).click();
  expect(await powiekszenie(page)).toBe(dopasowane);
});
