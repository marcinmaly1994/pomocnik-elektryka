import { test, expect, type Page } from "@playwright/test";

/**
 * Opisy skrótów w tabeli „Dobór obwodów wg PN-HD 60364".
 *
 * Dotąd był to natywny `title` postawiony na CAŁEJ komórce nagłówka. Dwa skutki:
 * dymek wyskakiwał przy najechaniu daleko od słowa (komórka jest znacznie szersza
 * niż „Ib"), a na telefonie nie dawało się go otworzyć w ogóle — `title` nie reaguje
 * ani na kliknięcie, ani na dotyk. A to jedyne miejsce w aplikacji, gdzie wyjaśnione
 * są Ib, Iz i Zs max.
 */

const OPIS_IB = /Prąd obliczeniowy/;

async function rozdzielnicaPrzykladu(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dobór obwodów wg PN-HD 60364" })).toBeVisible();
}

/** Sam napis „Ib" w nagłówku tabeli — to on, a nie komórka, ma być celem. */
function napisIb(page: Page) {
  return page.getByRole("button", { name: "Ib", exact: true });
}

test("najechanie na napis pokazuje opis", async ({ page }) => {
  await rozdzielnicaPrzykladu(page);
  await napisIb(page).hover();
  await expect(page.getByText(OPIS_IB)).toBeVisible();
});

/** To jest zgłoszony błąd: komórka nagłówka jest szeroka, a opis wyskakiwał
 *  z dowolnego jej miejsca — także daleko od dwuliterowego napisu. */
test("najechanie na komórkę Z DALA od napisu nie pokazuje opisu", async ({ page }) => {
  await rozdzielnicaPrzykladu(page);

  const komorka = page.locator("th", { hasText: /^Ib$/ });
  const kNapis = (await napisIb(page).boundingBox())!;
  const kKomorka = (await komorka.boundingBox())!;

  // Punkt w tej samej komórce, ale poza napisem — w prawym marginesie kolumny.
  const x = kKomorka.x + kKomorka.width - 2;
  const y = kKomorka.y + kKomorka.height / 2;
  expect(x).toBeGreaterThan(kNapis.x + kNapis.width);

  await page.mouse.move(x, y);
  await page.waitForTimeout(700);
  await expect(page.getByText(OPIS_IB)).toBeHidden();
});

/** Na telefonie nie ma najeżdżania — bez kliknięcia te opisy byłyby nieosiągalne. */
test("kliknięcie w napis otwiera opis i zostawia go otwartym", async ({ page }) => {
  await rozdzielnicaPrzykladu(page);

  await napisIb(page).click();
  await expect(page.getByText(OPIS_IB)).toBeVisible();

  // Odjechanie myszą nie zamyka przypiętego opisu — inaczej kliknięcie nie dawałoby
  // nic ponad to, co i tak robi najechanie.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await expect(page.getByText(OPIS_IB)).toBeVisible();

  // Drugie kliknięcie ODPINA. Sprawdzamy to PO odjechaniu myszą, bo samo kliknięcie
  // zostawia kursor na napisie — a wtedy dymek i tak należy się z najechania.
  // Oczekiwanie „znika natychmiast po kliknięciu" przeczyłoby naturze podpowiedzi.
  await napisIb(page).click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await expect(page.getByText(OPIS_IB)).toBeHidden();
});

/** Liczby w tej tabeli po polsku — resztka po PR #96, gdzie kolumny ΔU i Zs max
 *  wstawiały liczbę surowo, bez `toFixed`, więc strażnik notacji ich nie widział. */
test("kolumny ΔU i Zs max podają liczby z przecinkiem", async ({ page }) => {
  await rozdzielnicaPrzykladu(page);

  const wiersze = await page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent!.trim())
    )
  );
  const zLiczbami = wiersze.filter((k) => k.length >= 9);
  expect(zLiczbami.length).toBeGreaterThan(0);

  for (const kolumny of zLiczbami) {
    for (const idx of [6, 7]) {
      expect(kolumny[idx], `kolumna ${idx}`).not.toMatch(/\d\.\d/);
    }
  }
});
