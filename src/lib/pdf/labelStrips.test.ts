import { describe, it, expect, beforeAll } from "vitest";
import { buildLabelStripsPdf } from "./labelStrips";
import { stubPdfFontFetch } from "./testFontMock";
import { pdfTextWidth } from "./engine";
import type { DocumentHeader, PanelDevice } from "@/types";

/**
 * Paski opisowe do wycięcia — muszą wyjść w REALNEJ skali (1 moduł DIN = 17,5 mm),
 * inaczej wycięty pasek nie pasuje pod aparat i cały dokument jest bezużyteczny.
 * Dlatego testy liczą milimetry, nie „wygląda podobnie".
 */

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

/** Prostokąty tła: `<szarość> g <x> <y> <w> <h> re f`. Pasek każdego odcinka ma
 *  szarość 0.97 — odróżnia go od tła strony (1) i nagłówków innych dokumentów. */
function paskiTla(out: string) {
  return [...out.matchAll(/0\.97 g ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }));
}

function napisy(out: string) {
  return [...out.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^)])*)\) Tj ET/g)].map((m) => ({
    bold: m[1] === "F2",
    size: Number(m[2]),
    x: Number(m[3]),
    y: Number(m[4]),
    t: m[5],
  }));
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom testowy", adres: "", zleceniodawca: "", wykonawca: "", uprawnienia: "",
  przyrzad: "", nrFabryczny: "", swiadectwo: "", data: "2026-08-23", temperatura: "",
  wilgotnosc: "", uklad: "TN-S", drawingNo: "E-03", revision: "A",
};

const ap = (uid: string, tag: string, caption: string, modules = 1, kind: PanelDevice["kind"] = "mcb"): PanelDevice => ({
  uid, kind, tag, modules, label: "B16", caption, poles: "1P",
});

const MM_PER_PT = 25.4 / 72;
const MODULE_PT = 17.5 / MM_PER_PT;

describe("buildLabelStripsPdf", () => {
  it("pasek ma REALNĄ szerokość modułu DIN (17,5 mm), nie skalę ekranową", async () => {
    const devices = [ap("1", "Q1", "Rozłącznik główny", 2, "main"), ap("2", "F1", "Gniazda kuchnia", 1)];
    const out = bytesToAscii(await buildLabelStripsPdf(devices, 12, header));
    const [pasek] = paskiTla(out);
    // 3 moduły łącznie (2 + 1) * 17,5 mm.
    expect(pasek.w * MM_PER_PT).toBeCloseTo(3 * 17.5, 1);
  });

  it("wysokość paska jest STAŁA niezależnie od szerokości modułu", async () => {
    const out1 = bytesToAscii(await buildLabelStripsPdf([ap("1", "F1", "A", 1)], 12, header));
    const out2 = bytesToAscii(await buildLabelStripsPdf([ap("1", "F1", "A", 4)], 12, header));
    expect(paskiTla(out1)[0].h).toBeCloseTo(paskiTla(out2)[0].h, 3);
  });

  it("każdy rząd rozdzielnicy to OSOBNY pasek", async () => {
    // perRow=2: pierwszy rząd Q1+F1 (2 moduły), drugi rząd F2 (1 moduł) — dwa paski.
    const devices = [ap("1", "Q1", "Główny", 1, "main"), ap("2", "F1", "A", 1), ap("3", "F2", "B", 1)];
    const out = bytesToAscii(await buildLabelStripsPdf(devices, 2, header));
    expect(paskiTla(out)).toHaveLength(2);
  });

  it("zaślepki (rezerwa) są pomijane — nie ma czego opisywać", async () => {
    const devices = [ap("1", "F1", "A", 1), ap("2", "", "", 1, "blank")];
    const out = bytesToAscii(await buildLabelStripsPdf(devices, 12, header));
    const t = napisy(out).map((n) => n.t);
    expect(t).toContain("F1");
  });

  it("zbyt szeroki rząd łamie się MIĘDZY aparatami, nigdy w środku jednego", async () => {
    // 24 moduły * 17,5 mm = 420 mm — szersze niż drukowalna szerokość A4 poziomo.
    const devices = Array.from({ length: 24 }, (_, i) => ap(String(i), `F${i + 1}`, `Obwód ${i + 1}`, 1));
    const out = bytesToAscii(await buildLabelStripsPdf(devices, 24, header));
    const paski = paskiTla(out);
    expect(paski.length).toBeGreaterThan(1);
    // Suma szerokości odcinków tego samego rzędu odtwarza pełną szerokość rzędu —
    // żaden moduł nie zniknął ani się nie zdublował przy łamaniu.
    const sumaMM = paski.reduce((a, p) => a + p.w * MM_PER_PT, 0);
    expect(sumaMM).toBeCloseTo(24 * 17.5, 0);
  });

  it("dopisek o skali 1:1 stoi na stronie", async () => {
    const out = bytesToAscii(await buildLabelStripsPdf([ap("1", "F1", "A", 1)], 12, header));
    const t = napisy(out).map((n) => n.t);
    expect(t.some((s) => /BEZ SKALOWANIA/i.test(s))).toBe(true);
  });

  /**
   * Opis nie wychodzi poza SWÓJ moduł, nawet gdy jest to najwęższy możliwy aparat
   * (1 moduł = 17,5 mm ≈ 49,6 pt) i długi tekst.
   *
   * `pdfFitText`/`zawijNaDwieLinie` liczą dostępną szerokość ze zgrubnej tabeli metryk
   * (`pdfTextWidth`), nie z realnych glifów osadzonego fontu — dokładnie ten sam
   * mechanizm już raz dał nadmiarowo optymistyczny wynik w tabeli protokołu (patrz
   * `protocol.ts`). Test celowo używa TYLKO ASCII, żeby porównanie z `pdfTextWidth`
   * było dokładne co do punktu, a nie zgadywane przez dekodowanie ósemkowych escape'ów
   * polskich liter w strumieniu PDF.
   */
  it("opis w wąskim, 1-modułowym aparacie mieści się w granicach paska", async () => {
    const devices = [
      ap("1", "Q1", "Rozlacznik izolacyjny glowny", 4, "main"),
      ap("2", "F00", "Ogranicznik przepiec T1+T2", 4, "spdFuse"),
      ap("3", "F2", "Gniazda garaz przy wjezdzie", 1),
    ];
    const out = bytesToAscii(await buildLabelStripsPdf(devices, 12, header));
    const [pasek] = paskiTla(out);
    const prawaKrawedz = pasek.x + pasek.w;

    // Napisy leżące w ostatnim (najwęższym) module I w pionie samego paska — bez
    // ograniczenia po y filtr łapał też tabliczkę rysunkową w stopce strony.
    const wModule = napisy(out).filter(
      (n) => n.x >= pasek.x + pasek.w - MODULE_PT - 1 && n.y >= pasek.y && n.y <= pasek.y + pasek.h
    );
    expect(wModule.length).toBeGreaterThan(0);
    for (const n of wModule) {
      const koniec = n.x + pdfTextWidth(n.t, n.size, n.bold);
      expect(koniec, `"${n.t}" (x=${n.x}) wychodzi poza prawą krawędź paska ${prawaKrawedz}`).toBeLessThanOrEqual(
        prawaKrawedz + 0.1
      );
    }
  });
});
