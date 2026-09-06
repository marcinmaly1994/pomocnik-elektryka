import { describe, it, expect } from "vitest";
import { komunikatZapisu } from "@/lib/zapisLokalny";

/**
 * Wskaznik zapisu lokalnego. Cala tresc tego testu sprowadza sie do jednego zdania:
 * nieudany zapis MUSI wygrac z godzina ostatniego udanego. Wczesniej wyjatek
 * z `localStorage` byl polykany, wiec wskaznik zamieral na starej godzinie —
 * zielony, z ptaszkiem, twierdzac, ze projekt jest zapisany.
 */
describe("komunikatZapisu", () => {
  const godzina = new Date("2026-09-06T10:42:00").getTime();

  it("bez zapisu i bez bledu nie pokazuje niczego", () => {
    expect(komunikatZapisu(null, null)).toBeNull();
  });

  it("udany zapis pokazuje godzine, na zielono", () => {
    const s = komunikatZapisu(null, godzina)!;
    expect(s.ostrzezenie).toBe(false);
    expect(s.tekst).toMatch(/10:42/);
  });

  it("brak zapisu wygrywa z godzina ostatniego udanego", () => {
    const s = komunikatZapisu("brak", godzina)!;
    expect(s.ostrzezenie).toBe(true);
    expect(s.tekst).not.toMatch(/10:42/);
    expect(s.tekst).toMatch(/NIE ZAPISANO/);
  });

  it("zapis bez podkladu tez jest ostrzezeniem, ale mowi, ze rysunek ocalal", () => {
    const s = komunikatZapisu("bezPodkladu", godzina)!;
    expect(s.ostrzezenie).toBe(true);
    expect(s.tekst).toMatch(/bez podk/i);
    expect(s.tytul).toMatch(/Rysunek si. zapisa/i);
  });

  /** Komunikat ma prowadzic do wyjscia, a nie tylko oznajmiac klopot. */
  it("kazde ostrzezenie podpowiada, co z tym zrobic", () => {
    (["brak", "bezPodkladu"] as const).forEach((b) => {
      expect(komunikatZapisu(b, godzina)!.tytul).toMatch(/koncie|pliku|podk/i);
    });
  });

  it("wersja krotka miesci sie w pasku stanu", () => {
    (["brak", "bezPodkladu", null] as const).forEach((b) => {
      const s = komunikatZapisu(b, godzina)!;
      expect(s.krotki.length).toBeLessThanOrEqual(14);
    });
  });
});
