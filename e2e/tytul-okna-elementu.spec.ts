import { test, expect, type Page } from "@playwright/test";

/**
 * Tytuł okna edycji mówi, W CO kliknięto.
 *
 * Okno otwiera się dwuklikiem w symbol na rzucie i nosiło stały tytuł „Edytuj element".
 * Przy trzydziestu symbolach na planie, po zmniejszeniu ich o jedną trzecią, po samym
 * oknie nie dało się poznać, czy trafiło się w gniazdko, czy w sąsiedni łącznik —
 * a jedyną odpowiedzią było zamknięcie okna i przyjrzenie się rysunkowi.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
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

async function postaw(page: Page, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: nazwa }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

async function otworzEdycje(page: Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stąd bierzemy pozycję
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ}`);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const canvas = (await page.locator(".konvajs-content").first().boundingBox())!;
  const widok = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), dx: st.x(), dy: st.y() };
  });
  await page.mouse.dblclick(canvas.x + el.x * widok.skala + widok.dx, canvas.y + el.y * widok.skala + widok.dy);
}

test("tytuł okna podaje nazwę elementu, w który kliknięto", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, /Gniazdo 230 V/, 120, 120);
  // Drugi typ z tej samej, domyślnie rozwiniętej sekcji biblioteki — sekcja
  // „Łączniki i sterowanie" startuje zwinięta i test potykał się o nią, a nie o kod.
  await postaw(page, /Gniazdko hermetyczne/, 260, 220);

  await otworzEdycje(page, "gniazdko");
  await expect(page.getByRole("heading", { name: "Edytuj element: Gniazdo 230 V" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Ten sam test dla DRUGIEGO typu — stały tytuł przeszedłby pierwszą połowę.
  await otworzEdycje(page, "gniazdkoHerm");
  await expect(page.getByRole("heading", { name: "Edytuj element: Gniazdko hermetyczne" })).toBeVisible();
});

/**
 * Nazwa w tytule opisuje element TAKI, JAKI JEST — nie ten, który wybrano niżej
 * w siatce. Siatka ma własny podpis „Zmień na", więc tytuł odpowiada na pytanie
 * „co to jest", a nie „na co to zmienię". Gdyby podążał za siatką, oba mówiłyby
 * to samo i pytanie „w co ja kliknąłem" znów zostałoby bez odpowiedzi.
 */
test("tytuł nie zmienia się po wybraniu innego typu w siatce", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, /Gniazdo 230 V/, 120, 120);
  await otworzEdycje(page, "gniazdko");

  const okno = page.getByRole("dialog");
  await okno.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();

  await expect(page.getByRole("heading", { name: "Edytuj element: Gniazdo 230 V" })).toBeVisible();
});
