import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSupabaseConfigured, sesjaZOdpowiedzi, supaDeleteAccount, supaUpdateProject, wymagaOdswiezenia } from "./supabase";

describe("isSupabaseConfigured", () => {
  it("puste wartości -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("", "")).toBe(false);
  });

  it("placeholdery z .env.example -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("https://YOUR-PROJECT.supabase.co", "YOUR-ANON-PUBLIC-KEY")).toBe(false);
  });

  it("adres bez https:// -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("http://example.supabase.co", "realkey123")).toBe(false);
  });

  it("prawdziwe dane -> skonfigurowane", () => {
    expect(isSupabaseConfigured("https://abcdefgh.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(true);
  });
});

describe("wymagaOdswiezenia", () => {
  const TERAZ = 1_700_000_000_000;

  it("sesja bez `expiresAt` (zapisana przed wprowadzeniem odświeżania) wymaga odnowienia", () => {
    // Nie wiemy, ile jej zostało, a najczęściej nie zostało nic — udawanie, że jest
    // ważna, kończyło się cichym 401 przy każdym zapisie.
    expect(wymagaOdswiezenia({}, TERAZ)).toBe(true);
  });

  it("sesja wygasła wymaga odnowienia", () => {
    expect(wymagaOdswiezenia({ expiresAt: TERAZ - 1000 }, TERAZ)).toBe(true);
  });

  it("sesja ważna jeszcze godzinę nie wymaga odnowienia", () => {
    expect(wymagaOdswiezenia({ expiresAt: TERAZ + 3_600_000 }, TERAZ)).toBe(false);
  });

  it("odnawiamy Z WYPRZEDZENIEM — token gasnący za pół minuty i tak wróciłby z 401", () => {
    expect(wymagaOdswiezenia({ expiresAt: TERAZ + 30_000 }, TERAZ)).toBe(true);
  });
});

describe("sesjaZOdpowiedzi", () => {
  it("zabiera token odnawiający i wylicza moment wygaśnięcia", () => {
    const s = sesjaZOdpowiedzi({ access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1" } });
    expect(s.token).toBe("a");
    expect(s.refreshToken).toBe("r");
    expect(s.expiresAt).toBeGreaterThan(Date.now());
  });

  it("brak `expires_in` traktuje jak godzinę — domyślną żywotność tokenu w Supabase", () => {
    const s = sesjaZOdpowiedzi({ access_token: "a", user: { id: "u1" } });
    // z zapasem na czas wykonania testu
    expect(s.expiresAt! - Date.now()).toBeGreaterThan(3_500_000);
  });
});

describe("supaUpdateProject — warunek na updated_at", () => {
  const ZNACZNIK = "2026-09-06T11:22:33.456789+00:00";
  let ostatniUrl = "";

  beforeEach(() => {
    ostatniUrl = "";
    vi.stubGlobal("fetch", (url: string) => {
      ostatniUrl = String(url);
      return Promise.resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("bez oczekiwanego znacznika filtruje po samym id — jak dotad", async () => {
    await supaUpdateProject("t", "abc", { name: "x", updated_at: ZNACZNIK });
    expect(ostatniUrl).toContain("/rest/v1/projects?id=eq.abc");
    expect(ostatniUrl).not.toContain("updated_at=eq.");
  });

  /**
   * Znacznik ma dwukropki i plus. Bez zakodowania PostgREST dostaje uciety filtr,
   * ktory nie trafia w zaden wiersz — czyli KAZDY zapis wygladalby na konflikt.
   */
  it("znacznik trafia do filtra zakodowany", async () => {
    await supaUpdateProject("t", "abc", { name: "x", updated_at: ZNACZNIK }, ZNACZNIK);
    expect(ostatniUrl).toContain(`updated_at=eq.${encodeURIComponent(ZNACZNIK)}`);
    expect(ostatniUrl).toContain("%3A");
    expect(ostatniUrl).toContain("%2B");
  });

  /** Pusta tablica to sygnal konfliktu — wywolujacy musi ja dostac, a nie wyjatek. */
  it("brak trafionego wiersza wraca jako pusta tablica", async () => {
    await expect(supaUpdateProject("t", "abc", { name: "x", updated_at: ZNACZNIK }, ZNACZNIK)).resolves.toEqual([]);
  });
});

describe("supaDeleteAccount", () => {
  let ostatniUrl = "";
  let ostatniaMetoda = "";
  let ostatnieNaglowki: Record<string, string> = {};

  beforeEach(() => {
    ostatniUrl = "";
    ostatniaMetoda = "";
    ostatnieNaglowki = {};
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      ostatniUrl = String(url);
      ostatniaMetoda = init.method ?? "GET";
      ostatnieNaglowki = init.headers as Record<string, string>;
      // Funkcja SQL zwraca `void` — Supabase odpowiada pustym ciałem.
      return Promise.resolve(new Response(null, { status: 204 }));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("woła funkcję `usun_moje_konto` przez RPC", async () => {
    await supaDeleteAccount("token-uzytkownika");
    expect(ostatniUrl).toContain("/rest/v1/rpc/usun_moje_konto");
    expect(ostatniaMetoda).toBe("POST");
  });

  /**
   * Funkcja kasuje konto wyliczone z `auth.uid()`, czyli z TOKENU. Poleciałaby z
   * kluczem `anon` — wtedy `auth.uid()` jest puste i nie skasowałaby niczego, po
   * cichu: użytkownik zobaczyłby „konto usunięte", mając je dalej.
   */
  it("wysyła token sesji, a nie klucz anon", async () => {
    await supaDeleteAccount("token-uzytkownika");
    expect(ostatnieNaglowki.Authorization).toBe("Bearer token-uzytkownika");
  });

  it("błąd z API wraca jako wyjątek", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "permission denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(supaDeleteAccount("t")).rejects.toThrow("permission denied");
  });
});
