import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Weryfikuje ścieżkę, której nie dało się sprawdzić przez syntetyczne
 * zdarzenia w podglądzie (Konva na płótnie ignoruje zdarzenia wskaźnika
 * wysłane programowo bez prawdziwego silnika przeglądarki) — Playwright
 * klika naprawdę, więc potwierdza zarówno stawianie elementów z realnymi
 * piktogramami (krok 12 w MIGRATION.md), jak i panel bilansu faz oraz
 * selektywności w Rozdzielnicy (krok 13).
 */
test("stawianie elementów na planie odblokowuje bilans faz i selektywność w rozdzielnicy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  const canvasWrap = page.locator("[data-testid=plan-okno]").first();
  await expect(canvasWrap).toBeVisible();

  const undoButton = page.getByTitle("Cofnij");
  await expect(undoButton).toBeDisabled();

  // domyślnie aktywny typ to "Gniazdo 230 V" — wybieramy go jawnie, żeby przełączyć
  // tryb narzędzia na "elementy" (jak w oryginalnej aplikacji, klik w bibliotekę
  // przełącza tryb), po czym stawiamy 3 gniazdka realnymi kliknięciami.
  //
  // Box trzeba pobierać na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż
  // przedtem (ten sam wzorzec co `zoomAndBox` w room-editing.spec.ts): klik
  // zmieniający narzędzie potrafi doscrollować stronę, a POSTAWIENIE PIERWSZEGO
  // elementu samo w sobie odsłania trwały baner ryzyka nad płótnem („Ten projekt
  // istnieje tylko w tej przeglądarce...", gated na `elements.length > 0`), co
  // przesuwa płótno w dół — box zmierzony wcześniej staje się nieaktualny.
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (const dx of [100, 250, 400]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await canvasWrap.boundingBox();
    if (!box) throw new Error("Nie znaleziono płótna planu");
    await page.mouse.click(box.x + dx, box.y + 80);
  }

  await expect(undoButton).toBeEnabled();

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText("Aparaty (")).toBeVisible();
  await expect(page.getByText("Sprawdzenie selektywności i doboru zabezpieczeń")).toBeVisible();

  // sekcja bilansu faz pokazuje się tylko przy zasilaniu 3-fazowym (domyślne w PanelTab)
  await expect(page.getByText("Bilans obciążenia faz")).toBeVisible();
  await expect(page.getByText("L1", { exact: true }).first()).toBeVisible();
});
