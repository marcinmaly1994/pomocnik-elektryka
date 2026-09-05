import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Sprawdzenie rzutu (`checkPlan`) — warstwa, której nie widać z testu jednostkowego:
 * czy karta faktycznie liczy się z DANYCH BIEŻĄCEJ KONDYGNACJI, czy odświeża się po
 * każdej zmianie planu i czy „Pokaż na planie" naprawdę zaznacza właściwy element.
 *
 * Same reguły mają komplet testów w `src/lib/planCheck.test.ts` — tutaj chodzi
 * o spięcie ich z edytorem.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

/** Świeży projekt narysowany od zera — daje STANDARDOWĄ skalę (1 kratka = 1 m), bez
 *  której reguły metryczne (strefy) są celowo pomijane. */
async function pustyProjektZeSkala(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/**
 * Stawia element, wybierając go przez SZUKAJKĘ biblioteki.
 *
 * Biblioteka jest akordeonem: otwarta jest tylko sekcja z aktualnie wybranym typem,
 * więc „Wanna" (Wyposażenie sanitarne) po prostu nie istnieje w DOM, dopóki ktoś tej
 * sekcji nie rozwinie. Wpisanie frazy otwiera wszystkie pasujące sekcje naraz — to ta
 * sama droga, którą idzie użytkownik szukający elementu, którego nie widzi na liście.
 */
async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

/**
 * Przenosi element w miejsce docelowe PRZECIĄGNIĘCIEM, zamiast stawiać go od razu
 * tam, gdzie ma stać.
 *
 * Wymusza to model stref: strefa 1 to OBRYS wanny (patrz `SANITARY_FIXTURES`), więc
 * z definicji leży pod jej symbolem. Każde kliknięcie w strefę 1 trafia w wannę —
 * w trybie „Wstaw element" zaczyna jej przeciąganie, a nie stawia nowego elementu.
 * Upuszczenie w to miejsce jest niezależne od tego, co leży pod spodem, więc działa.
 */
async function przeciagnij(page: Page, zX: number, zY: number, doX: number, doY: number) {
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + zX, box.y + zY);
  await page.mouse.down();
  await page.mouse.move(box.x + doX, box.y + doY, { steps: 8 });
  await page.mouse.up();
}

/** Obrysowuje prostokątne pomieszczenie. Płótno mierzymy DOPIERO po przełączeniu
 *  narzędzia — wejście w tryb „Pomieszczenie" dokłada do panelu wybór kształtu
 *  (ten sam powód co w light-groups.spec.ts). */
async function narysujPomieszczenie(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
}

const karta = (page: Page) => page.locator("div.pe-card", { hasText: "Sprawdzenie rzutu" });

/** Karta zwija się sama, gdy nie ma błędów ani ostrzeżeń — wtedy w nagłówku zostaje
 *  samo podsumowanie, a treść spostrzeżeń nie istnieje w DOM. Testy sprawdzające
 *  „czysty" stan muszą ją najpierw rozwinąć, tak jak zrobiłby to użytkownik. */
async function rozwinKarte(page: Page) {
  await karta(page).getByRole("button", { name: /Sprawdzenie rzutu/ }).click();
}

test("gniazdo wsunięte w strefę 1 to BŁĄD, a odsunięcie go gasi zgłoszenie", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 500, 380);

  // Gniazdo stoi na razie kilka metrów od wanny — nic do zgłoszenia.
  await expect(karta(page)).not.toContainText("Osprzęt w strefie 1");

  // Wsunięcie go pod wannę: 5 px ekranowych przy skali 1 kratka = 1 m to ok. 0,3 m,
  // czyli w środku strefy 1 (0,65 m).
  await przeciagnij(page, 500, 380, 205, 205);

  await expect(karta(page)).toContainText("Osprzęt w strefie 1");
  await expect(karta(page)).toContainText("PN-HD 60364-7-701");
  // Nagłówek podsumowuje stan bez rozwijania listy.
  await expect(karta(page)).toContainText("1 błąd");

  // …i odsunięcie musi je zgasić: karta liczy się na bieżąco z planu, a nie raz
  // przy wejściu w zakładkę.
  await przeciagnij(page, 205, 205, 600, 420);
  await expect(karta(page)).not.toContainText("Osprzęt w strefie 1");
});

test("„Pokaż na planie” zaznacza zgłoszony element i przełącza na narzędzie zaznaczania", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 500, 380);
  await przeciagnij(page, 500, 380, 205, 205);
  await expect(karta(page)).toContainText("Osprzęt w strefie 1");

  // Wracamy do „Wstaw Element", żeby było widać, że to KARTA przełącza narzędzie.
  // Bez tego klik w plan po skoku ze spostrzeżenia postawiłby kolejne gniazdko
  // zamiast poprawić to zgłoszone.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await expect(page.getByRole("button", { name: "Wstaw Element" })).toHaveAttribute("aria-pressed", "true");

  await karta(page).getByRole("button", { name: /Pokaż na planie \(1\)/ }).click();

  await expect(page.getByRole("button", { name: "Zaznacz", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Pigułka kontrolek pokazuje liczbę zaznaczonych — to jedyny dowód zaznaczenia
  // widoczny w DOM (sam plan jest rysowany na canvasie).
  await expect(page.getByRole("button", { name: /Usuń zaznaczone \(1\)/ })).toBeVisible();
});

test("czysty rzut kończy się potwierdzeniem zamiast pustej karty", async ({ page }) => {
  await pustyProjektZeSkala(page);

  // Komplet, do którego żadna reguła nie ma się jak przyczepić: obrysowane
  // pomieszczenie (inaczej „Elementy poza obrysem"), w nim oprawa i łącznik
  // (inaczej „bez punktu świetlnego" / „bez łącznika"), bez wyposażenia sanitarnego.
  await narysujPomieszczenie(page, 120, 120, 460, 380);
  await postaw(page, "sufit", /Punkt sufitowy/, 250, 250);
  await postaw(page, "jednobieg", /Łącznik jednobiegunowy/, 320, 250);

  await expect(karta(page)).toContainText("bez zastrzeżeń");
  await rozwinKarte(page);
  await expect(karta(page)).toContainText("Nie wykryto problemów");
});

test("bez skali reguły metryczne są pomijane, a karta mówi o tym wprost", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page); // pominięcie ekranu startowego NIE ustawia skali

  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 500, 380);
  // Gniazdo ląduje DOKŁADNIE tam, gdzie przy ustawionej skali byłby błąd — dowód, że
  // reguła jest pomijana świadomie, a nie że po prostu nie ma jej co zgłosić.
  await przeciagnij(page, 500, 380, 205, 205);

  await expect(karta(page)).toContainText("Strefy ochronne niesprawdzone");
  await expect(karta(page)).not.toContainText("Osprzęt w strefie 1");
});

test("sprawdzenie dotyczy BIEŻĄCEJ kondygnacji, nie całego projektu", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 500, 380);
  await przeciagnij(page, 500, 380, 205, 205);
  await expect(karta(page)).toContainText("Osprzęt w strefie 1");

  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  // Nowe piętro jest puste — błąd z parteru nie ma prawa się na nie przenieść.
  await expect(karta(page)).not.toContainText("Osprzęt w strefie 1");
  await rozwinKarte(page);
  await expect(karta(page)).toContainText("Na tej kondygnacji nic jeszcze nie ma");
});
