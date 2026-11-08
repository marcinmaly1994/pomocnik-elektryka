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
 * Otwiera katalog osprzętu — czyli wybiera narzędzie „Wstaw Element".
 *
 * Katalog nie ma już własnej zakładki: panel boczny pokazuje wyłącznie opcje
 * WYBRANEGO narzędzia (patrz `NaglowekNarzedzia` w PanelNarzedzia.tsx), a katalog
 * należy do „Wstaw Element". Kliknięcie w pozycję katalogu i tak przełącza na to
 * narzędzie, więc testy, które sięgają po element, niczego tu nie tracą.
 *
 * Bezpieczne do powtórzenia i do wywołania tam, gdzie paska narzędzi nie widać
 * (np. schowany w pełnym ekranie) — wtedy nic nie robi.
 */
export async function otworzKatalogElementow(page: Page): Promise<void> {
  const narzedzie = page.getByRole("button", { name: "Wstaw Element", exact: true });
  try {
    await narzedzie.waitFor({ state: "visible", timeout: 2000 });
    await narzedzie.click();
  } catch {
    // pasek narzędzi schowany — nie ma czego otwierać
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

/**
 * Odsłania lewy panel narzędzi w pełnym ekranie — NAJECHANIEM na krawędź.
 *
 * Uchwyt „Pokaż narzędzia rysowania" ma 24 px szerokości i stoi przy samej krawędzi,
 * a `onMouseMove` wysuwa panel już przy `x <= 24` (`PAS_WYZWALAJACY` w DesignTab.tsx).
 * Playwright, żeby kliknąć, musi najpierw przesunąć mysz na środek uchwytu, czyli
 * mniej więcej na 12 px — i tym samym ruchem wysuwa panel, po czym uchwyt znika
 * z drzewa (`pelnyEkran && !widocznaLewa`). Kliknięcie trafia w pustkę:
 * „element was detached from the DOM, retrying" aż do 30-sekundowego limitu.
 *
 * Na szybkiej maszynie przerysowanie nie zdąży między ruchem a kliknięciem i test
 * przechodzi — dlatego lokalnie nie widać tego nigdy, a w CI wywróciło dwa przebiegi
 * pod rząd, za każdym razem inny test. Niewidoczna loteria.
 *
 * Stąd JEDNO wejście dla wszystkich testów, które panel tylko OTWIERAJĄ po drodze.
 * Testy, których tematem jest samo otwieranie uchwytem, robią to u siebie wprost —
 * i robią to dotknięciem, bo tylko ono odróżnia kliknięcie od najechania.
 */
export async function odslonNarzedziaRysowania(page: Page): Promise<void> {
  const okno = page.viewportSize()!;
  await page.mouse.move(10, okno.height / 2);
  await page.locator('[data-testid="karta-narzedzi"], nav[aria-label="Narzędzia rysowania"]').first().waitFor({ state: "visible" });
}

/**
 * Przejście do narzędzia z nagłówka — na telefonie przez menu, na większym ekranie wprost.
 *
 * Poniżej 768 px Kalkulatory, Protokoły, Dokumentacja, Pomoc i Nowy projekt są
 * w arkuszu „Menu” (redesign PR 3). Testy, które jadą na obu szerokościach, wołają
 * to jedno wejście zamiast sprawdzać szerokość same.
 */
export async function przejdzDoNarzedzia(
  page: Page,
  nazwa: "Kalkulatory" | "Protokoły pomiarowe" | "Dokumentacja" | "Pomoc" | "Nowy projekt"
): Promise<void> {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: nazwa, exact: true }).click();
  } else {
    await page.getByRole("banner").getByRole("button", { name: nazwa, exact: true }).click();
  }
}
