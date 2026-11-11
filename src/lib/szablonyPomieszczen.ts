import type { ElementType, InstallationElement, Opening, Point, RoomShape, RoomType, Wall } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { MANUAL_DRAW_SCALE_MPU, WALL_SNAP_TOLERANCE_M } from "@/lib/design";
import { pointInPolygon, punktWewnatrzWielokata } from "@/lib/geometry";
import { glyphBoxSize } from "@/lib/glyphs";
import { bezNakladaniaNaSasiadow } from "@/lib/rozstawElementow";
import { przyscienny, snapElementToWall } from "@/lib/wallSnap";

/**
 * Szablony pomieszczeń (F12 z audytu 5.11.2026): typowy osprzęt danego pomieszczenia
 * wstawiany jednym kliknięciem, zamiast stawiania tych samych dziesięciu symboli
 * w każdej kuchni od nowa.
 *
 * Szablon to PUNKT WYJŚCIA, nie projekt: nie wie, gdzie stanie blat ani łóżko, więc
 * osprzęt rozkłada się równo po obwodzie, a użytkownik dosuwa go potem tam, gdzie
 * trzeba. Wszystko trafia do historii jako jeden krok, więc jedno „Cofnij" zdejmuje
 * cały szablon.
 */

export interface PozycjaSzablonu {
  type: ElementType;
  /** Ile sztuk. */
  ile: number;
  /** Wariant gniazda: 2 = podwójne. */
  gangs?: number;
  /** Litera odbiornika dla wypustu AGD. */
  agdLetter?: string;
}

/**
 * Zestawy oparte na typowym wyposażeniu mieszkania (minimum wg N SEP-E-002 z zapasem,
 * jaki daje się dziś przy nowych instalacjach). Gniazda podwójne liczą się jako dwa
 * gniazda, ale jeden punkt na ścianie.
 */
export const SZABLONY: Partial<Record<RoomType, PozycjaSzablonu[]>> = {
  kuchnia: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    // nad blatem: 3 × podwójne = 6 gniazd
    { type: "gniazdko", ile: 3, gangs: 2 },
    // lodówka
    { type: "gniazdko", ile: 1 },
    { type: "wypustAGD", ile: 1, agdLetter: "P" },
    { type: "wypustAGD", ile: 1, agdLetter: "Z" },
    { type: "wypustAGD", ile: 1, agdLetter: "I" },
  ],
  lazienka: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdkoHerm", ile: 2 },
    { type: "wentylator", ile: 1 },
  ],
  pralnia: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdkoHerm", ile: 2 },
  ],
  kotlownia: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdkoHerm", ile: 1 },
    { type: "czujnikCzadu", ile: 1 },
  ],
  salon: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdko", ile: 4, gangs: 2 },
    { type: "rtvsat", ile: 1 },
    { type: "rj45", ile: 1 },
  ],
  sypialnia: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    // po obu stronach łóżka + jedno przy biurku/toaletce
    { type: "gniazdko", ile: 3, gangs: 2 },
    { type: "rtvsat", ile: 1 },
  ],
  pokoj: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdko", ile: 3, gangs: 2 },
    { type: "rj45", ile: 1 },
  ],
  garaz: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdko", ile: 2 },
    { type: "gniazdko400", ile: 1 },
  ],
  klatka: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznikSchodowy", ile: 2 },
  ],
  inne: [
    { type: "oswietlenie", ile: 1 },
    { type: "wlacznik", ile: 1 },
    { type: "gniazdko", ile: 1 },
  ],
};

/** Krótki opis zawartości szablonu do pokazania przed wstawieniem, np. „oprawa, łącznik, 4 × gniazdo”. */
export function opisSzablonu(typ: RoomType): string {
  return opisPozycji(SZABLONY[typ] ?? []);
}

/** Wariant pozycji, po którym szablon rozpoznaje sztukę już stojącą w pokoju. */
function wariantPozycji(type: ElementType, gangs: number | undefined, agdLetter: string | undefined): string {
  return `${type}|${gangs ?? 1}|${type === "wypustAGD" ? (agdLetter ?? "A") : ""}`;
}

/**
 * Pozycje szablonu, których w pomieszczeniu jeszcze NIE MA — po typie, wariancie gniazda
 * (pojedyncze / podwójne) i literze wypustu AGD.
 *
 * Szablon dokładał wcześniej cały komplet bez względu na to, co już stoi, a komunikat
 * obiecywał „uzupełnienie”. W gotowej kuchni dawało to drugą oprawę, drugi łącznik
 * i drugie wypusty P/Z/I — czyli trzy zbędne obwody w rozdzielnicy (R2 z audytu
 * Instalacji 11.11.2026). Stojąca sztuka „zalicza” jedną sztukę pozycji o tym samym
 * wariancie; gniazdo pojedyncze nie zastępuje podwójnego, bo to inny punkt w kosztorysie.
 */
export function brakujaceWSzablonie(typ: RoomType, room: RoomShape, elements: InstallationElement[]): PozycjaSzablonu[] {
  const stoi = new Map<string, number>();
  for (const e of elements) {
    if (e.floor !== room.floor) continue;
    if (e.roomId !== undefined ? e.roomId !== room.id : e.room !== room.name) continue;
    const k = wariantPozycji(e.type, e.gangs, e.agdLetter);
    stoi.set(k, (stoi.get(k) ?? 0) + 1);
  }
  const wynik: PozycjaSzablonu[] = [];
  for (const p of SZABLONY[typ] ?? []) {
    const k = wariantPozycji(p.type, p.gangs, p.agdLetter);
    const zaliczone = Math.min(p.ile, stoi.get(k) ?? 0);
    stoi.set(k, (stoi.get(k) ?? 0) - zaliczone);
    if (p.ile > zaliczone) wynik.push({ ...p, ile: p.ile - zaliczone });
  }
  return wynik;
}

/** Opis listy pozycji szablonu, np. „2 × Gniazdo 230 V podwójne, Wypust AGD (Z)”. */
export function opisPozycji(pozycje: PozycjaSzablonu[]): string {
  const nazwa = (p: PozycjaSzablonu) => {
    const etykieta = ELEMENT_TYPES[p.type].label;
    const wariant = p.gangs === 2 ? " podwójne" : "";
    const litera = p.agdLetter ? ` (${p.agdLetter})` : "";
    return `${etykieta}${wariant}${litera}`;
  };
  return pozycje.map((p) => (p.ile > 1 ? `${p.ile} × ${nazwa(p)}` : nazwa(p))).join(", ");
}

/** Typy wieszane na suficie albo stojące w środku pomieszczenia, nie przy ścianie. */
function sufitowy(type: ElementType): boolean {
  return !przyscienny(type);
}

/** Zamknięty obrys jako lista krawędzi z długościami. */
function krawedzie(points: Point[]) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { a, b, dl: Math.hypot(b.x - a.x, b.y - a.y) };
  });
}

/** Punkt na obwodzie w odległości `s` od pierwszego wierzchołka (mierzonej po obwodzie). */
function punktNaObwodzie(points: Point[], s: number): { p: Point; kierunek: Point } {
  const ks = krawedzie(points);
  const obwod = ks.reduce((suma, k) => suma + k.dl, 0);
  let reszta = ((s % obwod) + obwod) % obwod;
  for (const k of ks) {
    if (reszta <= k.dl && k.dl > 0) {
      const t = reszta / k.dl;
      return {
        p: { x: k.a.x + (k.b.x - k.a.x) * t, y: k.a.y + (k.b.y - k.a.y) * t },
        kierunek: { x: (k.b.x - k.a.x) / k.dl, y: (k.b.y - k.a.y) / k.dl },
      };
    }
    reszta -= k.dl;
  }
  const k = ks[ks.length - 1];
  return { p: k.b, kierunek: { x: (k.b.x - k.a.x) / (k.dl || 1), y: (k.b.y - k.a.y) / (k.dl || 1) } };
}

/** Odległość punktu `p` po obwodzie od pierwszego wierzchołka — rzut na najbliższą krawędź. */
function pozycjaNaObwodzie(points: Point[], p: Point): { s: number; dist: number } {
  let najlepsza = { s: 0, dist: Infinity };
  let przebyte = 0;
  for (const k of krawedzie(points)) {
    if (k.dl > 0) {
      const t = Math.max(0, Math.min(1, ((p.x - k.a.x) * (k.b.x - k.a.x) + (p.y - k.a.y) * (k.b.y - k.a.y)) / (k.dl * k.dl)));
      const q = { x: k.a.x + (k.b.x - k.a.x) * t, y: k.a.y + (k.b.y - k.a.y) * t };
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      if (dist < najlepsza.dist) najlepsza = { s: przebyte + t * k.dl, dist };
    }
    przebyte += k.dl;
  }
  return najlepsza;
}

/**
 * Punkt odsunięty od krawędzi do WNĘTRZA pomieszczenia — od niego zaczyna przyciąganie
 * do ściany. Punkt leżący dokładnie na obrysie jest dla `pointInPolygon` niejednoznaczny,
 * a od tego, po której stronie wypadnie, zależy, w którą stronę obróci się symbol.
 */
function doWnetrza(p: Point, kierunek: Point, room: Point[], odsuniecie: number): Point {
  const n1 = { x: p.x - kierunek.y * odsuniecie, y: p.y + kierunek.x * odsuniecie };
  if (pointInPolygon(n1, room)) return n1;
  return { x: p.x + kierunek.y * odsuniecie, y: p.y - kierunek.x * odsuniecie };
}

export interface KontekstSzablonu {
  room: RoomShape;
  /** Wszystkie elementy kondygnacji — nowe symbole nie mogą na nie nachodzić. */
  elements: InstallationElement[];
  walls: Wall[];
  roomShapes: RoomShape[];
  openings: Opening[];
  /** Metry na jednostkę planu, `null` bez kalibracji. */
  mpu: number | null;
  /** Skala renderu symboli — ta sama, którą rysuje płótno. */
  skalaSymboli: number;
  /** Generator identyfikatorów (w testach przewidywalny). */
  noweId?: () => string;
}

/**
 * Elementy szablonu dla danego pomieszczenia, ustawione na planie.
 *
 * - Oprawa i inne symbole sufitowe — w środku pomieszczenia.
 * - Łącznik — przy pierwszych drzwiach, ~20 cm za ościeżnicą (strony klamki szablon
 * nie zna — łącznik przesuwa się na drugą stronę jednym przeciągnięciem).
 *   Bez drzwi na obrysie: przy pierwszym narożniku.
 * - Reszta — równo po obwodzie, z pominięciem otworów, przyklejona do ściany tak samo,
 *   jak przy stawianiu ręcznym (`snapElementToWall`), i odsunięta od sąsiadów.
 */
export function elementySzablonu(typ: RoomType, ctx: KontekstSzablonu): InstallationElement[] {
  const { room, walls, roomShapes, openings, skalaSymboli } = ctx;
  // Tylko to, czego w pokoju jeszcze nie ma — patrz `brakujaceWSzablonie`.
  const pozycje = brakujaceWSzablonie(typ, room, ctx.elements);
  if (!pozycje.length || room.points.length < 3) return [];
  const mpu = ctx.mpu && ctx.mpu > 0 ? ctx.mpu : MANUAL_DRAW_SCALE_MPU;
  const jednostek = (m: number) => m / mpu;
  const noweId = ctx.noweId ?? (() => crypto.randomUUID());
  const tolerancja = jednostek(WALL_SNAP_TOLERANCE_M);
  const obwod = krawedzie(room.points).reduce((s, k) => s + k.dl, 0);

  // Otwory na obrysie TEGO pomieszczenia, jako przedziały na obwodzie.
  const otwory = openings
    .filter((o) => o.floor === room.floor)
    .map((o) => ({ o, ...pozycjaNaObwodzie(room.points, o) }))
    .filter((x) => x.dist <= tolerancja)
    .map((x) => ({ kind: x.o.kind, od: x.s - x.o.width / 2, do: x.s + x.o.width / 2, srodek: x.s, szer: x.o.width }));
  /** Połowa szerokości symbolu na planie — o tyle symbol sięga w bok od swojego środka. */
  const polowaSymbolu = (type: ElementType) => (Math.max(glyphBoxSize(type).w, glyphBoxSize(type).h) / 2) * skalaSymboli;
  // Środek symbolu w otworze to za mało: liczy się jego KRAWĘDŹ, a do niej jeszcze
  // 10 cm luzu na ościeżnicę.
  const wOtworze = (s: number, type: ElementType) =>
    otwory.some((o) => {
      const zapas = jednostek(0.1) + polowaSymbolu(type);
      const sn = ((s % obwod) + obwod) % obwod;
      return [sn, sn + obwod, sn - obwod].some((v) => v > o.od - zapas && v < o.do + zapas);
    });

  const drzwi = otwory.find((o) => o.kind === "drzwi");
  // Początek obwodu „za drzwiami": łącznik stoi tuż przy ościeżnicy, a gniazda
  // rozkładają się dalej, więc nie lądują w świetle przejścia.
  const start = drzwi ? drzwi.do + jednostek(0.1) + polowaSymbolu("wlacznik") : jednostek(0.3);

  const gotowe: InstallationElement[] = [];
  const wszystkie = () => [...ctx.elements, ...gotowe];

  /** Element w danym miejscu, już odsunięty od sąsiadów — jeszcze nie dodany. */
  const policz = (type: ElementType, p: Point, opcje: PozycjaSzablonu, obrot = 0): InstallationElement => {
    const roboczy: InstallationElement = {
      id: noweId(),
      type,
      x: p.x,
      y: p.y,
      rotation: obrot,
      room: room.name,
      floor: room.floor,
      dedicated: false,
      note: "",
      gangs: opcje.gangs ?? 1,
      ...(type === "wypustAGD" ? { agdLetter: opcje.agdLetter ?? "A" } : {}),
    };
    const rozstaw = bezNakladaniaNaSasiadow(roboczy, wszystkie(), skalaSymboli, ctx.mpu);
    return { ...roboczy, ...rozstaw };
  };
  const postaw = (type: ElementType, p: Point, opcje: PozycjaSzablonu, obrot = 0) => {
    gotowe.push(policz(type, p, opcje, obrot));
  };

  const przyScianie = (type: ElementType, s: number, opcje: PozycjaSzablonu) => {
    // Krok w przód, dopóki symbol wypada w otworze albo poza pomieszczeniem — także PO
    // odsunięciu od sąsiadów, bo to potrafi go wepchnąć z powrotem w drzwi. Najwyżej
    // jedno okrążenie; gdy nic się nie znajdzie, zostaje ostatnia próba.
    const krok = jednostek(0.1);
    let ostatni: InstallationElement | null = null;
    for (let i = 0, sk = s; i * krok <= obwod; i++, sk += krok) {
      if (wOtworze(sk, type)) continue;
      const { p, kierunek } = punktNaObwodzie(room.points, sk);
      const wewnatrz = doWnetrza(p, kierunek, room.points, jednostek(0.05));
      const m = snapElementToWall(wewnatrz, walls, roomShapes, tolerancja, type, skalaSymboli);
      ostatni = policz(type, m ?? wewnatrz, opcje, m?.rotation ?? 0);
      if (!wOtworze(pozycjaNaObwodzie(room.points, ostatni).s, type) && pointInPolygon(ostatni, room.points)) break;
    }
    if (ostatni) gotowe.push(ostatni);
  };

  // 1) sufit
  const srodek = punktWewnatrzWielokata(room.points);
  for (const poz of pozycje.filter((p) => sufitowy(p.type))) {
    for (let i = 0; i < poz.ile; i++) if (srodek) postaw(poz.type, srodek, poz);
  }

  // 2) łączniki przy wejściu; drugi łącznik schodowy — naprzeciw, w połowie obwodu
  const laczniki = pozycje.filter((p) => !sufitowy(p.type) && ELEMENT_TYPES[p.type].role === "control" && p.type.startsWith("wlacznik"));
  let nrLacznika = 0;
  for (const poz of laczniki) {
    for (let i = 0; i < poz.ile; i++, nrLacznika++) przyScianie(poz.type, start + (nrLacznika * obwod) / 2, poz);
  }

  // 3) reszta osprzętu przyściennego — równo po obwodzie za łącznikiem
  const reszta = pozycje.filter((p) => !sufitowy(p.type) && !laczniki.includes(p)).flatMap((p) => Array.from({ length: p.ile }, () => p));
  const odstep = obwod / (reszta.length + 1);
  reszta.forEach((poz, i) => przyScianie(poz.type, start + odstep * (i + 1), poz));

  return gotowe;
}

/** „1 element”, „2 elementy”, „5 elementów”, „22 elementy”. */
export function odmianaElementu(n: number): string {
  if (n === 1) return "element";
  const j = n % 10;
  const d = n % 100;
  return j >= 2 && j <= 4 && (d < 12 || d > 14) ? "elementy" : "elementów";
}
