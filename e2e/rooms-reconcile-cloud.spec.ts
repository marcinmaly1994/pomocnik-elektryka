import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";
import {
  KONTO_DOSTEPNE,
  POWOD_POMINIECIA,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  nazwaTestowa,
  posprzataj,
  tokenZSesji,
  ustawNazweProjektu,
  zaloguj,
} from "./_konto";

/**
 * Remont przypisań do pomieszczeń (`reconcileRoomsOnLoad`) na ŚCIEŻCE CHMUROWEJ.
 *
 * Lokalny autozapis i projekt z chmury dzielą jedno wejście (`loadProjectPayload`),
 * ale dalej rozchodzą się w rzeczy, których nie widać z testu jednostkowego: chmura
 * ma własny, wolniejszy autozapis i własną migawkę porównawczą, więc to, że poprawka
 * wraca do Supabase, a nie zostaje tylko w pamięci karty, trzeba sprawdzić na
 * prawdziwym backendzie.
 *
 * Konstrukcja testu: projekt zakładamy normalnie, przez UI, a potem PSUJEMY jego
 * wiersz w bazie przez REST — tak wygląda zapis zrobiony wersją aplikacji sprzed
 * poprawki. Dzięki temu ładunek jest autentyczny (zserializowany przez samą
 * aplikację), a różni się dokładnie jednym: przypisaniem elementu do pomieszczenia.
 *
 * Bez danych konta w `.env` plik się POMIJA, jak reszta testów kontowych.
 */

/** Kwadrat 100×100 jedn. w lewym górnym rogu planu, na parterze. */
const KUCHNIA = {
  id: "r-kuchnia",
  floor: "f1",
  name: "Kuchnia",
  color: "#C1793F",
  type: "kuchnia",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};

function gniazdko(id: string, x: number, y: number, room: string) {
  return { id, type: "gniazdko", x, y, room, floor: "f1", dedicated: false, note: "", gangs: 1 };
}

test.describe("remont przypisań do pomieszczeń — projekt z chmury", () => {
  test.skip(!KONTO_DOSTEPNE, POWOD_POMINIECIA);
  // Konto testowe jest jedno i ma limit pięciu zapisów — bez współbieżności.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipEntryScreen(page);
    await zaloguj(page);
    const { token, userId } = await tokenZSesji(page);
    await posprzataj(request, token, userId);
  });

  test.afterEach(async ({ page, request }) => {
    const sesja = await page.evaluate(() => localStorage.getItem("pomocnikelektryka_sesja"));
    if (!sesja) return;
    const { token, userId } = await tokenZSesji(page);
    await posprzataj(request, token, userId);
  });

  test("projekt zapisany starą wersją prostuje się przy wczytaniu i wraca poprawiony do chmury", async ({
    page,
    request,
  }) => {
    const nazwa = nazwaTestowa("remont-pomieszczen");
    const naglowki = { apikey: SUPABASE_ANON_KEY, Authorization: "" };

    // --- 1. Zakładamy projekt normalną drogą, żeby ładunek był autentyczny --------
    await ustawNazweProjektu(page, nazwa);
    await page.getByTitle("Zapisz projekt na koncie").click();
    await expect(page.getByText(/Zapisano [0-9]{2}:[0-9]{2}/)).toBeVisible({ timeout: 15000 });

    const { token, userId } = await tokenZSesji(page);
    naglowki.Authorization = `Bearer ${token}`;

    const lista = await request.get(
      `${SUPABASE_URL}/rest/v1/projects?user_id=eq.${userId}&name=eq.${encodeURIComponent(nazwa)}&select=id,data`,
      { headers: naglowki },
    );
    expect(lista.ok()).toBe(true);
    const [wiersz] = (await lista.json()) as { id: string; data: Record<string, unknown> }[];
    expect(wiersz).toBeTruthy();

    // --- 2. Psujemy wiersz tak, jak wyglądałby zapis sprzed poprawki --------------
    // `zle` stoi w kuchni, ale niesie nazwę pokoju, z którego kiedyś je przeciągnięto.
    // `reczne` leży poza WSZYSTKIMI obrysami i ma nazwę wpisaną ręcznie — kontrola,
    // że remont nie kasuje tego, czemu rysunek nie przeczy.
    const data = wiersz.data as {
      draft: Record<string, unknown>;
      scales: Record<string, number>;
      onboarding: Record<string, boolean>;
    };
    data.scales = { f1: 0.05 };
    data.draft.roomShapes = [KUCHNIA];
    data.draft.elements = [gniazdko("zle", 50, 50, "Salon"), gniazdko("reczne", 900, 600, "Garderoba")];
    // Onboarding domknięty NA WYROST i to jest sedno tego testu, nie ozdoba: świeży
    // projekt ma kroki nieodhaczone, więc samo wczytanie planu ze skalą, pokojem
    // i elementem zapaliłoby je i zmieniło ładunek — a wtedy poprawka trafiłaby do
    // chmury PRZY OKAZJI cudzego zapisu, niezależnie od tego, czy własny mechanizm
    // działa. Projekt „dojrzały" nie zmienia po wczytaniu nic poza samym remontem
    // przypisań, więc wiersz w bazie zaktualizuje się tylko wtedy, gdy remont
    // faktycznie umie się odesłać.
    data.onboarding = {
      krok1Done: true,
      krok2Done: true,
      krok3Done: true,
      pominiety: true,
      ostatnioOtwarty: false,
      skalaNieaktualna: false,
      ekranStartowyPominiety: true,
    };

    const patch = await request.patch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${wiersz.id}`, {
      headers: { ...naglowki, "Content-Type": "application/json", Prefer: "return=minimal" },
      data: { data, updated_at: new Date().toISOString() },
    });
    expect(patch.ok()).toBe(true);

    // --- 3. Wczytujemy go z chmury tak, jak zrobiłby to użytkownik ----------------
    // Lokalny autozapis czyścimy, żeby na pewno patrzeć na dane Z CHMURY, a nie na
    // wersję z tej przeglądarki.
    await page.evaluate(() => localStorage.removeItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy")));
    await page.reload();
    await skipEntryScreen(page);
    // „Moje projekty" siedzi w menu konta pod avatarem — trafiamy je przez `title`,
    // bo nazwą dostępnościową przycisku jest adres e-mail zalogowanego konta.
    await page.getByTitle(/@/).first().click();
    await page.getByRole("menuitem", { name: /Moje projekty/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Wczytaj" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15000 });

    // --- 4. Aplikacja mówi wprost, że poprawiła zapisane dane ---------------------
    // Jeden element, nie dwa: ręcznie nazwana „Garderoba" ma zostać nietknięta.
    await expect(page.getByText(/Poprawiono przypisanie 1 elementu do pomieszczeń/)).toBeVisible({ timeout: 15000 });

    // --- 5. Dane w aplikacji są poprawione ---------------------------------------
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
            if (!raw) return null;
            const el = JSON.parse(raw).draft.elements as { id: string; room: string }[];
            return el.map((e) => `${e.id}:${e.room}`).sort().join(",");
          }),
        { timeout: 15000 },
      )
      .toBe("reczne:Garderoba,zle:Kuchnia");

    // --- 6. …i wracają poprawione do Supabase, a nie zostają w pamięci karty ------
    // Autozapis w chmurze ma 2,5 s debouncingu, stąd pytanie o wiersz w pętli.
    await expect
      .poll(
        async () => {
          const odp = await request.get(`${SUPABASE_URL}/rest/v1/projects?id=eq.${wiersz.id}&select=data`, {
            headers: naglowki,
          });
          if (!odp.ok()) return null;
          const [row] = (await odp.json()) as { data: { draft: { elements: { id: string; room: string }[] } } }[];
          return row?.data.draft.elements.map((e) => `${e.id}:${e.room}`).sort().join(",") ?? null;
        },
        { timeout: 30000, intervals: [1000] },
      )
      .toBe("reczne:Garderoba,zle:Kuchnia");

    // --- 7. Drugie wczytanie już nic nie prostuje --------------------------------
    await page.reload();
    await skipEntryScreen(page);
    await expect(page.getByText(/Poprawiono przypisanie/)).toHaveCount(0);
  });
});
