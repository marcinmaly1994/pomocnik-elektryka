import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Zestaw poprawek zgłoszonych jedną paczką uwag UI/UX do edytora planu:
 *  - „Cofnij” nie działało W TRAKCIE rysowania ściany/pomieszczenia (historia zna
 *    tylko zatwierdzone zmiany, punkty w trakcie rysowania żyją w lokalnym stanie),
 *  - element dało się przesunąć TYLKO po przełączeniu na „Zaznacz”,
 *  - zakładka panelu (Elementy/Pomieszczenia) nie podążała za wybranym narzędziem.
 *
 * Każdy test startuje z czystego projektu — te zachowania zależą od stanu
 * onboardingu (jest/nie ma podkładu, jest/nie ma skali).
 */

async function pustyProjekt(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
}

async function zacznijRysowacRecznie(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

test.describe("Cofnij w trakcie rysowania", () => {
  test("usuwa ostatni postawiony punkt ściany zamiast być wyłączony", async ({ page }) => {
    await pustyProjekt(page);
    await zacznijRysowacRecznie(page);

    const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
    // `scrollIntoView` przesuwa STRONĘ (nie tylko wewnętrzny scroll płótna) tak, żeby
    // górna krawędź kontenera wypadła na szczycie okna — bez tego banery nad edytorem
    // (np. „Zacznij od wgrania rzutu…", widoczny dopóki nie ma podkładu) potrafią
    // zepchnąć płótno tak nisko, że kliknięcia z dużym `oy` lądują POZA widocznym
    // viewportem i po prostu nic nie trafiają.
    await wrap.evaluate((e) => {
      e.scrollIntoView({ block: "start" });
      e.scrollTo(0, 0);
    });
    const b = (await wrap.boundingBox())!;
    const oy = b.y < 0 ? -b.y + 50 : 300;

    // Przed jakimkolwiek punktem historia jest pusta — przycisk ma być wyłączony.
    const cofnij = page.getByRole("button", { name: "Cofnij" });
    await expect(cofnij).toBeDisabled();

    await page.mouse.click(b.x + 400, b.y + oy);
    await page.mouse.click(b.x + 600, b.y + oy);
    await page.mouse.click(b.x + 600, b.y + oy + 150);
    await expect(page.getByText("Rysowanie ściany: 3 pkt.")).toBeVisible();

    // To jest sedno zgłoszenia: „Cofnij” ma być AKTYWNY mid-draw i cofać punkt po
    // punkcie, a nie czekać na zatwierdzenie całej ściany.
    await expect(cofnij).toBeEnabled();
    await cofnij.click();
    await expect(page.getByText("Rysowanie ściany: 2 pkt.")).toBeVisible();
    await cofnij.click();
    await expect(page.getByText("Rysowanie ściany: 1 pkt.")).toBeVisible();
    await cofnij.click();
    await expect(page.getByText(/Rysowanie ściany/)).toHaveCount(0);

    // Ostatni punkt zniknął — z powrotem nie ma czego cofać (chyba że dojdzie
    // wcześniejsza, zatwierdzona historia, a tu jej nie ma).
    await expect(cofnij).toBeDisabled();
  });

  test("Ctrl+Z robi to samo co przycisk „Cofnij” — usuwa punkt mid-draw", async ({ page }) => {
    await pustyProjekt(page);
    await zacznijRysowacRecznie(page);

    const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
    // `scrollIntoView` przesuwa STRONĘ (nie tylko wewnętrzny scroll płótna) tak, żeby
    // górna krawędź kontenera wypadła na szczycie okna — bez tego banery nad edytorem
    // (np. „Zacznij od wgrania rzutu…", widoczny dopóki nie ma podkładu) potrafią
    // zepchnąć płótno tak nisko, że kliknięcia z dużym `oy` lądują POZA widocznym
    // viewportem i po prostu nic nie trafiają.
    await wrap.evaluate((e) => {
      e.scrollIntoView({ block: "start" });
      e.scrollTo(0, 0);
    });
    const b = (await wrap.boundingBox())!;
    const oy = b.y < 0 ? -b.y + 50 : 300;

    await page.mouse.click(b.x + 400, b.y + oy);
    await page.mouse.click(b.x + 600, b.y + oy);
    await expect(page.getByText("Rysowanie ściany: 2 pkt.")).toBeVisible();

    await page.keyboard.press("Control+z");
    await expect(page.getByText("Rysowanie ściany: 1 pkt.")).toBeVisible();
  });
});

test("zakładka panelu podąża za wybranym narzędziem", async ({ page }) => {
  await pustyProjekt(page);
  await zacznijRysowacRecznie(page);

  // Kolor aktywnej zakładki (`#2D5A8C` — niebieski akcent) jest ustawiany inline
  // przez `style`, więc sprawdzamy go wprost, a nie po samej obecności elementu.
  const NIEBIESKI = /rgb\(45,\s*90,\s*140\)/;

  // Realna, DOSTĘPNOŚCIOWA nazwa przycisku na pasku narzędzi to treść „Narysuj
  // Pomieszczenie” — „Obrysuj pomieszczenie” jest tylko podpowiedzią (`title`), a osobno
  // istnieje TAKI SAM napis jako CTA listy startowej („Zacznij w 3 krokach”), która i tak
  // już poprawnie przełącza zakładkę (`handleStepAction`, nietknięte tym fixem). Trzeba
  // trafić w przycisk PASKA, żeby test sprawdzał to, co miał sprawdzać.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Pomieszczenia/ })).toHaveCSS("color", NIEBIESKI);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await expect(page.getByRole("button", { name: "Elementy", exact: true })).toHaveCSS("color", NIEBIESKI);
});

test("element da się przeciągnąć w narzędziu „Wstaw element”, bez przełączania na „Zaznacz”", async ({ page }) => {
  await pustyProjekt(page);
  // Bez przyciągania do siatki: postawiony element ląduje DOKŁADNIE pod kursorem,
  // więc test może wrócić w to samo miejsce ekranu, żeby go złapać do przeciągnięcia.
  await page.getByLabel("Przyciągaj do siatki").uncheck();
  await page.getByRole("button", { name: "Wstaw Element" }).click();

  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => e.scrollTo(0, 0));
  let b = (await wrap.boundingBox())!;
  await page.mouse.click(b.x + 300, b.y + 250);

  // Autozapis (600 ms debounce) — stąd czytamy pozycję postawionego elementu.
  await page.waitForTimeout(900);
  const przed = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft?.elements ?? [] : [];
  });
  expect(przed).toHaveLength(1);

  // Postawienie PIERWSZEGO elementu na planie zmienia układ strony (pojawia się
  // pasek nad planem), więc kontener trzeba zmierzyć PONOWNIE — sprzed chwili jest
  // już nieaktualny.
  b = (await wrap.boundingBox())!;
  await page.mouse.move(b.x + 300, b.y + 250);
  await page.mouse.down();
  await page.mouse.move(b.x + 450, b.y + 350, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);

  const po = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft?.elements ?? [] : [];
  });

  // JEDEN element, ten sam, w innym miejscu — nie przybył drugi. Konva po puszczeniu
  // przeciąganego elementu i tak wysyła Stage'owi zdarzenie „click” (drag gasi shape'owi
  // jego WŁASNY click, ale Stage śledzi start/koniec gestu niezależnie); bez wyraźnej
  // straży (`elementDragJustEndedRef` w DesignCanvas) narzędzie „Wstaw element”
  // traktowało to echo jak nowe kliknięcie i stawiało DRUGI element dokładnie tam,
  // gdzie przeciągany właśnie wylądował.
  expect(po).toHaveLength(1);
  expect(po[0].id).toBe(przed[0].id);
  expect(po[0].x).not.toBeCloseTo(przed[0].x, 0);
});

test("kalibracja skali pokazuje potwierdzenie na górze, przy planie", async ({ page }) => {
  await pustyProjekt(page);
  await zacznijRysowacRecznie(page);
  await page.getByRole("button", { name: "Kalibracja skali" }).click();

  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => e.scrollTo(0, 0));
  const b = (await wrap.boundingBox())!;
  const oy = b.y < 0 ? -b.y + 50 : 300;
  await page.mouse.click(b.x + 400, b.y + oy);
  await page.mouse.click(b.x + 600, b.y + oy);
  await page.getByLabel("Długość odcinka w metrach").fill("4");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();

  // Wcześniej wynik kalibracji był widoczny WYŁĄCZNIE w drobnym pasku stanu pod
  // całym płótnem — kto właśnie podał wymiar, patrzy w górę, nie w dół strony.
  await expect(page.getByText(/Skala ustawiona: 1 jedn\. = /)).toBeVisible();
});

test("nazwa projektu ma czytelną wagę typograficzną", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  const nazwa = page.getByTitle("Zmień nazwę projektu");
  await expect(nazwa).toHaveCSS("font-weight", "600");
});
