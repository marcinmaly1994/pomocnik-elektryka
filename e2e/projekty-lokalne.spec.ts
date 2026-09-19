import { test, expect, type Page } from "@playwright/test";

/**
 * Lista projektów w tej przeglądarce.
 *
 * Do tej pory projekt lokalny był dokładnie jeden i „Nowy projekt" go kasował —
 * uczciwie uprzedzając, co nie zmienia faktu, że przy drugim mieszkaniu pierwsze
 * przepadało. Te testy pilnują odwrotnej obietnicy: że poprzedni projekt ZOSTAJE
 * i da się do niego wrócić.
 *
 * Wszystko bez logowania, bo to właśnie osoby bez konta ta zmiana dotyczy.
 */

const ekranStartowy = (page: Page) =>
  page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" });

async function swiezyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
}

async function otworzListe(page: Page) {
  await page.getByRole("button", { name: "Projekty" }).click();
  await page.getByRole("menuitem", { name: /Moje projekty/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Nadaje bieżącemu projektowi nazwę — to po niej rozpoznajemy go na liście. */
async function nazwijProjekt(page: Page, nazwa: string) {
  await page.getByTitle("Zmień nazwę projektu").click();
  const pole = page.getByRole("textbox").first();
  await pole.fill(nazwa);
  await pole.press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(nazwa) })).toBeVisible();
}

async function nowyProjekt(page: Page) {
  await page.getByRole("button", { name: "Nowy projekt" }).click();
  await page.getByRole("button", { name: /Tak, zacznij od nowa/ }).click();
  await expect(ekranStartowy(page)).toBeVisible();
}

test("„Nowy projekt” odkłada poprzedni na listę, zamiast go kasować", async ({ page }) => {
  await swiezyProjekt(page);
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  await page.getByRole("button", { name: /Zacznij własny projekt/ }).click();
  await page.getByRole("button", { name: /Tak, zacznij własny/ }).click();
  await nazwijProjekt(page, "Mieszkanie Anny");

  await nowyProjekt(page);
  await nazwijProjekt(page, "Dom Barbary");

  await otworzListe(page);
  const okno = page.getByRole("dialog");
  // Oba projekty są na liście — poprzedni NIE zniknął.
  await expect(okno.getByText("Mieszkanie Anny")).toBeVisible();
  await expect(okno.getByText("Dom Barbary")).toBeVisible();
  // I widać, który jest otwarty.
  await expect(okno.getByText("otwarty")).toBeVisible();
});

test("powrót do odłożonego projektu przywraca jego nazwę", async ({ page }) => {
  await swiezyProjekt(page);
  await nazwijProjekt(page, "Mieszkanie Anny");
  await nowyProjekt(page);
  await nazwijProjekt(page, "Dom Barbary");

  await otworzListe(page);
  const okno = page.getByRole("dialog");
  // „Otwórz" stoi tylko przy projektach, które NIE są otwarte — stąd wiersz Anny.
  await okno.getByText("Mieszkanie Anny").locator("../..").getByRole("button", { name: "Otwórz" }).click();

  await expect(page.getByRole("button", { name: /Mieszkanie Anny/ })).toBeVisible();
});

test("projekt przykładowy nie zaśmieca listy", async ({ page }) => {
  await swiezyProjekt(page);
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();

  // Przykład jest z założenia jednorazowy — wyjście z niego ma go nadpisać, a nie
  // odłożyć na listę jako czwarty „projekt", którego nikt nie tworzył.
  await page.getByRole("button", { name: /Zacznij własny projekt/ }).click();
  await page.getByRole("button", { name: /Tak, zacznij własny/ }).click();
  await expect(ekranStartowy(page)).toBeVisible();

  await otworzListe(page);
  await expect(page.getByRole("dialog").getByText("Przykład: mieszkanie 70 m²")).toBeHidden();
});

test("okno projektów działa bez konta i tłumaczy, co daje konto", async ({ page }) => {
  await swiezyProjekt(page);
  await otworzListe(page);

  const okno = page.getByRole("dialog");
  await expect(okno.getByRole("heading", { name: "W tej przeglądarce" })).toBeVisible();
  await expect(okno.getByText(/Załóż konto, żeby mieć projekty także na innych urządzeniach/)).toBeVisible();
});
