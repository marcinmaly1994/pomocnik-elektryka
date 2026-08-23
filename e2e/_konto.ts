import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Dane konta testowego do testów e2e dotykających chmury.
 *
 * Cała ta warstwa istnieje z jednego powodu: funkcje związane z kontem (zapis,
 * limity, nadpisywanie, odświeżanie sesji) dało się dotąd sprawdzić WYŁĄCZNIE
 * ręcznie, po zalogowaniu. Skończyło się to błędem, który przeszedł do produkcji
 * i został wychwycony dopiero przez użytkownika. Testy logujące się na osobne
 * konto zamykają tę lukę.
 *
 * Bez danych w `.env` testy kontowe SIĘ POMIJAJĄ, a nie wywalają — żeby nowa osoba
 * mogła sklonować repo i uruchomić resztę zestawu bez zakładania czegokolwiek.
 */

/** Czyta `.env` z katalogu projektu. Własny parser zamiast `dotenv`, żeby nie
 *  dokładać zależności dla dwóch zmiennych. */
function odczytajEnv(): Record<string, string> {
  const plik = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(plik)) return {};
  const wynik: Record<string, string> = {};
  for (const linia of fs.readFileSync(plik, "utf8").split(/\r?\n/)) {
    const m = linia.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) wynik[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return wynik;
}

const env = { ...odczytajEnv(), ...process.env } as Record<string, string>;

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? "";
export const KONTO_EMAIL = env.E2E_TEST_EMAIL ?? "";
export const KONTO_HASLO = env.E2E_TEST_PASSWORD ?? "";

/** Czy da się uruchomić testy kontowe. */
export const KONTO_DOSTEPNE = !!(SUPABASE_URL && SUPABASE_ANON_KEY && KONTO_EMAIL && KONTO_HASLO);

export const POWOD_POMINIECIA =
  "Brak danych konta testowego — ustaw E2E_TEST_EMAIL i E2E_TEST_PASSWORD w .env (patrz .env.example).";

/**
 * Prefiks nazw dokumentów zakładanych przez testy. Sprzątanie kasuje WYŁĄCZNIE
 * wpisy z tym prefiksem, żeby test nigdy nie usunął prawdziwej pracy z konta,
 * gdyby ktoś przez pomyłkę wskazał konto używane na co dzień.
 */
export const PREFIKS = "E2E-TEST";

/** Nazwa unikalna w obrębie przebiegu — testy chodzą równolegle. */
export function nazwaTestowa(sufiks: string): string {
  return `${PREFIKS} ${sufiks} ${Date.now().toString(36)}`;
}

/** Loguje się przez interfejs aplikacji — tą samą drogą co użytkownik, więc test
 *  sprawdza też sam formularz, a nie tylko API. */
export async function zaloguj(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Zaloguj się" }).first().click();
  const okno = page.getByRole("dialog");
  await okno.getByLabel("E-mail").fill(KONTO_EMAIL);
  await okno.getByLabel("Hasło").fill(KONTO_HASLO);
  await okno.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  // Po zalogowaniu znika przycisk logowania, a pojawia się menu konta.
  await page.waitForFunction(() => !!localStorage.getItem("pomocnikelektryka_sesja"), null, { timeout: 15000 });
}

/**
 * Ustawia nazwę projektu. Nazwa edytuje się W MIEJSCU, a nie w oknie dialogowym —
 * kliknięcie zamienia napis w pole, a zatwierdza Enter. Przycisk trafiamy przez
 * `title`, bo jego nazwą dostępnościową jest bieżąca nazwa projektu, nie podpowiedź.
 */
export async function ustawNazweProjektu(page: Page, nazwa: string): Promise<void> {
  await page.getByTitle("Zmień nazwę projektu").click();
  const pole = page.getByLabel("Nazwa projektu");
  await pole.fill(nazwa);
  await pole.press("Enter");
  await page.getByTitle("Zmień nazwę projektu").waitFor();
}

/** Token sesji zapisany przez aplikację — do sprzątania przez REST. */
export async function tokenZSesji(page: Page): Promise<{ token: string; userId: string }> {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("pomocnikelektryka_sesja")!);
    return { token: s.token as string, userId: s.user.id as string };
  });
}

/**
 * Kasuje z konta wszystkie dokumenty założone przez testy. Wywoływane PRZED i PO
 * teście: przed — bo poprzedni przebieg mógł zostawić śmieci i zająć miejsca
 * w limicie pięciu; po — żeby nie zostawiać ich następnemu.
 */
export async function posprzataj(request: APIRequestContext, token: string, userId: string): Promise<void> {
  const lista = await request.get(
    `${SUPABASE_URL}/rest/v1/projects?user_id=eq.${userId}&select=id,name`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!lista.ok()) return;
  for (const wpis of (await lista.json()) as { id: string; name: string }[]) {
    if (!wpis.name?.startsWith(PREFIKS)) continue;
    await request.delete(`${SUPABASE_URL}/rest/v1/projects?id=eq.${wpis.id}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
  }
}
