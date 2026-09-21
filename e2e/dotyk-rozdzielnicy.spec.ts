import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Rysunek rozdzielnicy byl OBSLUGIWANY WYLACZNIE MYSZA.
 *
 * Dwie czynnosci robi sie na samym rysunku i obie stoja na zdarzeniach, ktorych
 * palec nie wysyla:
 *
 *   • KASOWANIE — kolko „×" pokazuje sie tylko pod kursorem (`hovered === d.uid`),
 *     wiec bez najezdzania myszą nie pojawia sie nigdy.
 *   • PRZENOSZENIE po szynie — stoi na `onPointerEnter` SASIADOW chwyconego aparatu,
 *     swiadomie bez `setPointerCapture`. Przy dotyku przegladarka robi to
 *     przechwycenie SAMA, juz przy `pointerdown`, wiec sasiedzi nie dostaja niczego.
 *
 * Nic nie bylo przez to NIEOSIAGALNE — lista „Aparaty" obok rysunku ma kosz
 * i strzalki, i one dzialaja palcem od zawsze. Ale sam rysunek, czyli to, na co sie
 * patrzy, byl na telefonie tylko do ogladania.
 *
 * Kazdy przypadek sprawdzany DOTYKIEM I MYSZA, bo poprawka doklada druga droge do
 * tej samej czynnosci — a wtedy najlatwiej zepsuc te pierwsza.
 */

test.use({ hasTouch: true });

function rysunek(page: Page) {
  return page.locator('svg[aria-label="Widok czołowy rozdzielnicy"]');
}

/**
 * Aparaty w kolejnosci, w jakiej stoja na szynie: najpierw RZEDAMI, potem od lewej.
 *
 * Sortowanie po samym `x` mieszaloby rzedy — rozdzielnica ma ich trzy, a aparat
 * z drugiego rzedu potrafi stac bardziej na lewo niz polowa pierwszego.
 */
async function kolejnoscAparatow(page: Page): Promise<string[]> {
  return rysunek(page).evaluate((svg) =>
    [...svg.querySelectorAll("g[style*='cursor']")]
      .map((g) => {
        const b = g.getBoundingClientRect();
        // Kolko kasowania tez jest grupa z kursorem, ale nie ma oznaczenia — odpada.
        const tag = [...g.querySelectorAll("text")]
          .map((t) => (t.textContent ?? "").trim())
          .find((t) => /^(Q\d+|FI\d+|F\d+)$/.test(t));
        return tag ? { y: Math.round(b.y), x: b.x, tag } : null;
      })
      .filter((v): v is { y: number; x: number; tag: string } => v !== null)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((v) => v.tag)
  );
}

/** Srodek LICA aparatu o danym oznaczeniu — punkt, w ktory sie celuje palcem. */
async function srodekAparatu(page: Page, tag: string) {
  const p = await rysunek(page).evaluate((svg, szukany) => {
    const grupa = [...svg.querySelectorAll("g[style*='cursor']")].find((g) =>
      [...g.querySelectorAll("text")].some((t) => (t.textContent ?? "").trim() === szukany)
    );
    if (!grupa) return null;
    // Rozdzielnica ma trzy rzedy i jest WYZSZA niz okno — aparat z dolnego rzedu
    // lezy poza widokiem, a wspolrzedne spoza okna nie trafiaja w nic.
    grupa.scrollIntoView({ block: "center" });
    // Grupa SVG sama w sobie nie lapie zdarzen — lapia je zamalowane dzieci.
    // Srodek grupy wypada czesto w szczelinie miedzy licem a podpisem pod nim
    // i dotkniecie przechodzi wtedy obok. Celujemy w LICO, czyli w najwiekszy
    // prostokat w tej grupie.
    const lico = [...grupa.querySelectorAll("rect")]
      .map((r) => r.getBoundingClientRect())
      .sort((a, z) => z.width * z.height - a.width * a.height)[0];
    const b = lico ?? grupa.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, tag);
  return p!;
}

async function otworzRozdzielnice(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(rysunek(page)).toBeVisible();
  await expect.poll(async () => (await kolejnoscAparatow(page)).length).toBeGreaterThan(5);
}

test("aparat da sie skasowac z RYSUNKU dotykiem — nie tylko z listy obok", async ({ page }) => {
  await otworzRozdzielnice(page);
  const przed = await kolejnoscAparatow(page);
  const kasowany = przed[przed.length - 1];

  const p = await srodekAparatu(page, kasowany);
  await page.touchscreen.tap(p.x, p.y);

  // Dotkniecie aparatu otwiera jego okno — i to tam mieszka kasowanie, bo kolko „×"
  // na licu wymaga kursora, ktorego na telefonie nie ma.
  await page.getByRole("button", { name: "Usuń aparat" }).click();

  await expect.poll(() => kolejnoscAparatow(page)).not.toContain(kasowany);
});

test("kasowanie z okna aparatu dziala tak samo myszą", async ({ page }) => {
  await otworzRozdzielnice(page);
  const przed = await kolejnoscAparatow(page);
  const kasowany = przed[przed.length - 1];

  const p = await srodekAparatu(page, kasowany);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Usuń aparat" }).click();

  await expect.poll(() => kolejnoscAparatow(page)).not.toContain(kasowany);
});

/** Rozlacznika glownego (Q1) skasowac sie NIE DA — okno nie moze tego udawac. */
test("okno rozlacznika glownego nie proponuje kasowania", async ({ page }) => {
  await otworzRozdzielnice(page);
  const p = await srodekAparatu(page, "Q1");
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByRole("button", { name: "Zapisz zmiany" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Usuń aparat" })).toHaveCount(0);
});

/** Dwa aparaty z TEGO SAMEGO rzedu — przenoszenie miedzy rzedami to inny przypadek. */
async function dwaZPierwszegoRzedu(page: Page) {
  return rysunek(page).evaluate((svg) => {
    svg.scrollIntoView({ block: "start" });
    const grupy = [...svg.querySelectorAll("g[style*='cursor']")]
      .map((g) => {
        const b = g.getBoundingClientRect();
        const tag = [...g.querySelectorAll("text")]
          .map((t) => (t.textContent ?? "").trim())
          .find((t) => /^(Q\d+|FI\d+|F\d+)$/.test(t));
        const lico = [...g.querySelectorAll("rect")]
          .map((r) => r.getBoundingClientRect())
          .sort((a, z) => z.width * z.height - a.width * a.height)[0];
        const c = lico ?? b;
        return tag ? { y: Math.round(b.y), x: b.x, cx: c.x + c.width / 2, cy: c.y + c.height / 2, tag } : null;
      })
      .filter((v): v is { y: number; x: number; cx: number; cy: number; tag: string } => v !== null)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const rzad = grupy.filter((g) => g.y === grupy[0].y);
    return { z: rzad[1], na: rzad[rzad.length - 1] };
  });
}

test("aparat da sie przeniesc po szynie PALCEM", async ({ page }) => {
  await otworzRozdzielnice(page);
  const przed = await kolejnoscAparatow(page);
  const { z, na } = await dwaZPierwszegoRzedu(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: z.cx, y: z.cy, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: z.cx + ((na.cx - z.cx) * i) / 8, y: z.cy, id: 1 }],
    });
    await page.waitForTimeout(40);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();

  await expect.poll(() => kolejnoscAparatow(page)).not.toEqual(przed);
});

test("przenoszenie myszą dziala jak dotad", async ({ page }) => {
  await otworzRozdzielnice(page);
  const przed = await kolejnoscAparatow(page);
  const { z, na } = await dwaZPierwszegoRzedu(page);

  await page.mouse.move(z.cx, z.cy);
  await page.mouse.down();
  await page.mouse.move(na.cx, na.cy, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => kolejnoscAparatow(page)).not.toEqual(przed);
});
