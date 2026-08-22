import { describe, it, expect, beforeAll } from "vitest";
import { buildPanelLegendPdf } from "./panelLegend";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader, PanelDevice } from "@/types";

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
  data: "2026-08-18", temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
  drawingNo: "E-01", revision: "A",
};

const devices: PanelDevice[] = [
  { uid: "1", kind: "main", tag: "Q1", modules: 3, label: "Wyłącznik główny", caption: "Zasilanie", poles: "3P" },
  { uid: "2", kind: "rcd", tag: "F1", modules: 2, label: "RCD 30mA", caption: "Różnicówka obwodów gniazd", poles: "2P" },
  { uid: "3", kind: "mcb", tag: "B16", modules: 1, label: "B16", caption: "Gniazda salon", poles: "1P", cable: "YDYp 3x2,5", rcdTag: "F1" },
];

describe("buildPanelLegendPdf", () => {
  it("produkuje poprawny PDF zawierający tytuł i dane z nagłówka", async () => {
    const bytes = await buildPanelLegendPdf(devices, 1, 6, 12, 12, header);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("LEGENDA ROZDZIELNICY ELEKTRYCZNEJ");
    expect(out).toContain("Dom jednorodzinny");
  });

  it("umieszcza oznaczenia i opisy obwodów każdego aparatu", async () => {
    const bytes = await buildPanelLegendPdf(devices, 1, 6, 12, 12, header);
    const out = bytesToAscii(bytes);
    expect(out).toContain("Q1");
    expect(out).toContain("B16");
    expect(out).toContain("Gniazda salon");
  });

  it("dopisuje informację o obwodzie nadrzędnym RCD w opisie", async () => {
    const bytes = await buildPanelLegendPdf(devices, 1, 6, 12, 12, header);
    const out = bytesToAscii(bytes);
    expect(out).toMatch(/za F1/);
  });

  it("działa poprawnie dla pustej listy aparatów (bez wyjątków)", async () => {
    const bytes = await buildPanelLegendPdf([], 0, 0, 0, 12, header);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
  });

  it("dzieli dużą liczbę aparatów na kolejne strony", async () => {
    const many: PanelDevice[] = Array.from({ length: 60 }, (_, i) => ({
      uid: String(i), kind: "mcb", tag: `B${i}`, modules: 1, label: "B16", caption: `Obwód ${i}`, poles: "1P",
    }));
    const bytes = await buildPanelLegendPdf(many, 5, 60, 60, 12, header);
    const out = bytesToAscii(bytes);
    expect((out.match(/\/Type \/Page /g) || []).length).toBeGreaterThan(1);
    // nawiasy w PDF-owym stringu muszą być escapowane, stąd "\(cd.\)" a nie "(cd.)"
    expect(out).toContain("LEGENDA ROZDZIELNICY \\(cd.\\)");
  });
});
