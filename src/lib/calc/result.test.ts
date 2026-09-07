import { describe, expect, it } from "vitest";
import {
  bladWyniku,
  formatLiczba,
  OCENA_GRANICZNA_PCT,
  ocenPodLimitem,
  type CalcError,
} from "./result";

/**
 * Silnik WERDYKTOW — te dwie funkcje decyduja o „spelniony / graniczny /
 * niespelniony" w kazdym kalkulatorze inzynierskim w aplikacji. Dotad nie mialy
 * ANI JEDNEGO wlasnego testu: byly sprawdzane wylacznie ubocznie, przez testy
 * kalkulatorow, ktore trafialy w srodek przedzialow i nigdy w granice.
 *
 * A granice sa tu cala trescia: „dokladnie na limicie" ma znaczyc co innego niz
 * „z zapasem", a dane, ktorych nie da sie porownac, nie moga dawac zielonego
 * ptaszka.
 */

const OPIS = { co: "Spadek napiecia", jednostka: "%" };

describe("ocenPodLimitem", () => {
  it("wartosc z duzym zapasem jest SPELNIONA, a margines liczy sie od limitu", () => {
    const o = ocenPodLimitem(2, 5, OPIS);
    expect(o.verdict).toBe("spelniony");
    expect(o.margines_pct).toBeCloseTo(60, 9); // (5-2)/5
    expect(o.komunikat).toContain("zapas");
  });

  /**
   * Dokladnie na limicie to NIE jest „spelniony". Dane wejsciowe instalacji
   * (dlugosc trasy, temperatura, cosφ) same sa przyblizeniem, wiec zerowy zapas
   * nie znaczy, ze warunek przejdzie w rzeczywistosci.
   */
  it("dokladnie na limicie jest GRANICZNA, z zerowym marginesem", () => {
    const o = ocenPodLimitem(5, 5, OPIS);
    expect(o.verdict).toBe("graniczny");
    expect(o.margines_pct).toBe(0);
  });

  it("prog miedzy granicznym a spelnionym lezy dokladnie na OCENA_GRANICZNA_PCT", () => {
    // margines = 10% dokladnie → juz SPELNIONY (prog jest domkniety od gory)
    expect(ocenPodLimitem(90, 100, OPIS).margines_pct).toBeCloseTo(OCENA_GRANICZNA_PCT, 9);
    expect(ocenPodLimitem(90, 100, OPIS).verdict).toBe("spelniony");
    // wlos ponizej progu → jeszcze GRANICZNY
    expect(ocenPodLimitem(90.01, 100, OPIS).verdict).toBe("graniczny");
  });

  it("przekroczenie limitu daje werdykt NIESPELNIONY i UJEMNY margines", () => {
    const o = ocenPodLimitem(6, 5, OPIS);
    expect(o.verdict).toBe("niespelniony");
    expect(o.margines_pct).toBeCloseTo(-20, 9); // (5-6)/5
    expect(o.komunikat).toContain("przekracza");
    // Komunikat podaje O ILE — sama informacja „za duzo" nie mowi, ile poprawic.
    expect(o.komunikat).toContain("1,00");
  });

  it("liczby w komunikacie sa po polsku, z przecinkiem", () => {
    expect(ocenPodLimitem(2.5, 5, OPIS).komunikat).toContain("2,50");
    expect(ocenPodLimitem(2.5, 5, OPIS).komunikat).not.toContain("2.50");
  });

  /**
   * Regresja: `NaN` przechodzil przez OBA porownania (`NaN > x` i `NaN < x` sa
   * falszywe) i wypadal z funkcji jako „warunek SPELNIONY" z marginesem `NaN` —
   * czyli zielony pasek nad wynikiem, ktorego nikt nie policzyl.
   */
  it("wartosc nieskonczona albo NaN daje BRAK OCENY, nie zielony werdykt", () => {
    for (const zla of [NaN, Infinity, -Infinity]) {
      const o = ocenPodLimitem(zla, 5, OPIS);
      expect(o.verdict, String(zla)).toBe("nieoceniany");
      expect(o.margines_pct, String(zla)).toBeNull();
    }
  });

  /** Limit zerowy albo ujemny to nie „warunek zerowej tolerancji", tylko brak limitu. */
  it("limit niedodatni daje BRAK OCENY zamiast pewnego siebie zera", () => {
    for (const zly of [0, -1, NaN]) {
      const o = ocenPodLimitem(2, zly, OPIS);
      expect(o.verdict, String(zly)).toBe("nieoceniany");
      expect(o.margines_pct, String(zly)).toBeNull();
    }
  });

  it("komunikat braku oceny nazywa warunek, ktorego dotyczy", () => {
    expect(ocenPodLimitem(2, 0, OPIS).komunikat).toContain("Spadek napiecia");
  });
});

describe("bladWyniku", () => {
  const bledy: CalcError[] = [{ code: "PRAD", pole: "prad_A", message: "Podaj prad." }];

  it("wynik z bledem NIE niesie ani wartosci, ani oceny — nie ma czego pokazac obok komunikatu", () => {
    const r = bladWyniku(bledy);
    expect(r.wartosci).toBeNull();
    expect(r.ocena).toBeNull();
    expect(r.kroki).toEqual([]);
    expect(r.zrodla).toEqual([]);
    expect(r.bledy).toBe(bledy);
  });

  /** Zalozenia PRZEZYWAJA blad: czesto to wlasnie one tlumacza, dlaczego dane nie przeszly. */
  it("zalozenia przekazane obok bledow zostaja", () => {
    expect(bladWyniku(bledy, ["Metoda uproszczona"]).zalozenia).toEqual(["Metoda uproszczona"]);
    expect(bladWyniku(bledy).zalozenia).toEqual([]);
  });
});

describe("formatLiczba", () => {
  it("przecinek dziesietny i zadana precyzja", () => {
    expect(formatLiczba(3.14159, 2)).toBe("3,14");
    expect(formatLiczba(2, 0)).toBe("2");
    expect(formatLiczba(0.5, 3)).toBe("0,500");
  });

  it("zaokragla, a nie ucina", () => {
    expect(formatLiczba(2.999, 2)).toBe("3,00");
  });

  /** Bez tego w PDF-ie i na ekranie ladowaloby „NaN" jako liczba. */
  it("to, co nie jest liczba skonczona, pokazuje sie jako myslnik", () => {
    expect(formatLiczba(NaN, 2)).toBe("—");
    expect(formatLiczba(Infinity, 2)).toBe("—");
    expect(formatLiczba(-Infinity, 0)).toBe("—");
  });
});
