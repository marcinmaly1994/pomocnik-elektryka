import { describe, it, expect, beforeAll } from "vitest";
import { buildCostsPdf, formatujKwote, KOL_KWOTY } from "./costs";
import { pdfTextWidth } from "./engine";
import { kosztorysRows } from "@/lib/costs";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader } from "@/types";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // osadzony font jest za duzy na jedno fromCharCode(...bytes)
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

const rows = kosztorysRows({ gniazdko: 12, robocizna: 30 }, { gniazdko: 15, robocizna: 0 });

describe("formatujKwote", () => {
  /** Kwota za kilkanascie tysiecy bez separatora czyta sie jak numer telefonu. */
  it("grupuje tysiace i uzywa przecinka dziesietnego", () => {
    expect(formatujKwote(1234.5)).toBe("1 234,50");
    expect(formatujKwote(999)).toBe("999,00");
    expect(formatujKwote(1234567.891)).toBe("1 234 567,89");
  });

  it("zero i wartosci ujemne tez maja sens", () => {
    expect(formatujKwote(0)).toBe("0,00");
    expect(formatujKwote(-42.5)).toBe("-42,50");
  });
});

describe("buildCostsPdf", () => {
  it("sklada poprawny PDF z tytulem i danymi z metryki", async () => {
    const out = bytesToAscii(await buildCostsPdf(rows, header));
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("KOSZTORYS INSTALACJI ELEKTRYCZNEJ");
    expect(out).toContain("Dom jednorodzinny");
  });

  it("wypisuje pozycje razem z ich wartoscia", async () => {
    const out = bytesToAscii(await buildCostsPdf(rows, header));
    expect(out).toContain("Gniazdko 230V podtynkowe");
    expect(out).toContain("180,00"); // 12 x 15 zl
  });

  it("drukuje wybraną stawkę VAT i liczy od niej kwotę", async () => {
    const out = bytesToAscii(await buildCostsPdf(rows, header, 8));
    expect(out).toContain("VAT 8%");
    expect(out).not.toContain("VAT 23%");
    expect(out).toContain("14,40"); // 8% od 180 zl
    expect(out).toContain("194,40"); // brutto
  });

  it("podsumowuje netto, VAT i brutto", async () => {
    const out = bytesToAscii(await buildCostsPdf(rows, header));
    expect(out).toContain("Razem netto");
    expect(out).toContain("VAT 23%");
    expect(out).toContain("RAZEM brutto");
    expect(out).toContain("41,40"); // VAT od 180 zl
    expect(out).toContain("221,40"); // brutto
  });

  /** Bez tego odbiorca mnozy ilosc przez cene, nie dostaje wartosci z tabeli i traci
   *  zaufanie do calego dokumentu. */
  it("oznacza gwiazdka pozycje wycenione ryczaltem i tlumaczy ja pod tabela", async () => {
    const zRyczaltem = kosztorysRows({ gniazdko: 12, robocizna: 30 }, { gniazdko: 15, robocizna: 0 }, { robocizna: 4500 });
    const out = bytesToAscii(await buildCostsPdf(zRyczaltem, header));
    // Nawiasy w stringu PDF są escapowane, stąd `String.raw` z backslashami.
    expect(out).toContain(String.raw`Robocizna za punkt instalacyjny \(szt., opcjonalnie\) *`);
    expect(out).toMatch(/podana rycza/);
    expect(out).toContain("4 500,00");
  });

  it("bez pozycji ryczaltowych nie dokłada objasnienia gwiazdki", async () => {
    const out = bytesToAscii(await buildCostsPdf(rows, header));
    expect(out).not.toMatch(/podana rycza/);
  });

  it("pusty kosztorys nie wywraca dokumentu", async () => {
    const out = bytesToAscii(await buildCostsPdf([], header));
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("RAZEM brutto");
  });

  it("dluga lista pozycji przechodzi na kolejne strony z naglowkiem (cd.)", async () => {
    const duzo = Array.from({ length: 60 }, (_, i) => ({
      key: `k${i}`, label: `Pozycja numer ${i}`, qty: i + 1, qtyOverridden: false, price: 10, value: (i + 1) * 10, overridden: false,
    }));
    const out = bytesToAscii(await buildCostsPdf(duzo, header));
    expect((out.match(/\/Type \/Page /g) || []).length).toBeGreaterThan(1);
    expect(out).toContain(String.raw`KOSZTORYS \(cd.\)`);
  });
});

describe("podsumowanie nie zlewa sie z kwota", () => {
  /**
   * Bug znaleziony dopiero na wyrenderowanej kartce, nie w testach: etykieta
   * "RAZEM brutto" (11 pt, pogrubiona) zaczynala sie w STALYM punkcie i dorastala do
   * prawej kwoty — na podgladzie wychodzilo "RAZEM brutto581,79 zl".
   *
   * Teraz oba napisy sa wyrownane DO PRAWEJ do wlasnych kotwic, wiec kolizja jest
   * mozliwa juz tylko wtedy, gdy sama kwota nie miesci sie w swojej rubryce.
   */
  it("rubryka kwoty miesci sumy z realnego zakresu", () => {
    for (const kwota of [0, 581.79, 14500, 999999.99]) {
      const napis = `${formatujKwote(kwota)} zł`;
      expect(pdfTextWidth(napis, 11, true)).toBeLessThan(KOL_KWOTY);
    }
  });
});
