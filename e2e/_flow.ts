import type { Page } from "@playwright/test";

/**
 * Pomija EKRAN STARTOWY (patrz `showEntryScreen` w DesignTab.tsx), jeśli akurat
 * jest widoczny — świeży projekt pokazuje JEDEN wybór (wgraj rzut / narysuj
 * samodzielnie / pomiń) zamiast od razu edytora. Bezpieczne wywołanie ZAWSZE,
 * niezależnie od tego, czy ekran akurat istnieje: większość testów w tym
 * katalogu nie testuje SAMEGO ekranu startowego (ten ma własne testy w
 * onboarding.spec.ts / plan-upload.spec.ts), tylko zakłada, że edytor jest już
 * dostępny — tak jak zakładała, zanim ekran startowy w ogóle istniał.
 */
export async function skipEntryScreen(page: Page): Promise<void> {
  // `DesignTab` jest `React.lazy()` — zaraz po kliknięciu „Instalacja" komponent
  // (a z nim ekran startowy) może jeszcze nie być zamontowany, więc migawka
  // `count()` bezpośrednio po kliknięciu bywała pusta, mimo że ekran chwilę
  // później i tak się pojawiał. Aktywne `waitFor` zamiast tego — krótkie, bo
  // większość wywołań i tak trafia na PRAWDZIWY brak ekranu (projekt nie jest
  // świeży) i ma się nie ociągać.
  const pomin = page.getByRole("button", { name: "Pomiń — zacznę na pustym planie" });
  try {
    await pomin.waitFor({ state: "visible", timeout: 3000 });
    await pomin.click();
  } catch {
    // ekran startowy się nie pojawił — nic do pominięcia
  }
}

/**
 * Otwiera rozwijane menu paska edytora („Plan" albo „Rysunek").
 *
 * Od kroku 83 pasek edytora mieści się w JEDNYM rzędzie, bo rzeczy ustawiane raz
 * (kondygnacje, podkład, przyciąganie, rozmiar symboli) schowały się pod te dwa
 * menu — patrz `PasekMenu` i komentarz przy `return` w EditorToolbar.tsx. Testy,
 * które sięgają po te kontrolki, muszą więc najpierw menu otworzyć.
 *
 * Bezpieczne do powtórzenia: gdy panel już stoi otwarty, nie klikamy drugi raz
 * (co by go zamknęło).
 */
export async function otworzMenuPaska(page: Page, etykieta: "Plan" | "Rysunek"): Promise<void> {
  const przycisk = page.getByRole("button", { name: etykieta, exact: true });
  if ((await przycisk.getAttribute("aria-expanded")) !== "true") await przycisk.click();
}

/**
 * Zamyka rozwinięty panel paska edytora.
 *
 * Panel leży NAD kolumną narzędzi, więc dopóki stoi otwarty, przechwytuje kliknięcia
 * w bibliotekę elementów. W aplikacji zamyka go kliknięcie obok; w teście, który
 * zaraz sięga po element z listy, trzeba go domknąć jawnie. Escape, bo to ta sama
 * droga, którą ma użytkownik, i nie wymaga trafiania w żaden konkretny piksel.
 */
export async function zamknijMenuPaska(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
}

/**
 * Otwiera w panelu bocznym zakładkę „Elementy" (katalog osprzętu).
 *
 * Od kroku 84 panel na PUSTEJ kondygnacji startuje na „Pomieszczeniach" — osprzętu
 * nie ma tam jeszcze gdzie postawić, więc katalog nie jest tym, co powinno się czytać
 * najpierw (patrz `zakladkaPanelu` w lib/panelBoczny.ts). Testy, które sięgają po
 * element od razu na czystym rzucie, muszą więc katalog otworzyć.
 *
 * Rusza WYŁĄCZNIE zakładkę panelu, nie narzędzie — w odróżnieniu od kliknięcia
 * w „Wstaw Element" w pasku narzędzi, które zmienia jedno i drugie i mogłoby po cichu
 * zmienić sens testu. Bezpieczne do powtórzenia i do wywołania tam, gdzie zakładka
 * już jest otwarta albo gdzie panelu w ogóle nie ma.
 */
export async function otworzKatalogElementow(page: Page): Promise<void> {
  const zakladka = page.getByRole("button", { name: "Elementy", exact: true });
  try {
    await zakladka.waitFor({ state: "visible", timeout: 2000 });
    await zakladka.click();
  } catch {
    // panel zwinięty albo widok bez panelu — nie ma czego otwierać
  }
}

/**
 * Wczytuje gotowy przykład z ekranu startowego: link, a potem karta w oknie wyboru.
 *
 * Osobny pomocnik, bo wejść w przykład chce kilkanaście testów, a droga wejścia jest
 * właściwością UI, nie treścią żadnego z nich — do okna doszło się dopiero wtedy, gdy
 * przykładów zrobiło się więcej niż jeden, i równie dobrze może się jeszcze zmienić.
 */
export async function wczytajPrzyklad(page: Page, id: "mieszkanie" | "dom"): Promise<void> {
  const nazwa = id === "mieszkanie" ? /Mieszkanie 70 m²/ : /Dom 136 m²/;
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.getByRole("button", { name: nazwa }).click();
}
