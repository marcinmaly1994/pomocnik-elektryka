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
