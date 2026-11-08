import type { CableRoute, ElementType, InstallationElement, NotatkaPlanu, Opening, Point, PrzewodReczny, RoomShape, Wall } from "@/types";
import { DEFAULT_WALL_THICKNESS } from "@/lib/design";
import { ELEMENT_TYPES, fixtureSizeM, SANITARY_FIXTURES } from "@/lib/elements";
import { glyphBoxSize, isSwitchType, SOCKET_GLYPH, switchGlyph } from "@/lib/glyphs";
import { punktWewnatrzWielokata } from "@/lib/geometry";
import { symbolNormowy } from "@/lib/symboleNormowe";

/**
 * Eksport rzutu kondygnacji do DXF (F13 z audytu 5.11.2026) — dla architekta albo
 * wykonawcy, który pracuje w CAD-zie, a nie w tej aplikacji.
 *
 * Format R12 (AC1009): najstarszy, a przez to najszerzej czytany — otwiera go każdy
 * AutoCAD, DraftSight, LibreCAD i darmowe przeglądarki, a nie wymaga uchwytów
 * obiektów ani tabel, bez których nowsze wersje są nieważne.
 *
 * Jednostki: METRY, oś Y w górę (jak w CAD-zie; na ekranie Y rośnie w dół, więc każda
 * współrzędna przechodzi przez `doM`). Każda rzecz ma swoją warstwę, żeby architekt
 * mógł wyłączyć np. trasy jednym kliknięciem.
 */

export const WARSTWY = {
  SCIANY: { kolor: 7 },
  POMIESZCZENIA: { kolor: 8 },
  NAZWY: { kolor: 8 },
  OTWORY: { kolor: 30 },
  OSPRZET: { kolor: 5 },
  TRASY: { kolor: 3 },
  PRZEWODY: { kolor: 1 },
  NOTATKI: { kolor: 32 },
} as const;
type Warstwa = keyof typeof WARSTWY;

export interface DaneRzutuDxf {
  walls: Wall[];
  roomShapes: RoomShape[];
  openings: Opening[];
  elements: InstallationElement[];
  trasy: CableRoute[];
  przewody: PrzewodReczny[];
  notatki: NotatkaPlanu[];
  /** Metry na jednostkę planu. */
  mpu: number;
  /** Skala renderu symboli (jedn. planu na jedn. glifu) — ta sama co na płótnie. */
  skalaSymboli: number;
}

/** Wysokość opisów [m] — czytelna w 1:50 i 1:100. */
const WYS_TEKSTU = 0.15;

/** Zapis grupy DXF: kod i wartość, każde w osobnym wierszu. */
class Dxf {
  private w: string[] = [];
  para(kod: number, wartosc: string | number) {
    this.w.push(String(kod), typeof wartosc === "number" ? liczba(wartosc) : wartosc);
  }
  tekst(): string {
    return this.w.join("\r\n") + "\r\n";
  }
}

/** Liczba bez wykładniczego zapisu i bez śmieciowych miejsc po przecinku. */
function liczba(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Nazwa bloku symbolu — wielkie litery ASCII, bez polskich znaków (tak bezpiecznie dla R12). */
export function nazwaBloku(type: ElementType): string {
  return `PE_${type.toUpperCase()}`;
}

/**
 * Prymitywy bloku symbolu we WSPÓŁRZĘDNYCH GLIFU (Y w dół, jak na płótnie) — `blok`
 * odwraca oś przy zapisie. Ta sama geometria co na rzucie tam, gdzie mamy ją opisaną
 * w jednym miejscu (gniazdo, łącznik, symbole normowe); reszta jako okrąg z kodem.
 */
type Prymityw =
  | { k: "linia"; p: number[] }
  | { k: "kolo"; x: number; y: number; r: number }
  | { k: "luk"; x: number; y: number; r: number; od: number; do: number }
  | { k: "tekst"; x: number; y: number; t: string; h: number };

function prymitywySymbolu(type: ElementType): Prymityw[] {
  const normowy = symbolNormowy(type);
  if (normowy) {
    return normowy.flatMap((p): Prymityw[] => {
      if (p.k === "linia") return [{ k: "linia", p: p.p }];
      if (p.k === "wielokat") return [{ k: "linia", p: [...p.p, p.p[0], p.p[1]] }];
      if (p.k === "kolo") return [{ k: "kolo", x: p.x, y: p.y, r: p.r }];
      if (p.k === "tekst") return [{ k: "tekst", x: p.x, y: p.y, t: p.t, h: p.size * 0.8 }];
      // łuki ścieżek (dzwonek) — przybliżenie półokręgiem z cięciwą
      const m = p.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const [x0, y0, r] = m;
      if (r === undefined) return [];
      // Flaga „sweep 0" rysuje łuk w DÓŁ ekranu, czyli — po odwróceniu osi Y — w dół
      // także w CAD-zie: kąty 180°–360°. „sweep 1" to górna połowa, 0°–180°.
      const wDol = p.d.includes(" 0 0 0 ");
      return [
        { k: "luk", x: 0, y: y0, r, od: wDol ? 180 : 0, do: wDol ? 360 : 180 },
        { k: "linia", p: [x0, y0, -x0, y0] },
      ];
    });
  }
  if (type === "gniazdko" || type === "gniazdkoHerm" || type === "gniazdko400" || type === "wypustAGD") {
    const { r, stemLen, half } = SOCKET_GLYPH;
    const gora = -half;
    const apex = gora + stemLen;
    const cieciwa = apex + r;
    const out: Prymityw[] = [
      { k: "linia", p: [0, gora, 0, apex] },
      { k: "linia", p: [-r, apex, r, apex] },
      // łuk otwarty w dół na ekranie — w osi CAD (Y w górę) to górna połowa okręgu
      { k: "luk", x: 0, y: cieciwa, r, od: 0, do: 180 },
    ];
    if (type === "gniazdkoHerm") out.push({ k: "luk", x: 0, y: cieciwa, r: r * 0.6, od: 0, do: 180 });
    if (type === "gniazdko400") out.push({ k: "tekst", x: 0, y: cieciwa - 3, t: "3F", h: 7 });
    return out;
  }
  // Oprawy i czujnik dymu — te same znaki co na płótnie (koło z krzyżem, koła współśrodkowe).
  if (type === "oswietlenie" || type === "oswietlenieZewn") {
    const r = type === "oswietlenie" ? 13 : 9;
    const k = r / 2;
    return [
      { k: "kolo", x: 0, y: 0, r },
      { k: "linia", p: [-k, -k, k, k] },
      { k: "linia", p: [k, -k, -k, k] },
    ];
  }
  if (type === "czujnikDymu") {
    return [
      { k: "kolo", x: 0, y: 0, r: 12 },
      { k: "kolo", x: 0, y: 0, r: 6 },
      { k: "kolo", x: 0, y: 0, r: 2 },
    ];
  }
  if (isSwitchType(type)) {
    const { r, segments } = switchGlyph(type);
    return [{ k: "kolo", x: 0, y: 0, r }, ...segments.map((s): Prymityw => ({ k: "linia", p: [s.x1, s.y1, s.x2, s.y2] }))];
  }
  const { w, h } = glyphBoxSize(type);
  const kod = ELEMENT_TYPES[type]?.code ?? "?";
  const r = Math.min(w, h) / 2;
  return [
    { k: "kolo", x: 0, y: 0, r },
    { k: "tekst", x: 0, y: 0, t: kod, h: kod.length > 2 ? 6 : 8 },
  ];
}

/** Rzut kondygnacji jako tekst DXF (przed zakodowaniem do strony kodowej). */
export function rzutDoDxfTekst(d: DaneRzutuDxf): string {
  const { mpu } = d;
  const doM = (p: Point) => ({ x: p.x * mpu, y: -p.y * mpu });
  const dxf = new Dxf();
  // Przybory sanitarne nie są symbolem umownym, tylko obrysem w prawdziwych wymiarach
  // (patrz `glyphBoxSize`) — idą jako prostokąt, nie jako blok.
  const typy = [...new Set(d.elements.filter((e) => !SANITARY_FIXTURES[e.type]).map((e) => e.type))];

  // ── NAGŁÓWEK
  dxf.para(0, "SECTION");
  dxf.para(2, "HEADER");
  dxf.para(9, "$ACADVER");
  dxf.para(1, "AC1009");
  dxf.para(9, "$DWGCODEPAGE");
  dxf.para(3, "ANSI_1250");
  dxf.para(9, "$INSUNITS");
  dxf.para(70, 6); // metry
  dxf.para(0, "ENDSEC");

  // ── TABELE: warstwy (+ typ linii CONTINUOUS, do którego się odwołują)
  dxf.para(0, "SECTION");
  dxf.para(2, "TABLES");
  dxf.para(0, "TABLE");
  dxf.para(2, "LTYPE");
  dxf.para(70, 1);
  dxf.para(0, "LTYPE");
  dxf.para(2, "CONTINUOUS");
  dxf.para(70, 0);
  dxf.para(3, "Solid line");
  dxf.para(72, 65);
  dxf.para(73, 0);
  dxf.para(40, 0);
  dxf.para(0, "ENDTAB");
  dxf.para(0, "TABLE");
  dxf.para(2, "LAYER");
  dxf.para(70, Object.keys(WARSTWY).length);
  for (const [nazwa, { kolor }] of Object.entries(WARSTWY)) {
    dxf.para(0, "LAYER");
    dxf.para(2, nazwa);
    dxf.para(70, 0);
    dxf.para(62, kolor);
    dxf.para(6, "CONTINUOUS");
  }
  dxf.para(0, "ENDTAB");
  dxf.para(0, "ENDSEC");

  // ── BLOKI: jeden na typ osprzętu. Geometria w jednostkach glifu, Y odwrócone.
  dxf.para(0, "SECTION");
  dxf.para(2, "BLOCKS");
  for (const t of typy) {
    dxf.para(0, "BLOCK");
    dxf.para(8, "0");
    dxf.para(2, nazwaBloku(t));
    dxf.para(70, 0);
    dxf.para(10, 0);
    dxf.para(20, 0);
    dxf.para(30, 0);
    for (const p of prymitywySymbolu(t)) zapiszPrymityw(dxf, p, "0", (x, y) => ({ x, y: -y }), 1);
    dxf.para(0, "ENDBLK");
    dxf.para(8, "0");
  }
  dxf.para(0, "ENDSEC");

  // ── ENCJE
  dxf.para(0, "SECTION");
  dxf.para(2, "ENTITIES");

  // Ściany — polilinia osi ze stałą szerokością równą grubości ściany.
  for (const w of d.walls) {
    if (w.points.length < 2) continue;
    polilinia(dxf, "SCIANY", w.points.map(doM), false, (w.thickness ?? DEFAULT_WALL_THICKNESS) * mpu);
  }

  // Pomieszczenia — zamknięty obrys i nazwa w środku.
  for (const r of d.roomShapes) {
    if (r.points.length < 3) continue;
    polilinia(dxf, "POMIESZCZENIA", r.points.map(doM), true);
    const s = punktWewnatrzWielokata(r.points);
    if (s) tekst(dxf, "NAZWY", doM(s), r.name, WYS_TEKSTU * 1.3, 0, true);
  }

  // Otwory — odcinek w świetle otworu, wzdłuż ściany.
  for (const o of d.openings) {
    const dx = (Math.cos(o.angle) * o.width) / 2;
    const dy = (Math.sin(o.angle) * o.width) / 2;
    linia(dxf, "OTWORY", doM({ x: o.x - dx, y: o.y - dy }), doM({ x: o.x + dx, y: o.y + dy }));
  }

  // Trasy policzone przez aplikację i przewody poprowadzone ręcznie.
  for (const t of d.trasy) if (t.points.length >= 2) polilinia(dxf, "TRASY", t.points.map(doM), false);
  for (const p of d.przewody) {
    const a = d.elements.find((e) => e.id === p.od);
    const b = d.elements.find((e) => e.id === p.do);
    if (!a || !b) continue;
    linia(dxf, "PRZEWODY", doM(a), doM(b));
    if (p.kabel) {
      const kat = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
      const czytelny = kat > 90 || kat < -90 ? kat + 180 : kat;
      tekst(dxf, "PRZEWODY", doM({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), p.kabel, WYS_TEKSTU * 0.8, czytelny, true);
    }
  }

  // Osprzęt — wstawienia bloków; obrót CAD jest przeciwny do ekranowego (oś Y w górę).
  const skalaBloku = d.skalaSymboli * mpu;
  for (const e of d.elements) {
    const p = doM(e);
    const przybor = SANITARY_FIXTURES[e.type] ? fixtureSizeM(e) : null;
    if (przybor) {
      const kat = (-(e.rotation ?? 0) * Math.PI) / 180;
      const rog = (x: number, y: number) => ({ x: p.x + x * Math.cos(kat) - y * Math.sin(kat), y: p.y + x * Math.sin(kat) + y * Math.cos(kat) });
      const w = przybor.widthM / 2;
      const h = przybor.depthM / 2;
      polilinia(dxf, "OSPRZET", [rog(-w, -h), rog(w, -h), rog(w, h), rog(-w, h)], true);
      tekst(dxf, "OSPRZET", p, ELEMENT_TYPES[e.type].label, WYS_TEKSTU * 0.8, 0, true);
      continue;
    }
    dxf.para(0, "INSERT");
    dxf.para(8, "OSPRZET");
    dxf.para(2, nazwaBloku(e.type));
    dxf.para(10, p.x);
    dxf.para(20, p.y);
    dxf.para(30, 0);
    dxf.para(41, skalaBloku);
    dxf.para(42, skalaBloku);
    dxf.para(43, skalaBloku);
    dxf.para(50, -(e.rotation ?? 0));
  }

  // Notatki — wiersz po wierszu (TEXT w R12 nie zna łamania).
  for (const n of d.notatki) {
    n.tekst.split("\n").forEach((wiersz, i) => {
      tekst(dxf, "NOTATKI", doM({ x: n.x, y: n.y }), wiersz, WYS_TEKSTU, 0, false, -(i + 1) * WYS_TEKSTU * 1.4);
    });
  }

  dxf.para(0, "ENDSEC");
  dxf.para(0, "EOF");
  return dxf.tekst();
}

function linia(dxf: Dxf, warstwa: Warstwa | "0", a: Point, b: Point) {
  dxf.para(0, "LINE");
  dxf.para(8, warstwa);
  dxf.para(10, a.x);
  dxf.para(20, a.y);
  dxf.para(30, 0);
  dxf.para(11, b.x);
  dxf.para(21, b.y);
  dxf.para(31, 0);
}

function polilinia(dxf: Dxf, warstwa: Warstwa, punkty: Point[], zamknieta: boolean, szerokosc = 0) {
  dxf.para(0, "POLYLINE");
  dxf.para(8, warstwa);
  dxf.para(66, 1);
  dxf.para(10, 0);
  dxf.para(20, 0);
  dxf.para(30, 0);
  dxf.para(70, zamknieta ? 1 : 0);
  if (szerokosc > 0) {
    dxf.para(40, szerokosc);
    dxf.para(41, szerokosc);
  }
  for (const p of punkty) {
    dxf.para(0, "VERTEX");
    dxf.para(8, warstwa);
    dxf.para(10, p.x);
    dxf.para(20, p.y);
    dxf.para(30, 0);
  }
  dxf.para(0, "SEQEND");
  dxf.para(8, warstwa);
}

function tekst(dxf: Dxf, warstwa: Warstwa | "0", p: Point, t: string, wys: number, obrot = 0, srodek = false, dy = 0) {
  dxf.para(0, "TEXT");
  dxf.para(8, warstwa);
  dxf.para(10, p.x);
  dxf.para(20, p.y + dy);
  dxf.para(30, 0);
  dxf.para(40, wys);
  dxf.para(1, t);
  if (obrot) dxf.para(50, obrot);
  if (srodek) {
    // wyrównanie do środka (72=1) i w pionie do środka (73=2) — punkt 11/21 jest wtedy wiążący
    dxf.para(72, 1);
    dxf.para(73, 2);
    dxf.para(11, p.x);
    dxf.para(21, p.y + dy);
    dxf.para(31, 0);
  }
}

function zapiszPrymityw(dxf: Dxf, p: Prymityw, warstwa: "0", t: (x: number, y: number) => Point, skala: number) {
  if (p.k === "linia") {
    for (let i = 0; i + 3 < p.p.length; i += 2) {
      linia(dxf, warstwa, t(p.p[i] * skala, p.p[i + 1] * skala), t(p.p[i + 2] * skala, p.p[i + 3] * skala));
    }
  } else if (p.k === "kolo") {
    const c = t(p.x * skala, p.y * skala);
    dxf.para(0, "CIRCLE");
    dxf.para(8, warstwa);
    dxf.para(10, c.x);
    dxf.para(20, c.y);
    dxf.para(30, 0);
    dxf.para(40, p.r * skala);
  } else if (p.k === "luk") {
    const c = t(p.x * skala, p.y * skala);
    dxf.para(0, "ARC");
    dxf.para(8, warstwa);
    dxf.para(10, c.x);
    dxf.para(20, c.y);
    dxf.para(30, 0);
    dxf.para(40, p.r * skala);
    dxf.para(50, p.od);
    dxf.para(51, p.do);
  } else {
    tekst(dxf, warstwa, t(p.x * skala, p.y * skala), p.t, p.h * skala, 0, true);
  }
}

/** Polskie znaki i typograficzne drobiazgi w stronie kodowej Windows-1250. */
const CP1250: Record<string, number> = {
  ą: 0xb9, ć: 0xe6, ę: 0xea, ł: 0xb3, ń: 0xf1, ó: 0xf3, ś: 0x9c, ź: 0x9f, ż: 0xbf,
  Ą: 0xa5, Ć: 0xc6, Ę: 0xca, Ł: 0xa3, Ń: 0xd1, Ó: 0xd3, Ś: 0x8c, Ź: 0x8f, Ż: 0xaf,
  "×": 0xd7, "°": 0xb0, "–": 0x96, "—": 0x97, "„": 0x84, "”": 0x94, "“": 0x93, "’": 0x92, "²": 0xb2,
};

/** Tekst DXF → bajty w Windows-1250 (to, co zapowiada `$DWGCODEPAGE`). Spoza strony — „?". */
export function doCp1250(tekst: string): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  for (const ch of tekst) {
    const kod = ch.codePointAt(0)!;
    if (kod < 0x80) out.push(kod);
    else out.push(CP1250[ch] ?? 0x3f);
  }
  return new Uint8Array(out);
}

export function rzutDoDxf(d: DaneRzutuDxf): Uint8Array<ArrayBuffer> {
  return doCp1250(rzutDoDxfTekst(d));
}
