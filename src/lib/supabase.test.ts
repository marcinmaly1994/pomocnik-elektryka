import { describe, it, expect } from "vitest";
import { isSupabaseConfigured, sesjaZOdpowiedzi, wymagaOdswiezenia } from "./supabase";

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
