import { test, expect, type Page } from "@playwright/test";

/**
 * Duch elementu pod kursorem w narzędziu „Wstaw Element".
 *
 * Duch ma jedno zadanie: pokazać, GDZIE i w jakim obrocie stanie element po kliknięciu.
 * Dlatego najważniejszy test porównuje jego pozycję z pozycją elementu, który klik
 * naprawdę postawił — a nie z samym kursorem. Reszta pilnuje zachowań skrajnych: duch
 * nie ma przechwytywać kliknięć, ma znikać z narzędziem, poza płótnem i przy dotyku.
 *
 * Sam duch jest węzłem Konvy (nie DOM), więc czytamy go przez `window.Konva`, tak jak
 * robi to `cable-routes.spec.ts`.
 */

type Duch = { x: number; y: number; rotation: number; opacity: number; listening: boolean };

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function narzedzieWstawiania(page: Page) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
}

/** Duch albo `null`, gdy go nie ma na scenie. */
async function duch(page: Page): Promise<Duch | null> {
  return page.evaluate(() => {
    const konva = (
      window as unknown as {
        Konva?: {
          stages: {
            find(sel: string): { x(): number; y(): number; rotation(): number; opacity(): number; getLayer(): { listening(): boolean } }[];
          }[];
        };
      }
    ).Konva;
    const g = konva?.stages[0]?.find("#duch-elementu")[0];
    return g ? { x: g.x(), y: g.y(), rotation: g.rotation(), opacity: g.opacity(), listening: g.getLayer().listening() } : null;
  });
}

/** Pozycje i obroty wszystkich postawionych elementów (grupy przeciągalne na scenie). */
async function postawione(page: Page) {
  return page.evaluate(() => {
    const konva = (
      window as unknown as {
        Konva?: { stages: { find(sel: string): { x(): number; y(): number; rotation(): number; draggable(): boolean }[] }[] };
      }
    ).Konva;
    return (konva?.stages[0]?.find("Group") ?? [])
      .filter((g) => g.draggable())
      .map((g) => ({ x: g.x(), y: g.y(), rotation: g.rotation() }));
  });
}

test("w narzędziu wstawiania duch idzie za kursorem i nie przechwytuje kliknięć", async ({ page }) => {
  await pustyProjekt(page);
  expect(await duch(page)).toBeNull();

  await narzedzieWstawiania(page);
  const b = await planBox(page);
  await page.mouse.move(b.x + 300, b.y + 250);
  await expect.poll(() => duch(page)).not.toBeNull();

  const a = (await duch(page))!;
  await page.mouse.move(b.x + 420, b.y + 310);
  await expect.poll(async () => (await duch(page))?.x).not.toBe(a.x);

  const d = (await duch(page))!;
  // Półprzezroczysty i bez nasłuchu — inaczej zasłaniałby klik, który ma postawić element.
  expect(d.opacity).toBeLessThan(1);
  expect(d.listening).toBe(false);
});

test("duch stoi dokładnie tam, gdzie klik postawi element", async ({ page }) => {
  await pustyProjekt(page);
  await narzedzieWstawiania(page);
  const b = await planBox(page);

  await page.mouse.move(b.x + 350, b.y + 280);
  await expect.poll(() => duch(page)).not.toBeNull();
  const zapowiedz = (await duch(page))!;

  await page.mouse.click(b.x + 350, b.y + 280);
  await expect(page.getByText(/Elementy:\s*1/)).toBeVisible();

  const stoi = await postawione(page);
  expect(stoi).toHaveLength(1);
  expect(stoi[0].x).toBeCloseTo(zapowiedz.x, 1);
  expect(stoi[0].y).toBeCloseTo(zapowiedz.y, 1);
  expect(stoi[0].rotation).toBeCloseTo(zapowiedz.rotation, 1);
});

test("po postawieniu elementu duch odsuwa się od niego, zamiast wisieć na nim", async ({ page }) => {
  await pustyProjekt(page);
  await narzedzieWstawiania(page);
  const b = await planBox(page);

  await page.mouse.move(b.x + 350, b.y + 280);
  await expect.poll(() => duch(page)).not.toBeNull();
  const przed = (await duch(page))!;

  await page.mouse.click(b.x + 350, b.y + 280);
  await expect(page.getByText(/Elementy:\s*1/)).toBeVisible();

  // Kolejny klik w TO SAMO miejsce postawiłby element obok pierwszego (rozsuwanie od
  // sąsiadów), więc duch bez ruchu myszy przesuwa się razem z tą zapowiedzią.
  await expect.poll(async () => {
    const po = await duch(page);
    return po ? Math.hypot(po.x - przed.x, po.y - przed.y) : 0;
  }).toBeGreaterThan(1);
});

test("duch znika po zmianie narzędzia i po opuszczeniu płótna", async ({ page }) => {
  await pustyProjekt(page);
  await narzedzieWstawiania(page);
  const b = await planBox(page);

  await page.mouse.move(b.x + 300, b.y + 250);
  await expect.poll(() => duch(page)).not.toBeNull();

  // Opuszczenie płótna.
  await page.mouse.move(b.x + b.width + 40, b.y + 20);
  await expect.poll(() => duch(page)).toBeNull();

  // Zmiana narzędzia — i brak ducha także po powrocie nad płótno w innym narzędziu.
  await page.mouse.move(b.x + 300, b.y + 250);
  await expect.poll(() => duch(page)).not.toBeNull();
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await expect.poll(() => duch(page)).toBeNull();
  await page.mouse.move(b.x + 320, b.y + 260);
  await page.waitForTimeout(150);
  expect(await duch(page)).toBeNull();
});

test.describe("dotyk", () => {
  test.use({ hasTouch: true });

  test("palec nie ma ducha — także wtedy, gdy mysz zdążyła go pokazać", async ({ page }) => {
    await pustyProjekt(page);
    await narzedzieWstawiania(page);
    const b = await planBox(page);

    await page.mouse.move(b.x + 300, b.y + 250);
    await expect.poll(() => duch(page)).not.toBeNull();

    // To, co Chrome robi po dotknięciu: zdarzenie wskaźnika typu "touch", a zaraz po nim
    // dorobiony "mousemove". Playwrightowy tap ich nie wysyła, więc odtwarzamy je ręcznie
    // — bez tego test przechodziłby także po wyłączeniu zabezpieczenia.
    await page.evaluate(
      ({ x, y }) => {
        const okno = document.querySelector("[data-testid=plan-okno]")!;
        const tresc = okno.querySelector("canvas")!.parentElement!;
        const opcje = { clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: "touch" };
        okno.dispatchEvent(new PointerEvent("pointermove", opcje));
        tresc.dispatchEvent(new MouseEvent("mousemove", opcje));
      },
      { x: b.x + 400, y: b.y + 300 }
    );
    await expect.poll(() => duch(page)).toBeNull();
  });

  test("dotknięcie płótna stawia element i nie zostawia ducha", async ({ page }) => {
    await pustyProjekt(page);
    await narzedzieWstawiania(page);
    const b = await planBox(page);

    await page.touchscreen.tap(b.x + 300, b.y + 250);
    await expect(page.getByText(/Elementy:\s*1/)).toBeVisible();
    await page.waitForTimeout(200);
    expect(await duch(page)).toBeNull();
  });
});
