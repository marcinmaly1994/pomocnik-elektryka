import { describe, expect, it } from "vitest";
import { zbudujProjektDom } from "@/lib/demo/dom";
import type { InstallationElement } from "@/types";
import { doCp1250, nazwaBloku, rzutDoDxf, rzutDoDxfTekst, WARSTWY, type DaneRzutuDxf } from "./dxf";

/** Pary (kod, wartość) z tekstu DXF. */
function pary(tekst: string): [number, string][] {
  const w = tekst.split("\r\n");
  if (w[w.length - 1] === "") w.pop();
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < w.length; i += 2) out.push([Number(w[i]), w[i + 1]]);
  return out;
}

function daneDomu(): DaneRzutuDxf {
  const p = zbudujProjektDom();
  const f = "f1";
  const elements = p.draft.elements.filter((e) => e.floor === f);
  return {
    walls: p.draft.walls.filter((w) => w.floor === f),
    roomShapes: p.draft.roomShapes.filter((r) => r.floor === f),
    openings: p.draft.openings.filter((o) => o.floor === f),
    elements,
    trasy: [{ id: "t", circuitId: "c", circuitName: "Gniazda", kind: "power", type: "gniazdko", cable: "YDYp 3×2,5", breaker: "B16", room: "Salon", color: "#000", floor: f, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], lengthUnits: 40, viaWalls: true } as unknown as DaneRzutuDxf["trasy"][number]],
    przewody: [{ id: "w", floor: f, od: elements[0].id, do: elements[1].id, rodzaj: "sterowanie", kabel: "YDYp 3×1,5" }],
    notatki: [{ id: "n", floor: f, x: 10, y: 10, tekst: "Puszka pod blatem\n105 cm" }],
    mpu: 0.05,
    skalaSymboli: 0.5,
  };
}

describe("eksport rzutu do DXF", () => {
  const d = daneDomu();
  const tekst = rzutDoDxfTekst(d);
  const p = pary(tekst);

  it("jest kompletnym plikiem R12: nagłówek, tabele, bloki, encje, EOF", () => {
    expect(tekst.split("\r\n").filter(Boolean).length % 2).toBe(0);
    const sekcje = p.filter(([k], i) => k === 2 && p[i - 1]?.[1] === "SECTION").map(([, v]) => v);
    expect(sekcje).toEqual(["HEADER", "TABLES", "BLOCKS", "ENTITIES"]);
    expect(p.filter(([k, v]) => k === 0 && v === "SECTION").length).toBe(p.filter(([k, v]) => k === 0 && v === "ENDSEC").length);
    expect(p[p.length - 1]).toEqual([0, "EOF"]);
    expect(tekst).toContain("AC1009");
  });

  it("w metrach, z polską stroną kodową", () => {
    const i = p.findIndex(([k, v]) => k === 9 && v === "$INSUNITS");
    expect(p[i + 1]).toEqual([70, "6"]);
    expect(tekst).toContain("ANSI_1250");
  });

  it("każda encja leży na zadeklarowanej warstwie", () => {
    const warstwy = new Set([...Object.keys(WARSTWY), "0"]);
    for (const [k, v] of p) if (k === 8) expect(warstwy.has(v), v).toBe(true);
  });

  it("każda polilinia jest domknięta SEQEND, a każdy blok — ENDBLK", () => {
    const poly = p.filter(([k, v]) => k === 0 && v === "POLYLINE").length;
    expect(poly).toBeGreaterThan(0);
    expect(p.filter(([k, v]) => k === 0 && v === "SEQEND").length).toBe(poly);
    expect(p.filter(([k, v]) => k === 0 && v === "BLOCK").length).toBe(p.filter(([k, v]) => k === 0 && v === "ENDBLK").length);
  });

  it("każde wstawienie wskazuje zdefiniowany blok — po jednym na typ osprzętu", () => {
    const bloki = new Set(p.filter(([k], i) => k === 2 && p[i - 2]?.[1] === "BLOCK").map(([, v]) => v));
    const wstawienia = p.filter(([k], i) => k === 2 && p[i - 2]?.[1] === "INSERT").map(([, v]) => v);
    // przybory sanitarne idą jako obrys w prawdziwych wymiarach, nie jako blok
    const symbole = d.elements.filter((e) => !["wanna", "prysznic", "umywalka"].includes(e.type));
    expect(wstawienia).toHaveLength(symbole.length);
    for (const w of wstawienia) expect(bloki.has(w), w).toBe(true);
    expect(bloki.size).toBe(new Set(symbole.map((e) => e.type)).size);
  });

  it("każda warstwa ma treść: ściany, pomieszczenia z nazwami, otwory, osprzęt, trasy, przewody, notatki", () => {
    const naWarstwie = (w: string) => p.filter(([k, v]) => k === 8 && v === w).length;
    for (const w of Object.keys(WARSTWY)) expect(naWarstwie(w), w).toBeGreaterThan(0);
    expect(p.some(([k, v]) => k === 1 && v === "Salon")).toBe(true);
    expect(p.some(([k, v]) => k === 1 && v === "105 cm")).toBe(true);
  });

  it("współrzędne w metrach z osią Y w górę, obrót osprzętu odwrócony", () => {
    const el: InstallationElement = { ...d.elements[0], x: 100, y: 40, rotation: 90 };
    const t = pary(rzutDoDxfTekst({ ...d, walls: [], roomShapes: [], openings: [], trasy: [], przewody: [], notatki: [], elements: [el] }));
    const i = t.findIndex(([k, v]) => k === 0 && v === "INSERT");
    const pole = (kod: number) => t.slice(i).find(([k]) => k === kod)![1];
    expect(pole(2)).toBe(nazwaBloku(el.type));
    expect(Number(pole(10))).toBeCloseTo(5);
    expect(Number(pole(20))).toBeCloseTo(-2);
    expect(Number(pole(50))).toBe(-90);
    expect(Number(pole(41))).toBeCloseTo(0.025);
  });

  it("wanna to prostokąt w prawdziwych wymiarach, nie symbol", () => {
    const wanna: InstallationElement = { ...d.elements[0], type: "wanna", x: 100, y: 100, rotation: 0 };
    const t = pary(rzutDoDxfTekst({ ...d, walls: [], roomShapes: [], openings: [], trasy: [], przewody: [], notatki: [], elements: [wanna] }));
    expect(t.some(([k, v]) => k === 0 && v === "INSERT")).toBe(false);
    const xs = t.filter(([k], i) => k === 10 && t[i - 2]?.[1] === "VERTEX").map(([, v]) => Number(v));
    const ys = t.filter(([k], i) => k === 20 && t[i - 3]?.[1] === "VERTEX").map(([, v]) => Number(v));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.7);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.75);
  });

  it("polskie znaki w Windows-1250, reszta spoza strony jako „?”", () => {
    expect([...doCp1250("Łazienka ż×")]).toEqual([0xa3, 0x61, 0x7a, 0x69, 0x65, 0x6e, 0x6b, 0x61, 0x20, 0xbf, 0xd7]);
    expect([...doCp1250("Δ")]).toEqual([0x3f]);
    const bajty = rzutDoDxf(d);
    expect(bajty.every((b) => b < 256)).toBe(true);
    expect(bajty.length).toBe(tekst.length);
  });
});
