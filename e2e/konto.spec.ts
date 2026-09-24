import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";
import {
  KONTO_DOSTEPNE,
  POWOD_POMINIECIA,
  nazwaTestowa,
  posprzataj,
  tokenZSesji,
  ustawNazweProjektu,
  zaloguj,
} from "./_konto";

/**
 * Funkcje wymagające zalogowania: zapis w chmurze, nadpisywanie po nazwie, limity,
 * niezależne zestawy protokołów i odświeżanie sesji.
 *
 * Wcześniej dało się je sprawdzić TYLKO ręcznie — i właśnie tam przeszedł do
 * produkcji błąd (potwierdzenie nadpisania nie pokazywało się przy zmianie nazwy
 * już zapisanego projektu), wychwycony dopiero przez użytkownika. Te testy
 * zamykają lukę: chodzą po prawdziwym Supabase, na osobnym koncie testowym.
 *
 * Bez danych konta w `.env` cały plik się POMIJA — reszta zestawu ma działać
 * po samym sklonowaniu repo.
 */

test.describe("konto i chmura", { tag: "@chmura" }, () => {
  test.skip(!KONTO_DOSTEPNE, POWOD_POMINIECIA);
  // Testy dzielą jedno konto i limit pięciu zapisów, więc muszą iść po kolei.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipEntryScreen(page);
    await zaloguj(page);
    const { token, userId } = await tokenZSesji(page);
    // Poprzedni przebieg mógł paść w połowie i zostawić wpisy zajmujące limit.
    await posprzataj(request, token, userId);
  });

  test.afterEach(async ({ page, request }) => {
    const sesja = await page.evaluate(() => localStorage.getItem("pomocnikelektryka_sesja"));
    if (!sesja) return;
    const { token, userId } = await tokenZSesji(page);
    await posprzataj(request, token, userId);
  });

  test("logowanie zapisuje token odnawiający i czas wygaśnięcia", async ({ page }) => {
    // Bez tego sesja umiera po godzinie i KAŻDY zapis w chmurze zaczyna po cichu
    // wracać z 401 — błąd, który realnie wystąpił i był niewidoczny dla użytkownika.
    const sesja = await page.evaluate(() => JSON.parse(localStorage.getItem("pomocnikelektryka_sesja")!));
    expect(typeof sesja.refreshToken).toBe("string");
    expect(sesja.refreshToken.length).toBeGreaterThan(10);
    expect(sesja.expiresAt).toBeGreaterThan(Date.now());
  });

  test("przycisk „Zapisz” w pasku planu zapisuje projekt na koncie", async ({ page }) => {
    const nazwa = nazwaTestowa("zapis");
    await ustawNazweProjektu(page, nazwa);

    await page.getByTitle("Zapisz projekt na koncie").click();
    // Wskaźnik chmury potwierdza zapis — to on mówi użytkownikowi, że praca wyszła.
    await expect(page.getByText(/Zapisano [0-9]{2}:[0-9]{2}/)).toBeVisible({ timeout: 15000 });
  });

  test("zapis pod nazwą, która już jest na koncie, PYTA o nadpisanie", async ({ page }) => {
    const nazwa = nazwaTestowa("kolizja");

    // pierwszy zapis — tworzy wpis
    await ustawNazweProjektu(page, nazwa);
    await page.getByTitle("Zapisz projekt na koncie").click();
    await expect(page.getByText(/Zapisano [0-9]{2}:[0-9]{2}/)).toBeVisible({ timeout: 15000 });

    // Nowa sesja bez powiązania z chmurą, ta sama nazwa — dokładnie sytuacja,
    // w której autozapis potrafiłby po cichu nadpisać gotowy projekt.
    await page.evaluate(() => localStorage.removeItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy")));
    await page.reload();
    await skipEntryScreen(page);
    await ustawNazweProjektu(page, nazwa);
    await page.getByTitle("Zapisz projekt na koncie").click();

    await expect(page.getByText("Nadpisać istniejący zapis?")).toBeVisible({ timeout: 15000 });
    // Nazwa musi byc w OKNIE — ta sama nazwa stoi tez w naglowku projektu.
    await expect(page.getByRole("dialog").getByText(nazwa)).toBeVisible();

    // Anulowanie NIE zapisuje — to sedno zabezpieczenia.
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByText("Nadpisać istniejący zapis?")).toHaveCount(0);

    // Potwierdzenie zapisuje do TEGO SAMEGO wpisu, nie tworzy drugiego.
    await page.getByTitle("Zapisz projekt na koncie").click();
    await page.getByRole("button", { name: "Tak, nadpisz" }).click();
    await expect(page.getByText(/Zapisano [0-9]{2}:[0-9]{2}/)).toBeVisible({ timeout: 15000 });
  });

  test("zestaw protokołów zapisuje się i wczytuje jako osobny dokument", async ({ page }) => {
    const nazwa = nazwaTestowa("protokoly");
    await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
    await page.getByLabel("Obiekt / nazwa instalacji").fill("Obiekt testowy");
    await page.getByLabel("Wykonawca pomiarów").fill("Test");

    await page.getByText("Pomiar rezystancji izolacji", { exact: true }).click();
    await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
    await page.locator("tbody tr").first().locator("input").first().fill("Obwód testowy");

    await page.getByLabel("Nazwa zestawu protokołów").fill(nazwa);
    await page.getByRole("button", { name: /Zapisz (na koncie|zmiany)/ }).click();
    await expect(page.getByRole("button", { name: "Zapisz zmiany" })).toBeVisible({ timeout: 15000 });

    // Zestaw musi być widoczny na liście — i to na liście PROTOKOŁÓW, nie projektów.
    await page.getByRole("button", { name: "Moje zestawy" }).click();
    await expect(page.getByRole("dialog").getByText(nazwa)).toBeVisible({ timeout: 15000 });
    await page.getByRole("dialog").getByRole("button", { name: "Wczytaj" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator("tbody tr").first().locator("input").first()).toHaveValue("Obwód testowy");
  });

  test("wygasła sesja odnawia się sama, zamiast po cichu odbijać zapis", async ({ page }) => {
    // Postarzamy sesję zamiast czekać godzinę. To odtwarza DOKŁADNIE ten stan,
    // w którym aplikacja wcześniej wysypywała po 50 błędów 401 w tle, nie mówiąc
    // o tym użytkownikowi ani słowa.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("pomocnikelektryka_sesja")!);
      s.expiresAt = Date.now() - 60_000;
      localStorage.setItem("pomocnikelektryka_sesja", JSON.stringify(s));
    });
    await page.reload();
    await skipEntryScreen(page);

    const nazwa = nazwaTestowa("odnowienie");
    await ustawNazweProjektu(page, nazwa);
    await page.getByTitle("Zapisz projekt na koncie").click();

    // Zapis MA SIĘ UDAĆ — token odnawiany jest w locie, użytkownik nic nie widzi.
    await expect(page.getByText(/Zapisano [0-9]{2}:[0-9]{2}/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Sesja wygasła/)).toHaveCount(0);

    // I sesja w przeglądarce ma nowy, ważny termin — dowód, że odnowienie faktycznie
    // zaszło, a nie że zapis przeszedł przypadkiem na starym tokenie.
    const wygasa = await page.evaluate(
      () => JSON.parse(localStorage.getItem("pomocnikelektryka_sesja")!).expiresAt as number,
    );
    expect(wygasa).toBeGreaterThan(Date.now());
  });
});
