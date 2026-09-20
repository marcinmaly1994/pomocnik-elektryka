import { describe, it, expect } from "vitest";
import { PRZYKLADY, zbudujPrzyklad } from "./index";
import { polygonAreaM2 } from "@/lib/geometry";
import { scaleOf } from "@/lib/design";

describe("rejestr przykładów", () => {
  it("ma unikalne identyfikatory", () => {
    const id = PRZYKLADY.map((x) => x.id);
    expect(new Set(id).size).toBe(id.length);
  });

  it("każdy wpis ma komplet metadanych do narysowania karty", () => {
    for (const x of PRZYKLADY) {
      expect(x.nazwa.length, x.id).toBeGreaterThan(3);
      expect(x.opis.length, x.id).toBeGreaterThan(20);
      expect(x.fakty.length, x.id).toBe(3);
    }
  });

  it("każdy wpis buduje się do payloadu oznaczonego jako przykład", async () => {
    for (const x of PRZYKLADY) {
      const payload = await zbudujPrzyklad(x.id);
      expect(payload.projektPrzykladowy, x.id).toBe(true);
      expect(payload.draft.elements.length, x.id).toBeGreaterThan(0);
    }
  });

  /**
   * Liczby na karcie są w rejestrze WPISANE RĘCZNIE, żeby okno mogło je pokazać bez
   * pobierania danych przykładu — więc rozjadą się przy pierwszej zmianie rzutu, jeśli
   * nikt tego nie pilnuje. Metraż i liczba pomieszczeń dokładnie, liczba elementów
   * z tolerancją, bo jest podana z tyldą.
   */
  it("liczby na karcie zgadzają się z danymi", async () => {
    for (const x of PRZYKLADY) {
      const payload = await zbudujPrzyklad(x.id);
      const [faktMetraz, faktPokoje, faktElementy] = x.fakty;

      const mpu = scaleOf(payload.scales, payload.activeFloorId)!;
      const metraz = payload.draft.roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
      expect(Number(faktMetraz.replace(/[^\d,]/g, "").replace(",", ".")), x.id).toBeCloseTo(metraz, 0);

      expect(Number(faktPokoje.replace(/\D/g, "")), x.id).toBe(payload.draft.roomShapes.length);

      const deklarowane = Number(faktElementy.replace(/\D/g, ""));
      const naprawde = payload.draft.elements.length;
      expect(Math.abs(deklarowane - naprawde) / naprawde, `${x.id}: karta mówi ${deklarowane}, jest ${naprawde}`).toBeLessThanOrEqual(0.1);
    }
  });
});
