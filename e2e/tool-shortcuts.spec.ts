import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Skróty klawiszowe pasku narzędzi (V/E/P/W/D/H/S — patrz `TOOL_SHORTCUTS` w
 * DesignTab.tsx i `RAIL_TOOLS[].shortcut` w ToolRail.tsx, które muszą się zgadzać).
 * Pasek stracił widoczne podpisy pod ikonami (sama ikona + `aria-label` + tooltip
 * z literą) — te testy pilnują, żeby skrót faktycznie przełączał na to samo
 * narzędzie, które podpowiada tooltip, i żeby nie działał tam, gdzie by przeszkadzał.
 */

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  // Skróty słuchają na `window` od momentu, gdy DesignTab się zamontuje i
  // odpali swój efekt — bez tej chwili pierwszy klawisz po samej nawigacji
  // potrafił polecieć PRZED podpięciem nasłuchu (wyścig, nie błąd skrótu).
  await page.waitForTimeout(300);
}

test("skróty V/E/P/W/D/H/S przełączają narzędzia zgodnie z literą w tooltipie", async ({ page }) => {
  await openPlan(page);

  const cases: { key: string; tool: string }[] = [
    { key: "e", tool: "Wstaw Element" },
    { key: "p", tool: "Narysuj Pomieszczenie" },
    { key: "w", tool: "Narysuj Ścianę" },
    { key: "d", tool: "Drzwi i okna" },
    { key: "h", tool: "Przesuń widok" },
    { key: "s", tool: "Kalibracja skali" },
    { key: "v", tool: "Zaznacz" },
  ];

  for (const { key, tool } of cases) {
    await page.keyboard.press(key);
    await expect(page.getByRole("button", { name: tool, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
});

test("tooltip każdego narzędzia wymienia literę zgodną z faktycznym skrótem", async ({ page }) => {
  await openPlan(page);

  const nav = page.getByRole("navigation", { name: "Narzędzia rysowania" });
  const shortcuts: { tool: string; key: string }[] = [
    { tool: "Zaznacz", key: "v" },
    { tool: "Wstaw Element", key: "e" },
    { tool: "Narysuj Pomieszczenie", key: "p" },
    { tool: "Narysuj Ścianę", key: "w" },
    { tool: "Drzwi i okna", key: "d" },
    { tool: "Przesuń widok", key: "h" },
    { tool: "Kalibracja skali", key: "s" },
  ];

  for (const { tool, key } of shortcuts) {
    const btn = nav.getByRole("button", { name: tool, exact: true });
    await expect(btn).toHaveAttribute("title", new RegExp(`\\(${key.toUpperCase()}\\)$`));
  }
});

test("wpisanie litery skrótu w polu tekstowym NIE przełącza narzędzia", async ({ page }) => {
  await openPlan(page);

  // "Wstaw Element" -> pole wyszukiwania biblioteki elementów przyjmuje tekst
  await page.getByRole("button", { name: "Wstaw Element", exact: true }).click();
  const search = page.getByPlaceholder("Szukaj elementu…");
  await search.click();
  await search.type("ws"); // "w" i "s" to skróty ścian/skali — w polu mają być zwykłymi literami

  await expect(search).toHaveValue("ws");
  // narzędzie zostaje "Wstaw Element" — litery poszły do pola, nie zmieniły trybu
  await expect(page.getByRole("button", { name: "Wstaw Element", exact: true })).toHaveAttribute("aria-pressed", "true");
});
