import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Udostępnianie linkiem tylko do odczytu (F14 z audytu 5.11.2026).
 *
 * Supabase Storage jest tu PODSTAWIONY (`page.route`): test sprawdza, co aplikacja
 * wysyła i jak pokazuje odpowiedź, a nie konfigurację prawdziwego koszyka — tę
 * opisuje krok 5 w `src/lib/supabase.ts`.
 */

const UID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const ID = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

/** Najmniejszy poprawny PDF z jedną stroną — z policzonymi przesunięciami xref. */
function malyPdf(): Buffer {
  const obiekty = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>",
    "<< /Length 30 >>\nstream\n0 0 1 rg 20 20 100 60 re f\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const przes: number[] = [];
  obiekty.forEach((o, i) => {
    przes.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${obiekty.length + 1}\n0000000000 65535 f \n`;
  for (const p of przes) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${obiekty.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const kluczeProjektu = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("pomocnikelektryka_projekt")));

test("strona udostępnienia pokazuje dokument tylko do odczytu i nie rusza projektów w przeglądarce", async ({ page }) => {
  await page.route(`**/storage/v1/object/public/udostepnienia/${UID}/${ID}.pdf`, (r) =>
    r.fulfill({ status: 200, contentType: "application/pdf", body: malyPdf() })
  );
  await page.goto(`/udostepnione/${UID}/${ID}`);
  const podglad = page.getByTestId("podglad-udostepnienia");
  await expect(podglad).toHaveAttribute("data-stan", "gotowe", { timeout: 20000 });
  await expect(podglad.locator("canvas[data-strona]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Pobierz PDF/ })).toBeVisible();
  // żadnych zakładek edytora i żadnego projektu zapisanego przy okazji
  await expect(page.getByRole("button", { name: "Instalacja", exact: true })).toHaveCount(0);
  expect(await kluczeProjektu(page)).toEqual([]);
});

test("wyłączony link mówi wprost, że dokumentu już nie ma", async ({ page }) => {
  await page.route("**/storage/v1/object/public/udostepnienia/**", (r) =>
    r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "not_found", message: "Object not found" }) })
  );
  await page.goto(`/udostepnione/${UID}/${ID}`);
  await expect(page.getByText("Tego dokumentu już tu nie ma.")).toBeVisible({ timeout: 20000 });
});

test("zalogowany: komplet dokumentacji → „Udostępnij linkiem” wgrywa PDF i daje link do podglądu", async ({ page }) => {
  const wgrane: { url: string; typ: string | null; rozmiar: number }[] = [];
  // Chmura projektu (autozapis z podstawioną sesją) — cisza zamiast prawdziwych 401.
  await page.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/storage/v1/object/udostepnienia/**", (r) => {
    wgrane.push({ url: r.request().url(), typ: r.request().headers()["content-type"] ?? null, rozmiar: r.request().postDataBuffer()?.length ?? 0 });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "x" }) });
  });
  await page.route("**/storage/v1/object/list/udostepnienia", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wgrane.map((w) => ({ name: w.url.split("/").pop(), created_at: "2026-11-07T12:00:00Z" }))) })
  );

  await page.goto("/");
  await page.evaluate(
    ([uid]) => {
      localStorage.clear();
      localStorage.setItem(
        "pomocnikelektryka_sesja",
        JSON.stringify({ token: "fake-token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, user: { id: uid, email: "elektryk@example.com" } })
      );
    },
    [UID] as const
  );
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.waitForTimeout(1500);
  const rz = page.getByRole("button", { name: "Rozumiem" });
  if (await rz.count()) await rz.click();

  await page.getByRole("button", { name: "Dokumentacja" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Złóż dokumentację" }).click();
  const udostepnij = page.getByRole("button", { name: /Udostępnij linkiem/ });
  await expect(udostepnij).toBeEnabled({ timeout: 60000 });
  await udostepnij.click();

  const link = page.getByRole("textbox", { name: "Link do udostępnionej dokumentacji" });
  await expect(link).toHaveValue(new RegExp(`/udostepnione/${UID}/[0-9a-f-]{36}$`));
  expect(wgrane).toHaveLength(1);
  expect(wgrane[0].url).toMatch(new RegExp(`/storage/v1/object/udostepnienia/${UID}/[0-9a-f-]{36}\\.pdf$`));
  expect(wgrane[0].typ).toBe("application/pdf");
  expect(wgrane[0].rozmiar).toBeGreaterThan(10000);
  // link jest na liście aktywnych — z możliwością wyłączenia
  await expect(page.getByText(/Aktywne linki \(1\)/)).toBeVisible();
});
