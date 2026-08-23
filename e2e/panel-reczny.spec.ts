import { test, expect } from "@playwright/test";

/**
 * Rozdzielnica jako zadanie SAMO W SOBIE — bez rysowania rzutu.
 *
 * Dobór rozdzielnicy bywa całą robotą: wymiana tablicy w istniejącym budynku albo
 * wycena nie wymagają projektu instalacji. Wcześniej zakładka pokazywała wtedy tylko
 * zaproszenie do zakładki „Instalacja", a lista aparatów żyła w stanie komponentu,
 * więc i tak przepadłaby przy odświeżeniu.
 */

const WIDOK = { name: "Widok czołowy rozdzielnicy" };

/** Oznaczenia aparatów w kolejności, w jakiej stoją na szynie. */
async function tagi(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const s = document.querySelector('[aria-label="Widok czołowy rozdzielnicy"]')!;
    return [...s.querySelectorAll("text")]
      .map((t) => t.textContent!.trim())
      .filter((t) => /^(Q|F|FI)\d+$/.test(t));
  });
}

async function pustyProjekt(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("bez rzutu można złożyć rozdzielnicę, a jej zawartość przeżywa odświeżenie", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();

  // Start od rozłącznika głównego i ogranicznika — pusta szyna kazałaby użytkownikowi
  // zgadywać, od czego zacząć.
  await expect(page.getByRole("img", WIDOK)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aparaty (2)" })).toBeVisible();

  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aparaty (3)" })).toBeVisible();

  // Autozapis lokalny ma 600 ms debounce'u — bez odczekania test sprawdzałby,
  // czy zapis, który jeszcze nie wystartował, coś zapisał.
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await expect(page.getByRole("heading", { name: "Aparaty (3)" })).toBeVisible();
});

test("schemat jednokreskowy powstaje z ręcznie złożonej rozdzielnicy", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await page.getByRole("button", { name: "Schemat" }).click();
  // Bez rzutu nie ma obwodów, więc schemat MUSI budować się z aparatów — inaczej
  // zostaje pusty ekran mimo gotowej rozdzielnicy.
  await expect(page.getByText(/Schemat powstaje z aparatów/)).toHaveCount(0);
  const rysunek = page.locator("svg[viewBox]").filter({ hasText: "Rozłącznik izolacyjny główny" });
  await expect(rysunek.first()).toBeVisible();
});

test("aparat da się przeciągnąć na inne miejsce szyny; główny zostaje pierwszy", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  const svg = page.getByRole("img", WIDOK);
  await expect(svg).toBeVisible();
  const przed = await tagi(page);
  expect(przed.length).toBeGreaterThanOrEqual(5);

  const pozycje = await page.evaluate(() => {
    const s = document.querySelector('[aria-label="Widok czołowy rozdzielnicy"]')!;
    const r = s.getBoundingClientRect();
    return [...s.querySelectorAll("text")]
      .filter((t) => /^(Q|F|FI)\d+$/.test(t.textContent!.trim()))
      .map((t) => {
        const b = (t as SVGTextElement).getBoundingClientRect();
        return { x: b.x + b.width / 2 - r.x, y: b.y + b.height / 2 - r.y };
      });
  });
  const box = (await svg.boundingBox())!;
  const zrodlo = pozycje[pozycje.length - 1];
  const cel = pozycje[1];
  // +50 px: łapiemy LICO aparatu, nie napis z oznaczeniem nad nim.
  await page.mouse.move(box.x + zrodlo.x, box.y + zrodlo.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + cel.x, box.y + cel.y + 50, { steps: 15 });
  await page.mouse.up();

  const po = await tagi(page);
  expect(po).not.toEqual(przed);
  expect(po[0]).toBe(przed[0]); // rozłącznik główny nie rusza się z pierwszej pozycji
  expect([...po].sort()).toEqual([...przed].sort()); // nic nie zginęło ani się nie zdublowało
});

test("długie opisy pod aparatami łamią się na dwie linie, zamiast urywać wielokropkiem", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Instalacja" }).click();
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  for (let i = 0; i < 4; i++) {
    await wrap.evaluate((e) => e.scrollTo(0, 0));
    const b = (await wrap.boundingBox())!;
    await page.mouse.click(b.x + 90 + i * 70, b.y + 110);
  }
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await expect(page.getByRole("img", WIDOK)).toBeVisible();

  // Ucinany był KONIEC nazwy — czyli dokładnie to, co odróżnia „Gniazda — Kuchnia"
  // od „Gniazda — Kuchnia (zmywarka)".
  const wielokropki = await page.evaluate(() => {
    const s = document.querySelector('[aria-label="Widok czołowy rozdzielnicy"]')!;
    return [...s.querySelectorAll("text, tspan")].map((t) => t.textContent!).filter((t) => t.includes("…"));
  });
  expect(wielokropki).toEqual([]);
});

test("klik na aparacie otwiera edycję; zmiana przeżywa odświeżenie", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  const svg = page.getByRole("img", WIDOK);
  await expect(svg).toBeVisible();
  const tagText = svg.locator("text", { hasText: "F2" }).first();
  await tagText.scrollIntoViewIfNeeded();
  const box = await tagText.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + 60);

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Aparat F2");

  await page.getByLabel("Nastawa").fill("C20");
  await page.getByLabel("Opis obwodu").fill("Gniazda garaż");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(svg).toContainText("C20");
  await expect(svg).toContainText("Gniazda");

  // Nadpisanie jest kluczowane po `key` aparatu i musi przeżyć odbudowę z rzutu —
  // wcześniej edycja aparatu auto-generowanego znikałaby po najbliższej zmianie planu.
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await expect(page.getByRole("img", WIDOK)).toContainText("C20");
});

test("edycja aparatu dodanego ręcznie działa bez nadpisań", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await page.getByRole("button", { name: "Edytuj aparat F2" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Oznaczenie").fill("F9");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();

  await expect(page.getByRole("img", WIDOK)).toContainText("F9");
});

test("paski opisowe: podgląd pokazuje zadrukowaną kartkę i pobiera się", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();

  await page.getByRole("button", { name: "Podgląd pasków" }).click();
  const canvas = page.locator("[data-podglad-stron] canvas");
  await expect(canvas.first()).toBeVisible({ timeout: 30000 });

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toMatch(/^paski-opisowe-rozdzielnicy.*\.pdf$/);
});
