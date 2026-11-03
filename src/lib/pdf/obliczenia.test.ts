import { describe, it, expect, beforeAll } from "vitest";
import { buildCalcSheetPdf, komorkiObliczen, STRONA, SZEROKOSCI, SZEROKOSC_TABELI, WCIECIE_PRAWE } from "./obliczenia";
import { pdfFitText } from "./engine";
import { stubPdfFontFetch } from "./testFontMock";
import type { SizedCircuit } from "@/lib/panel/sizing";
import type { DocumentHeader } from "@/types";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // osadzony font w bajtach jest za duży na jedno wywołanie fromCharCode(...bytes)
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom jednorodzinny", adres: "ul. Testowa 1", zleceniodawca: "", wykonawca: "Jan Kowalski",
  uprawnienia: "", przyrzad: "", nrFabryczny: "", swiadectwo: "",
  data: "2026-09-06", temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
  drawingNo: "E-01", revision: "A",
};

function obwod(over: Partial<SizedCircuit> = {}): SizedCircuit {
  return {
    id: "c1",
    nazwa: "Obwód gniazd salon",
    typ: "gniazda",
    liczba_faz: "1",
    faza: "L1",
    Ib_A: 6.5,
    przekroj_mm2: 2.5,
    kabel: "YDYp 3x2,5 mm²",
    aparat: { charakterystyka: "B", In_A: 16, bieguny: "1P" },
    Iz_A: 20,
    wspolczynniki: { k1_temperatura: 1, k2_grupowanie: 1 },
    spadek_napiecia_pct: 1.8,
    spadek_napiecia_limit_pct: 5,
    spadek_wlz_pct: 0,
    spadek_calkowity_pct: 1.8,
    Ia_A: 80,
    Zs_max_Ohm: 2.88,
    rcd_typ: "A",
    status: "ok",
    ostrzezenia: [],
    ...over,
  };
}

describe("komorkiObliczen", () => {
  it("podaje komplet wielkości doboru w kolejności kolumn tabeli", () => {
    expect(komorkiObliczen(obwod(), 12.4)).toEqual([
      "Obwód gniazd salon",
      "L1",
      "6,5 A",
      "2,5 mm²",
      "YDYp 3x2,5 mm²",
      "B16 1P",
      "20 A",
      "12,4 m",
      "1,8% / 5%",
      "2,88 Ω",
      "typ A",
    ]);
  });

  /**
   * Sedno całego dokumentu: ΔU bez długości trasy jest liczbą do wierzenia. Czytelnik
   * ma odtworzyć spadek z przekroju, prądu i długości — jeśli brakuje którejkolwiek
   * z nich, karta obliczeń niczego nie dokumentuje.
   */
  it("niesie długość trasy, której tabela na ekranie nie pokazuje", () => {
    expect(komorkiObliczen(obwod(), 12.4)[7]).toBe("12,4 m");
  });

  it("limit spadku idzie obok wartości, bo zmienia się z rodzajem obwodu", () => {
    const oswietlenie = obwod({ typ: "oswietlenie", spadek_napiecia_pct: 2.4, spadek_napiecia_limit_pct: 3 });
    expect(komorkiObliczen(oswietlenie, 20)[8]).toBe("2,4% / 3%");
  });

  /** „—" znaczy „nie policzono", nigdy „zero": obwód bez skali kondygnacji nie ma
   *  zmierzonej trasy, a 0 m byłoby nieprawdą o instalacji. */
  it("brak zmierzonej trasy daje kreskę zamiast zera — razem z pustym spadkiem", () => {
    const komorki = komorkiObliczen(obwod({ spadek_napiecia_pct: null }), undefined);
    expect(komorki[7]).toBe("—");
    expect(komorki[8]).toBe("—");
  });

  it("obwód trójfazowy pokazuje 3F zamiast pojedynczej fazy", () => {
    expect(komorkiObliczen(obwod({ liczba_faz: "3", faza: "L2" }), 8)[1]).toBe("3F");
  });

  /** Wydruk bywa czarno-biały, więc tło wiersza z ekranu (czerwień/pomarańcz) znika
   *  bez śladu — status musi być widoczny w samym tekście. */
  it("obwód ze statusem innym niż ok jest oznaczony w tekście, nie kolorem", () => {
    expect(komorkiObliczen(obwod({ status: "error" }), 5)[0]).toBe("(!) Obwód gniazd salon");
    expect(komorkiObliczen(obwod({ status: "warn" }), 5)[0]).toBe("(!) Obwód gniazd salon");
    expect(komorkiObliczen(obwod(), 5)[0]).toBe("Obwód gniazd salon");
  });

  it("liczby idą z polskim przecinkiem, nie z kropką", () => {
    const komorki = komorkiObliczen(obwod(), 12.4);
    expect(komorki.join(" ")).not.toMatch(/\d\.\d/);
  });
});

describe("buildCalcSheetPdf", () => {
  const dlugosci = new Map([["c1", 12.4]]);

  it("produkuje PDF z tytułem dokumentu i danymi z metryczki", async () => {
    const bytes = await buildCalcSheetPdf([obwod()], dlugosci, header);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("KARTA OBLICZE"); // polskie znaki idą przez osadzony font
    expect(out).toContain("Dom jednorodzinny");
  });

  /** A4 poziomo — jedenaście kolumn nie mieści się na szerokości strony pionowej. */
  it("jest w orientacji poziomej", async () => {
    const out = bytesToAscii(await buildCalcSheetPdf([obwod()], dlugosci, header));
    expect(out).toContain("/MediaBox [0 0 841.89 595.28]");
  });

  it("wypisuje wielkości doboru każdego obwodu", async () => {
    const out = bytesToAscii(await buildCalcSheetPdf([obwod()], dlugosci, header));
    expect(out).toContain("B16 1P");
    expect(out).toContain("12,4 m");
  });

  /**
   * Uwagi pod tabelą i wykrzyknik w wierszu to jedna rzecz w dwóch miejscach: sam
   * wykrzyknik nie mówi, co jest nie tak, a sama lista nie prowadzi wzroku do wiersza.
   */
  it("przenosi ostrzeżenia doboru pod tabelę razem z nazwą obwodu", async () => {
    const zBledem = obwod({
      status: "error",
      ostrzezenia: [{ code: "spadek_przekroczony", level: "error", message: "Spadek napiecia przekracza limit" }],
    });
    const out = bytesToAscii(await buildCalcSheetPdf([zBledem], dlugosci, header));
    expect(out).toContain("UWAGI DO DOBORU");
    expect(out).toContain("Spadek napiecia przekracza limit");
    expect(out).toContain("Obw"); // nazwa obwodu w prefiksie uwagi
  });

  it("bez ostrzeżeń nie drukuje pustej sekcji uwag", async () => {
    const out = bytesToAscii(await buildCalcSheetPdf([obwod()], dlugosci, header));
    expect(out).not.toContain("UWAGI DO DOBORU");
  });

  /** Dokument idzie do klienta i do odbioru — zastrzeżenie o uprawnieniach musi być
   *  na kartce, nie tylko na ekranie, z którego kartka powstała. */
  it("niesie to samo zastrzeżenie, co tabela na ekranie", async () => {
    const out = bytesToAscii(await buildCalcSheetPdf([obwod()], dlugosci, header));
    expect(out).toContain("uprawnieniami");
    expect(out).toContain("pomiary powykonawcze");
  });

  it("wiele obwodów rozkłada się na kolejne strony z powtórzoną główką", async () => {
    const duzo = Array.from({ length: 60 }, (_, i) => obwod({ id: `c${i}`, nazwa: `Obwód ${i}` }));
    const out = bytesToAscii(await buildCalcSheetPdf(duzo, new Map(), header));
    expect((out.match(/\/Type \/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
    // Główka tabeli raz na stronę. Nawiasy z „(cd.)" są w strumieniu escapowane
    // (`pdfEscape`), więc szukamy po wersalikach tytułu, których stopka nie powtarza.
    expect((out.match(/KARTA OBLICZE/g) ?? []).length).toBeGreaterThan(1);
  });
});

/**
 * Geometria tabeli. Kolizja etykiety z liczbą w kosztorysie wyszła dopiero na
 * wyrenderowanej kartce (patrz `KOL_KWOTY` w costs.ts) — tu ta sama klasa błędu
 * jest zamknięta liczbowo, zanim ktokolwiek otworzy podgląd.
 */
describe("szerokości kolumn", () => {
  it("tabela mieści się na stronie razem z marginesami", () => {
    expect(SZEROKOSC_TABELI).toBeLessThanOrEqual(STRONA.w - 2 * STRONA.margines);
  });

  /**
   * Prąd obliczeniowy z dwoma miejscami po przecinku („10,68 A" — ładowarka EV w projekcie
   * przykładowym) ginął jako „10,68..": kolumna Ib miała 42 pt, a test sprawdzał tylko
   * „27,4 A", czyli o jeden znak mniej.
   */
  it("Ib z dwoma miejscami po przecinku i trzema cyframi nie jest ucinane", () => {
    for (const ib of [10.68, 27.43, 104.55]) {
      const tekst = komorkiObliczen(obwod({ Ib_A: ib }), 12)[2];
      expect(pdfFitText(tekst, SZEROKOSCI[2] - WCIECIE_PRAWE, 8.5, false), `Ib = ${ib}`).toBe(tekst);
    }
  });

  it("najdłuższe realne wartości nie są ucinane przez pdfFitText", () => {
    const najdluzszy = obwod({
      nazwa: "Obwód gniazd kuchnia i jadalnia",
      Ib_A: 27.4,
      przekroj_mm2: 10,
      kabel: "YDYp 5x10 mm²",
      aparat: { charakterystyka: "C", In_A: 32, bieguny: "3P" },
      liczba_faz: "3",
      Iz_A: 44.5,
      spadek_napiecia_pct: 4.75,
      Zs_max_Ohm: 1.44,
    });
    // Nazwa obwodu bywa dowolnie długa i JEST przycinana świadomie — reszta kolumn
    // niesie wielkości fizyczne, których obcięcie zmienia treść dokumentu.
    komorkiObliczen(najdluzszy, 128.6)
      .slice(1)
      .forEach((tekst, i) => {
        expect(pdfFitText(tekst, SZEROKOSCI[i + 1] - WCIECIE_PRAWE, 8.5, false)).toBe(tekst);
      });
  });
});
