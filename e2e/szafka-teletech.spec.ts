import { test, expect, type Page } from "@playwright/test";

/**
 * Szafka teletechniczna — punkt zbiorczy niskopradowki.
 *
 * Bez niej LAN mierzyl sie od rozdzielnicy, co bylo ZALOZENIEM: router i patchpanel
 * stoja czesto gdzie indziej niz tablica z bezpiecznikami. Przy gwiezdzie ta pomylka
 * mnozy sie przez liczbe punktow.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await expect(wrap).toBeVisible({ timeout: 15000 });
  return (await wrap.boundingBox())!;
}

async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number, ostatni = false) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  const poz = page.getByRole("button", { name: nazwa });
  await (ostatni ? poz.last() : poz.first()).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(250);
}

async function metryLan(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  const pole = page.getByRole("spinbutton", { name: /Ilość: Przewód UTP/ });
  await expect(pole).toBeVisible({ timeout: 15000 });
  return parseFloat((await pole.getAttribute("placeholder")) ?? "");
}

async function nowyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

test("szafka teletechniczna przejmuje rolę punktu zbiorczego LAN", async ({ page }) => {
  await nowyProjekt(page);
  // Rozdzielnica w jednym rogu, gniazda RJ45 w przeciwnym.
  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 60, true);
  await postaw(page, "rj45", /Gniazdo RJ45/, 500, 330);
  await postaw(page, "rj45", /Gniazdo RJ45/, 540, 330);

  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByText(/Mierzone od.*rozdzielnicy/)).toBeVisible({ timeout: 15000 });
  const odRozdzielnicy = await metryLan(page);

  // Szafka tuz przy gniazdach — metraz musi zmalec, a kosztorys powiedziec, skad liczy.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await postaw(page, "szafka", /Szafka teletechniczna/, 520, 300);

  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByText(/Mierzone od szafki teletechnicznej/)).toBeVisible({ timeout: 15000 });
  expect(await metryLan(page)).toBeLessThan(odRozdzielnicy);
});

test("szafka nie liczy sie jako punkt instalacyjny w robociznie", async ({ page }) => {
  await nowyProjekt(page);
  await postaw(page, "rj45", /Gniazdo RJ45/, 300, 200);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  const robocizna = page.getByRole("spinbutton", { name: /Ilość: Robocizna/ });
  const przed = parseFloat((await robocizna.getAttribute("placeholder")) ?? "");

  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await postaw(page, "szafka", /Szafka teletechniczna/, 200, 200);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  // Szafka to obudowa, nie punkt — tak samo jak rozdzielnica i puszka rozgalezna.
  expect(parseFloat((await robocizna.getAttribute("placeholder")) ?? "")).toBe(przed);
});
