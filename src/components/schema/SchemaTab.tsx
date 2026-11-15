import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import { useOpcjeDoboru, useProjectStore } from "@/store/useProjectStore";
import { downloadBlob, downloadPdfBytes, projectFileName } from "@/lib/pdf/download";
import { buildDrawingDoc } from "@/lib/pdf/drawing";
import type { PdfDoc } from "@/lib/pdf/engine";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
import { plotnoDoPdf, svgDoPlotna, PIKSELI_NA_PUNKT } from "@/lib/pdf/raster";
import { resolveDocHeader } from "@/lib/docHeader";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { Button } from "@/components/ui/button";
import { CadGlyph } from "./CadGlyph";
import { GLYPHS, labelOffset, type GlyphSpec } from "./deviceGlyphs";
import { LINE_W, STROKE } from "./glyphyOprawa";
import { computeRcdGroups } from "@/lib/panel/circuits";
import { computeSizedCircuits, pradyWgKluczaAparatu } from "@/lib/panel/project";
import { aparatyDoWidoku, buildPanelDevices, czuloscITypRcd, dzieciAparatu, jestOdplywem, opisBiegunow, PHASE_COLORS, rodzicAparatu, zasilanieRozdzielnicy } from "@/lib/panel/devices";
import { zLiczba } from "@/lib/liczby";
import type { PanelConfig, PanelDevice, UkladSieci } from "@/types";
import { usePowiekszanieRysunku } from "@/hooks/usePowiekszanieRysunku";
import { PrzyciskiPowiekszenia } from "@/components/ui/PrzyciskiPowiekszenia";

const MUTED = "#6B7684";

const LEAF_W = 96;
const RCD_MIN_W = 130;
const SPD_COL_W = 108;
const LAMPKA_COL_W = 90;
const GROUP_GAP = 50;
const MARGIN_X = 50;
/** Pionowy przewód PE od głównej szyny uziemiającej do szyny PE — w lewym marginesie. */
const RISER_X = 46;
/** Pierwsza kolumna aparatów — dalej od lewej krawędzi niż `MARGIN_X`, bo przed nią
 *  biegnie pion PE z symbolem uziemienia. */
const LEFT_X = MARGIN_X + 40;

// Opis zasilania stoi nad grotem zasilania, więc siatka zaczyna się od niego,
// a nie od samej strzałki — inaczej napis wychodziłby poza górną krawędź rysunku.
const Y_PHASES = 11;
/** Druga linia opisu zasilania: zabezpieczenie przedlicznikowe w złączu. */
const Y_PRZEDL = 23;
const Y_ARROW = 30;
const MAIN_H = 60;
const BRANCH_H = 110;
const SPD_H = 84;
const MCB_H = 26;
/** Gniazdo aparatu odpływowego — od szyny podrzędnej (doprowadzenie) do dołu symbolu. */
const LEAF_GLYPH_H = 20 + MCB_H;
/** Bezpiecznik nad ogranicznikiem przepięć — patrz `SpdBranch`. */
const SPD_FUSE_H = 40;
// Lampka sygnalizacyjna stojąca wprost na szynie głównej ma własną wysokość — tak, żeby
// okrąg wyszedł tej samej wielkości co przy pudełku SPD (`SPD_H`), ale bez pustego
// marginesu pod nim: glif lampki (patrz `GLYPHS.lampka`) kończy się na dolnej krawędzi
// okręgu (66/100 wysokości źródłowej), nie na umownej siatce 0–100.
const LAMPKA_H = Math.round((SPD_H * 66) / 100);

/** O ile rośnie rysunek, gdy na dopływie stoi rozłącznik przeciwpożarowy. */
const DY_PPOZ = 60;
/** O ile rośnie rysunek, gdy pod którymś zabezpieczeniem stoi aparat szeregowo. */
const DY_SZEREG = 8 + LEAF_GLYPH_H;

// Tabela odpływów końcowych pod schematem — każda komórka dokładnie pod swoją gałęzią
// powyżej (te same współrzędne x co CircuitBranch).
const TABLE_GAP = 24;
const TABLE_TAG_H = 18;
// Wiersz nazwy jest wyższy, bo mieści dwie linie — nazwy obwodów bywają długie
// („Obwód dedykowany — Kuchnia (zmywarka)”), a przy jednej linii ucięcie zjadało
// końcówkę, czyli dokładnie to, co odróżnia obwód 1 od obwodu 2.
const TABLE_NAME_H = 26;
// Wiersz fazy stoi MIĘDZY oznaczeniem a nazwą, bo to informacja o obwodzie, a nie
// o aparacie: z samego „F3 / Gniazda kuchnia” nie wynika, na której fazie obwód
// siedzi, a przy odbiorze i przy szukaniu przyczyny zaniku to pierwsza rzecz, jakiej
// się szuka. Rozdziałem 1-fazowych na L1/L2/L3 zajmuje się `balancePhases`, więc bez
// tego wiersza wynik bilansowania nie był na schemacie widoczny w ogóle.
const TABLE_PHASE_H = 15;

/**
 * Siatka pionowa schematu — jedna wspólna skala dla wszystkich gałęzi, żeby aparaty
 * tego samego rzędu (np. wszystkie RCD, wszystkie wyłączniki obwodów) leżały na tej
 * samej wysokości niezależnie od tego, ile mają obwodów czy jak długie mają opisy.
 *
 * Wysokości gniazd na aparaty (MAIN_H/BRANCH_H/MCB_H) są dobrane pod symbole CAD
 * użytkownika: to one, a nie odwrotnie, wyznaczają skalę rysunku, bo rozciągnięte na
 * zbyt małą wysokość gubiłyby czytelność detali (przekładnik RCD, strzałka SPD).
 *
 * Funkcja, nie stałe: dwa rzędy pojawiają się tylko wtedy, gdy jest co w nich narysować —
 * rozłącznik przeciwpożarowy na dopływie (`ppoz`) i aparaty zasilane szeregowo spod
 * wyłącznika obwodu (`szeregowe`, np. stycznik, lampka za B6). Bez nich rysunek ma
 * dokładnie tę samą geometrię co wcześniej.
 */
function siatka(ppoz: boolean, szeregowe: boolean) {
  const g = ppoz ? DY_PPOZ : 0;
  const sz = szeregowe ? DY_SZEREG : 0;
  const Y_PPOZ_TOP = Y_ARROW + 14;
  const Y_PPOZ_BOT = Y_PPOZ_TOP + 42;
  /** Rozdział PEN i główna szyna uziemiająca — PRZED rozłącznikiem głównym. */
  const Y_SPLIT = Y_ARROW + 24 + g;
  const Y_SWITCH_TOP = Y_ARROW + 42 + g;
  const Y_SWITCH_BOT = Y_SWITCH_TOP + MAIN_H;
  const Y_BUS = Y_SWITCH_BOT + 26;
  const Y_SUBBUS = Y_BUS + BRANCH_H;
  const Y_MCB_TOP = Y_SUBBUS + 20;
  const Y_MCB_BOTTOM = Y_MCB_TOP + MCB_H;
  /** Rząd aparatów szeregowych: szynka pod zabezpieczeniem i dół symbolu aparatu. */
  const Y_SER_TOP = Y_MCB_BOTTOM + 8;
  const Y_SER_BOTTOM = Y_SER_TOP + LEAF_GLYPH_H;
  // Szyny ochronna i neutralna — poziome przewody przecinające odejścia pod aparatami.
  // Przewód obwodu musi kończyć się PONIŻEJ obu, inaczej wyglądałby na urwany nad nimi.
  const Y_N_BUS = Y_MCB_BOTTOM + 26 + sz;
  const Y_PE_BUS = Y_N_BUS + 12;
  const Y_WIRE_END = Y_PE_BUS + 10;
  const Y_TERMINAL_TEXT = Y_WIRE_END + 14;
  const Y_SPD_BOTTOM = Y_BUS + SPD_H;
  const Y_LAMPKA_BOTTOM = Y_BUS + LAMPKA_H;
  const TABLE_TOP = Y_TERMINAL_TEXT + TABLE_GAP;
  const TABLE_MID = TABLE_TOP + TABLE_TAG_H;
  const TABLE_PHASE_BOTTOM = TABLE_MID + TABLE_PHASE_H;
  const TABLE_BOTTOM = TABLE_PHASE_BOTTOM + TABLE_NAME_H;
  /** Uwaga o szynach N pod tabelą — patrz `UwagiSchematu`. */
  const Y_UWAGI = TABLE_BOTTOM + 18;
  const SCHEMA_HEIGHT = Y_UWAGI + 48;
  return {
    Y_PPOZ_TOP, Y_PPOZ_BOT, Y_SPLIT, Y_SWITCH_TOP, Y_SWITCH_BOT, Y_BUS, Y_SUBBUS, Y_MCB_TOP, Y_MCB_BOTTOM,
    Y_SER_TOP, Y_SER_BOTTOM, Y_N_BUS, Y_PE_BUS, Y_WIRE_END, Y_TERMINAL_TEXT, Y_SPD_BOTTOM, Y_LAMPKA_BOTTOM,
    TABLE_TOP, TABLE_MID, TABLE_PHASE_BOTTOM, TABLE_BOTTOM, Y_UWAGI, SCHEMA_HEIGHT,
  };
}
type Siatka = ReturnType<typeof siatka>;

const MCB_LABEL_DX = labelOffset(GLYPHS.mcb, 0, LEAF_GLYPH_H);
// Odsunięcie etykiety przy symbolu zastępczym (GLYPHS.generic) — liczone osobno, bo ta
// ramka jest węższa niż glif MCB, więc ten sam MCB_LABEL_DX zostawiałby zbędną pustkę.
const GENERIC_LABEL_DX = labelOffset(GLYPHS.generic, 0, LEAF_GLYPH_H);
// Rozłącznik izolacyjny bezpiecznikowy — jeden wspólny odsuw dla obu wariantów
// (3-fazowego i 1-fazowego): różni je tylko liczba kresek wkładki wewnątrz, oś i
// najdalej wysunięty w prawo punkt (`rightX`) są identyczne w obu plikach źródłowych.
const ROZBEZP_LABEL_DX = labelOffset(GLYPHS.rozBezp3f, 0, LEAF_GLYPH_H);
const LAMPKA_LABEL_DX = labelOffset(GLYPHS.lampka, 0, LEAF_GLYPH_H);
const BEZPIECZNIK_LABEL_DX = labelOffset(GLYPHS.bezpiecznik, 0, LEAF_GLYPH_H);
/** RCBO — ten sam symbol co różnicówka (styk z członem wyłącznika, przekładnik,
 *  wyzwalacz), wpisany w gniazdo wyłącznika obwodu. */
const RCBO_LABEL_DX = labelOffset(GLYPHS.rcd, 0, LEAF_GLYPH_H);

/** Ile znaków mieści się w jednej linii komórki tabeli. Szerokość znaku (4,3 px dla
 *  `fontSize=8`) zmierzona przez `getComputedTextLength()` na realnych nazwach obwodów —
 *  to najgorszy przypadek z zakresu 3,73–4,27, więc linia nigdy nie wyjdzie poza komórkę.
 *  Liczone z góry ze stałej zamiast mierzone w DOM, żeby render pozostał czysto
 *  deklaratywny (bez pomiaru i przeliczania układu po zamontowaniu). */
const TABLE_CELL_PAD = 8;
const TABLE_CHARS_PER_LINE = Math.floor((LEAF_W - TABLE_CELL_PAD) / 4.3);

/**
 * Opis aparatu z liczbą biegunów: „3P · B16”, „1P+N · B16/30mA”.
 *
 * Liczba biegunów jest częścią doboru, a nie ozdobnikiem — z samego „B16” nie wynika,
 * czy chodzi o zabezpieczenie jednofazowe, czy trójfazowe, a to zmienia i aparat,
 * i miejsce w rozdzielnicy. Wcześniej pokazywał ją wyłącznie rozłącznik główny.
 *
 * Aparaty bez sensownej liczby biegunów (np. zasilacz modułowy) mają w katalogu „—”;
 * dla nich zostaje sam opis, bo „— · 12V DC” niczego nie wnosi.
 */
function opisZBiegunami(device: PanelDevice): string {
  const bieguny = opisBiegunow(device)?.trim();
  return bieguny && bieguny !== "—" ? `${bieguny} · ${device.label}` : device.label;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Dzieli nazwę na maks. dwie linie łamane po wyrazach; nadmiar ucina wielokropkiem
 *  dopiero w drugiej linii, więc numer obwodu na końcu nazwy zwykle ocaleje. */
function wrapTwoLines(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ""];
  const words = text.split(" ");
  let first = "";
  let i = 0;
  while (i < words.length && (first ? first.length + 1 + words[i].length : words[i].length) <= maxChars) {
    first = first ? `${first} ${words[i]}` : words[i];
    i++;
  }
  // pojedynczy wyraz dłuższy niż linia — tnij go twardo, inaczej pierwsza linia byłaby pusta
  if (!first) return [text.slice(0, maxChars), truncate(text.slice(maxChars), maxChars)];
  return [first, truncate(words.slice(i).join(" "), maxChars)];
}

/**
 * Opis dopływu w zapisie przyjętym w dokumentacji: liczba faz, przewody, napięcie, układ.
 *
 * Wcześniej było tu samo „L1, L2, L3" — bez N i PEN, więc ze schematu nie dało się
 * odczytać, czy rozdzielnica dostaje PEN (i gdzie go rozdzielić), ani skąd biorą się
 * szyny N i PE na dole rysunku (audyt rozdzielnicy 15.11.2026, błąd 3).
 */
function opisDoplywu(supply3f: boolean, uklad: UkladSieci): string {
  const fazy = supply3f ? "3" : "1";
  const przewody = uklad === "TN-C-S" ? "PEN" : uklad === "TN-S" ? "N/PE" : "N";
  return `${fazy}/${przewody} ~ ${supply3f ? "400/230" : "230"} V · ${uklad}`;
}

/**
 * Wejście zasilania: opis dopływu, zabezpieczenie przedlicznikowe, grot i przewód do
 * rozłącznika. Zabezpieczenie przedlicznikowe stoi w złączu, poza rozdzielnicą — ale to
 * ono chroni wszystko poniżej, więc schemat bez niego nie mówi, co chroni Q1 i różnicówki.
 */
function IncomingSupply({
  x,
  supply3f,
  uklad,
  przedlicznikowe,
  ppoz,
  s,
}: {
  x: number;
  supply3f: boolean;
  uklad: UkladSieci;
  przedlicznikowe: number;
  /** Czy na dopływie stoi rozłącznik przeciwpożarowy — wtedy przewód ma w nim przerwę. */
  ppoz: boolean;
  s: Siatka;
}) {
  // Przewód przerwany na wysokości rozłącznika ppoż.: jego symbol rysuje własne
  // doprowadzenia, a ciągła kreska pod otwartym stykiem czytałaby się jak styk zwarty.
  const odcinki = ppoz
    ? [
        [Y_ARROW + 9, s.Y_PPOZ_TOP],
        [s.Y_PPOZ_BOT, s.Y_SWITCH_TOP],
      ]
    : [[Y_ARROW + 9, s.Y_SWITCH_TOP]];
  return (
    <g id="incoming-supply">
      <text x={x} y={Y_PHASES} fontSize={9.5} textAnchor="middle" fill={STROKE}>
        {opisDoplywu(supply3f, uklad)}
      </text>
      <text x={x} y={Y_PRZEDL} fontSize={8.5} textAnchor="middle" fill={MUTED}>
        {`zabezpieczenie przedlicznikowe ${przedlicznikowe} A (w złączu)`}
      </text>
      <polygon points={`${x - 4},${Y_ARROW} ${x + 4},${Y_ARROW} ${x},${Y_ARROW + 9}`} fill={STROKE} />
      {odcinki.map(([y1, y2]) => (
        <line key={y1} x1={x} y1={y1} x2={x} y2={y2} stroke={STROKE} strokeWidth={LINE_W} />
      ))}
    </g>
  );
}

/**
 * Rozłącznik przeciwpożarowy (przeciwpożarowy wyłącznik prądu) — NA DOPŁYWIE, przed
 * rozdziałem PEN i rozłącznikiem głównym.
 *
 * Odcina zasilanie całego budynku, więc nie jest odpływem rozdzielnicy. Wcześniej stał
 * w rzędzie wyłączników obwodów, jak jeden z odbiorników (audyt rozdzielnicy
 * 15.11.2026, błąd 9). W praktyce siedzi zwykle w złączu albo tuż przy wejściu
 * przewodu do budynku — stąd dopisek pod opisem.
 */
function RozlacznikPpoz({ x, device, s }: { x: number; device: PanelDevice; s: Siatka }) {
  const dx = labelOffset(GLYPHS.main, s.Y_PPOZ_TOP, s.Y_PPOZ_BOT, 16);
  return (
    <g id="rozlacznik-ppoz">
      <CadGlyph spec={GLYPHS.main} x={x} top={s.Y_PPOZ_TOP} bottom={s.Y_PPOZ_BOT} />
      <text x={x + dx} y={s.Y_PPOZ_TOP + 12} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={s.Y_PPOZ_TOP + 24} fontSize={9} fill={STROKE}>
        {opisZBiegunami(device)}
      </text>
      <text x={x + dx} y={s.Y_PPOZ_TOP + 35} fontSize={8} fill={MUTED}>
        przeciwpożarowy wyłącznik prądu (złącze / wejście do budynku)
      </text>
    </g>
  );
}

/** Symbol uziemienia: trzy malejące kreski pod pionowym odcinkiem zaczynającym się w (x, y). */
function Uziemienie({ x, y }: { x: number; y: number }) {
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y + 8} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 9} y1={y + 8} x2={x + 9} y2={y + 8} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 6} y1={y + 12} x2={x + 6} y2={y + 12} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 3} y1={y + 16} x2={x + 3} y2={y + 16} stroke={STROKE} strokeWidth={LINE_W} />
    </>
  );
}

/**
 * Skąd bierze się PE: główna szyna uziemiająca (GSU) z uziomem i pion do szyny PE.
 *
 * - TN-C-S: PEN rozdzielony NA DOPŁYWIE, przed rozłącznikiem — kropka na przewodzie
 *   zasilającym i odejście do GSU. Rozłącznik 4P/2P łączy już tylko L i N; PEN-u nie
 *   wolno rozłączać, więc rozdział za rozłącznikiem byłby błędem.
 * - TN-S: PE dochodzi osobnym przewodem (PEN rozdzielono wcześniej, np. w złączu).
 * - TT: PE wyłącznie z własnego uziomu — bez żadnego połączenia z przewodem zasilającym.
 */
function ZrodloPe({ mainX, uklad, s }: { mainX: number; uklad: UkladSieci; s: Siatka }) {
  const xZiemi = RISER_X - 18;
  return (
    <g id="zrodlo-pe" data-uklad={uklad}>
      {uklad === "TN-C-S" && (
        <g id="rozdzial-pen">
          <line x1={mainX} y1={s.Y_SPLIT} x2={RISER_X} y2={s.Y_SPLIT} stroke={STROKE} strokeWidth={LINE_W} />
          <circle cx={mainX} cy={s.Y_SPLIT} r={2.4} fill={STROKE} />
          {/* Opis przy KROPCE rozdziału, nie przy GSU — tam, gdzie PEN przestaje być PEN-em. */}
          <text x={mainX - 6} y={s.Y_SPLIT - 4} fontSize={8} textAnchor="end" fill={MUTED}>
            rozdział PEN → PE + N
          </text>
        </g>
      )}
      {uklad === "TN-S" && (
        <g id="doplyw-pe">
          <text x={RISER_X} y={Y_PHASES} fontSize={9.5} textAnchor="middle" fill={STROKE}>
            PE
          </text>
          <polygon points={`${RISER_X - 4},${Y_ARROW} ${RISER_X + 4},${Y_ARROW} ${RISER_X},${Y_ARROW + 9}`} fill={STROKE} />
          <line x1={RISER_X} y1={Y_ARROW + 9} x2={RISER_X} y2={s.Y_SPLIT} stroke={STROKE} strokeWidth={LINE_W} strokeDasharray="6 3" />
        </g>
      )}
      {/* GSU z uziomem — kropka węzła, odejście w lewo do symbolu uziemienia. */}
      <circle cx={RISER_X} cy={s.Y_SPLIT} r={2.4} fill={STROKE} />
      <line x1={RISER_X} y1={s.Y_SPLIT} x2={xZiemi} y2={s.Y_SPLIT} stroke={STROKE} strokeWidth={LINE_W} />
      <Uziemienie x={xZiemi} y={s.Y_SPLIT} />
      <text x={RISER_X + 5} y={s.Y_SPLIT + 12} fontSize={8.5} fontWeight={700} fill={STROKE}>
        GSU
      </text>
      <text x={RISER_X + 5} y={s.Y_SPLIT + 22} fontSize={7.5} fill={MUTED}>
        {uklad === "TT" ? "uziom odbiorcy" : "uziom, połączenia wyrównawcze"}
      </text>
      {/* Pion PE do szyny PE na dole — kreską przerywaną jak sama szyna. */}
      <line x1={RISER_X} y1={s.Y_SPLIT} x2={RISER_X} y2={s.Y_PE_BUS} stroke={STROKE} strokeWidth={LINE_W} strokeDasharray="6 3" />
    </g>
  );
}

/** Rozłącznik izolacyjny główny — symbol wgrany przez użytkownika (Q1.svg), z opisem obok. */
function MainSwitch({ x, device, s }: { x: number; device: PanelDevice; s: Siatka }) {
  const dx = labelOffset(GLYPHS.main, s.Y_SWITCH_TOP, s.Y_SWITCH_BOT, 16);
  return (
    <g id="main-switch">
      <CadGlyph spec={GLYPHS.main} x={x} top={s.Y_SWITCH_TOP} bottom={s.Y_SWITCH_BOT} />
      <text x={x + dx} y={s.Y_SWITCH_TOP + 9} fontSize={11.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={s.Y_SWITCH_TOP + 22} fontSize={10} fill={STROKE}>
        {opisZBiegunami(device)}
      </text>
      <text x={x + dx} y={s.Y_SWITCH_TOP + 34} fontSize={8.5} fill={MUTED}>
        {truncate(device.caption, 28)}
      </text>
    </g>
  );
}

/**
 * Ogranicznik przepięć — symbol wgrany przez użytkownika (SPD.svg), połączony z SZYNĄ PE.
 *
 * Wcześniej kończył się własnym symbolem uziemienia, niepołączonym z niczym — co czytało
 * się jak osobny uziom pod ogranicznik. SPD łączy się z PE/GSU tej samej instalacji,
 * możliwie najkrócej (audyt rozdzielnicy 15.11.2026, błąd 4).
 */
function SpdBranch({ col, device, bezpiecznik, s }: { col: Column; device: PanelDevice; bezpiecznik?: PanelDevice; s: Siatka }) {
  const x = col.cx;
  /**
   * Bezpiecznik pod SPD — SZEREGOWO nad ogranicznikiem, na tym samym przewodzie.
   * Wcześniej stał w rzędzie obwodów, obok SPD, czyli równolegle — tam nie chroni
   * niczego (audyt rozdzielnicy 15.11.2026, błąd 5). Ogranicznik schodzi wtedy niżej
   * o wysokość bezpiecznika; szyna PE jest daleko pod nim, więc miejsca nie brakuje.
   */
  const dy = bezpiecznik ? SPD_FUSE_H : 0;
  const top = s.Y_BUS + dy;
  const bottom = s.Y_SPD_BOTTOM + dy;
  const dx = labelOffset(GLYPHS.spd, top, bottom);
  const specB = bezpiecznik?.kind === "rozBezp" ? (bezpiecznik.poles === "3P" ? GLYPHS.rozBezp3f : GLYPHS.rozBezp1f) : GLYPHS.bezpiecznik;
  const dxB = labelOffset(specB, s.Y_BUS, s.Y_BUS + SPD_FUSE_H, 8);
  return (
    <g id="spd">
      {bezpiecznik && (
        <g id="spd-bezpiecznik">
          <CadGlyph spec={specB} x={x} top={s.Y_BUS} bottom={s.Y_BUS + SPD_FUSE_H} />
          <text x={x + dxB} y={s.Y_BUS + 18} fontSize={9.5} fontWeight={700} fill={STROKE}>
            {bezpiecznik.tag}
          </text>
          <text x={x + dxB} y={s.Y_BUS + 29} fontSize={8.5} fill={MUTED}>
            {opisZBiegunami(bezpiecznik)}
          </text>
        </g>
      )}
      <CadGlyph spec={GLYPHS.spd} x={x} top={top} bottom={bottom} />
      <line data-spd-pe="" x1={x} y1={bottom} x2={x} y2={s.Y_PE_BUS} stroke={STROKE} strokeWidth={LINE_W} strokeDasharray="6 3" />
      <circle cx={x} cy={s.Y_PE_BUS} r={2} fill={STROKE} />

      <text x={x + dx} y={top + 44} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={top + 56} fontSize={9} fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
      {/* Długość przewodów przyłączeniowych SPD — zalecenie PN-HD 60364-5-53: im dłuższe,
          tym wyższy poziom ochrony, jaki realnie dociera do instalacji. */}
      <text x={x + dx} y={top + 68} fontSize={8} fill={MUTED}>
        do PE
      </text>
      <text x={x + dx} y={top + 78} fontSize={8} fill={MUTED}>
        przewody ≤ 0,5 m
      </text>
    </g>
  );
}

/**
 * Lampka sygnalizacyjna — odejście wprost z szyny głównej, na tej samej wysokości co
 * RCD i SPD (patrz komentarz przy `LAMPKA_H`), a nie w rzędzie wyłączników obwodowych.
 * Układ KOŃCZY SIĘ na symbolu — bez przewodu do szyn N/PE (w odróżnieniu od zwykłego
 * odbiornika jednofazowego czy SPD, które mają swoje uziemienie narysowane wprost).
 */
function LampkaBranch({ col, device, s }: { col: Column; device: PanelDevice; s: Siatka }) {
  const x = col.cx;
  const dx = labelOffset(GLYPHS.lampka, s.Y_BUS, s.Y_LAMPKA_BOTTOM);
  return (
    <g id={`lampka-${device.tag}`}>
      <CadGlyph spec={GLYPHS.lampka} x={x} top={s.Y_BUS} bottom={s.Y_LAMPKA_BOTTOM} />
      <text x={x + dx} y={s.Y_BUS + 34} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={s.Y_BUS + 46} fontSize={9} fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
    </g>
  );
}

/** Wyłącznik różnicowoprądowy — symbol wgrany przez użytkownika (RCD.svg). */
function RcdBranch({ col, device, s }: { col: Column; device: PanelDevice; s: Siatka }) {
  const x = col.cx;
  const dx = labelOffset(GLYPHS.rcd, s.Y_BUS, s.Y_SUBBUS);
  return (
    <g id={`rcd-${device.tag}`}>
      <CadGlyph spec={GLYPHS.rcd} x={x} top={s.Y_BUS} bottom={s.Y_SUBBUS} />
      <text x={x + dx} y={s.Y_BUS + 34} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={s.Y_BUS + 46} fontSize={9} fill={MUTED}>
        {/* Bez czułości: ta stoi w linii niżej, razem z typem. Wcześniej czułość była
            dwa razy — „4P · 63A/30mA” i pod spodem „30 mA · typ A”. */}
        {opisZBiegunami({ ...device, label: device.label.replace(/\s*\/.*$/, "") })}
      </text>
      {czuloscITypRcd(device) && (
        <text x={x + dx} y={s.Y_BUS + 57} fontSize={9} fill={MUTED}>
          {czuloscITypRcd(device)}
        </text>
      )}
    </g>
  );
}

/**
 * Nazwa szyny N za różnicówką: „N1" dla FI1, „N2" dla FI2… Przewód N obwodu wraca
 * przez TĘ różnicówkę, przez którą wyszedł L — stąd numer z oznaczenia różnicówki.
 * Odejścia bez różnicówki korzystają ze zwykłej szyny „N" (przed różnicówkami).
 */
function nazwaSzynyN(rcd: PanelDevice | undefined): string {
  if (!rcd) return "N";
  const nr = rcd.tag.match(/(\d+)$/)?.[1];
  return nr ? `N${nr}` : `N (${rcd.tag})`;
}

/**
 * Szyny N i PE.
 *
 * PE — jedna, wspólna dla całej rozdzielnicy, zasilana pionem z GSU (patrz `ZrodloPe`).
 *
 * N — OSOBNA pod każdą różnicówką. Wcześniej jedna szyna N biegła pod wszystkimi
 * grupami, co na rysunku wykonawczym podpowiada najczęstszy błąd montażowy: wspólne N
 * za kilkoma różnicówkami. Prąd wraca wtedy przez inną różnicówkę niż ta, którą płynął
 * L, i obie wyzwalają bez powodu albo przestają chronić (audyt rozdzielnicy
 * 15.11.2026, błąd 2).
 *
 * Na schemacie jednokreskowym pojedyncza kreska obwodu reprezentuje komplet żył, więc
 * szyny przecinają odejścia bez kropek połączeniowych — kropki ma tylko PE (`PeTaps`).
 */
function ProtectiveBuses({ width, columns, s }: { width: number; columns: Column[]; s: Siatka }) {
  return (
    <g id="pe-n-buses">
      {columns.map((col) => {
        if (col.kind !== "rcd" || !col.block || col.block.liscie.length === 0) return null;
        const n = col.block.liscie.length;
        const x1 = circuitX(col, 0) - LEAF_W / 2 + 6;
        const x2 = circuitX(col, n - 1) + LEAF_W / 2 - 6;
        const nazwa = nazwaSzynyN(col.block.device);
        return (
          <g key={col.block.device?.uid ?? `bez-rcd-${col.x0}`} data-szyna="N">
            <line x1={x1} y1={s.Y_N_BUS} x2={x2} y2={s.Y_N_BUS} stroke={STROKE} strokeWidth={LINE_W} />
            <text x={x1 - 4} y={s.Y_N_BUS + 3.5} fontSize={9} fontWeight={700} textAnchor="end" fill={STROKE}>
              {nazwa}
            </text>
          </g>
        );
      })}
      {/* PE kreską przerywaną — odróżnia przewód ochronny od neutralnego na wydruku
          czarno-białym, gdzie kolor nie niesie żadnej informacji. Od pionu z GSU po
          prawą krawędź; opis z prawej, bo z lewej stoi pion. */}
      <g data-szyna="PE">
        <line x1={RISER_X} y1={s.Y_PE_BUS} x2={width - MARGIN_X} y2={s.Y_PE_BUS} stroke={STROKE} strokeWidth={LINE_W} strokeDasharray="6 3" />
        <text x={width - MARGIN_X + 6} y={s.Y_PE_BUS + 3.5} fontSize={9} fontWeight={700} textAnchor="start" fill={STROKE}>
          PE
        </text>
      </g>
    </g>
  );
}

/**
 * Dane rozdzielnicy jako wyrobu w jednej linii — to, co trafia na tabliczkę według
 * PN-EN 61439-3. Napięcie, układ i prąd z ustawień; IP, prąd zwarciowy i obudowa tylko
 * wtedy, gdy je podano (z karty producenta), żeby rysunek nie udawał danych, których nie ma.
 */
function daneRozdzielnicy(c: PanelConfig, uklad: UkladSieci): string {
  return [
    `Rozdzielnica (PN-EN 61439-3): Un ${c.supply3f ? "400/230" : "230"} V`,
    uklad,
    `In ${c.mainRating} A (wg Q1)`,
    c.iccKA ? `Icc ${c.iccKA} kA` : null,
    c.stopienIP ?? null,
    c.obudowa ? `obudowa: ${c.obudowa}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Jedno zdanie pod tabelą — to, czego sam rysunek szyn N nie powie montującemu. */
function UwagiSchematu({ uklad, dane, s }: { uklad: UkladSieci; dane: string; s: Siatka }) {
  return (
    <g id="uwagi-schematu">
      <text x={MARGIN_X} y={s.Y_UWAGI} fontSize={8} fill={MUTED}>
        {"N1, N2… — osobna szyna N za każdą różnicówką; szyn N różnych różnicówek nie łączyć ze sobą. "}
        {uklad === "TN-C-S"
          ? "N i PE łączą się wyłącznie w miejscu rozdziału PEN."
          : "N i PE nie łączyć w tej rozdzielnicy."}
      </text>
      {/* Konwencja oznaczeń projektu — „FI" nie jest kodem klasy z IEC 81346-2, więc
          rysunek mówi wprost, co znaczy, zamiast zakładać, że czytający zna zwyczaj. */}
      <text data-legenda-oznaczen="" x={MARGIN_X} y={s.Y_UWAGI + 12} fontSize={8} fill={MUTED}>
        Oznaczenia: Q — łączniki · F1…Fn — zabezpieczenia obwodów (numer = numer obwodu) · F0.x — sekcja zasilania (SPD i jego bezpiecznik)
      </text>
      <text data-legenda-oznaczen="" x={MARGIN_X} y={s.Y_UWAGI + 24} fontSize={8} fill={MUTED}>
        FI — wyłączniki różnicowoprądowe (klasa F wg IEC 81346-2) · K — styczniki, przekaźniki, czujniki · P — sygnalizacja · T — zasilacze
      </text>
      <text data-dane-rozdzielnicy="" x={MARGIN_X} y={s.Y_UWAGI + 36} fontSize={8} fill={STROKE}>
        {dane}
      </text>
    </g>
  );
}

/** Odczep PE przy jednym odejściu: kropka połączeniowa na szynie i kreska pod 30°
 *  schodząca do przewodu pionowego. Poziomy odsuw i spadek liczone z tego samego kąta,
 *  więc nachylenie zostaje dokładnie 30° niezależnie od dobranej długości odczepu. */
const PE_TAP_DX = 12;
const PE_TAP_DY = PE_TAP_DX * Math.tan(Math.PI / 6);

/**
 * Połączenia przewodu ochronnego z odejściami. Osobna grupa od samych szyn, bo rysowana
 * po nich — kropka ma leżeć NA kresce przerywanej, nie pod nią. Kropka oznacza połączenie
 * (w odróżnieniu od zwykłego skrzyżowania, które połączeniem nie jest), a ukośna kreska
 * schodzi od niej do pionowego odpływu poniżej szyny.
 */
function PeTaps({ columns, s }: { columns: Column[]; s: Siatka }) {
  return (
    <g id="pe-taps">
      {circuitXs(columns).map((cx) => (
        <g key={cx}>
          <line
            x1={cx - PE_TAP_DX}
            y1={s.Y_PE_BUS}
            x2={cx}
            y2={s.Y_PE_BUS + PE_TAP_DY}
            stroke={STROKE}
            strokeWidth={LINE_W}
          />
          <circle cx={cx - PE_TAP_DX} cy={s.Y_PE_BUS} r={2} fill={STROKE} />
        </g>
      ))}
    </g>
  );
}


/**
 * Symbol aparatu w rzędzie odpływów. Wyłącznik nadprądowy i rozłącznik izolacyjny
 * bezpiecznikowy mają symbol odwzorowany z pliku CAD, bezpiecznik i lampka — rysowany
 * wg normy; reszta katalogu (stycznik, przekaźnik, zasilacz, CZF…) dostaje na razie
 * symbol zastępczy (patrz `GLYPHS.generic`), żeby nic nie znikało po cichu ze schematu.
 * Rozłącznik bezpiecznikowy ma DWA warianty (liczba kresek wkładki) — po liczbie
 * biegunów aparatu, bo to jego WŁASNA nastawa (tak jak przy MCB).
 */
function symbolOdplywu(device: PanelDevice): { spec: GlyphSpec; labelDx: number } {
  if (device.kind === "mcb") return { spec: GLYPHS.mcb, labelDx: MCB_LABEL_DX };
  if (device.kind === "rozBezp") return { spec: device.poles === "3P" ? GLYPHS.rozBezp3f : GLYPHS.rozBezp1f, labelDx: ROZBEZP_LABEL_DX };
  if (device.kind === "spdFuse") return { spec: GLYPHS.bezpiecznik, labelDx: BEZPIECZNIK_LABEL_DX };
  // RCBO dostawał symbol zastępczy (przerywaną ramkę), choć to jeden z najczęstszych
  // aparatów (audyt rozdzielnicy 15.11.2026, błąd 10).
  if (device.kind === "rcbo") return { spec: GLYPHS.rcd, labelDx: RCBO_LABEL_DX };
  if (device.kind === "lampka") return { spec: GLYPHS.lampka, labelDx: LAMPKA_LABEL_DX };
  return { spec: GLYPHS.generic, labelDx: GENERIC_LABEL_DX };
}

/**
 * Jeden aparat w rzędzie odpływów: symbol między `gora` a `dol`, oznaczenie i nastawa
 * obok, a pod nim przewód do `doY` (do końca odejścia albo do szynki aparatów
 * szeregowych). Ten sam komponent rysuje wyłącznik obwodu i aparat stojący szeregowo
 * pod nim (stycznik, lampkę…) — różnią się tylko wysokością.
 */
function CircuitBranch({
  x,
  device,
  gora,
  dol,
  doY,
  zPrzewodem,
  zacisk,
  s,
}: {
  x: number;
  device: PanelDevice;
  gora: number;
  dol: number;
  doY: number;
  /** Czy podpisać typ przewodu na końcu odejścia — tylko dla aparatu, z którego przewód wychodzi do obwodu. */
  zPrzewodem: boolean;
  /** Oznaczenie zacisku odejścia na listwie (np. „X1:3”) — tylko tam, gdzie przewód wychodzi z rozdzielnicy. */
  zacisk?: string;
  s: Siatka;
}) {
  const { spec, labelDx } = symbolOdplywu(device);
  const yOpisu = gora + 20 + MCB_H / 2;
  return (
    <g id={`circuit-${device.tag}`}>
      <CadGlyph spec={spec} x={x} top={gora} bottom={dol} />
      <line x1={x} y1={dol} x2={x} y2={doY} stroke={STROKE} strokeWidth={LINE_W} />

      {/* Tag i wartość zabezpieczenia (B10/B16…) stoją RAZEM z prawej strony symbolu —
          tag nad wartością, tak jak przy pozostałych aparatach (RcdBranch, SpdBranch,
          MainSwitch). Wcześniej tag wisiał osobno nad glifem, a wartość osobno obok,
          więc nie czytało się ich jako pary. Obie linie odsunięte o labelDx od osi
          przewodu, żeby ominąć najszerszy punkt glifu (strzałka wyzwalacza sięga ok.
          +20px od osi na tej wysokości) — żadna już nie leży na przewodzie, więc bez
          białej „poświaty" pod spodem (była potrzebna tylko, gdy tag siedział na kresce). */}
      <text x={x + labelDx} y={yOpisu - 4} fontSize={9.5} fontWeight={700} textAnchor="start" fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + labelDx} y={yOpisu + 8} fontSize={8.5} fontWeight={700} textAnchor="start" fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
      {/* Nazwa odbiornika celowo NIE jest powtarzana tutaj — stoi w tabeli odpływów pod
          schematem, dokładnie w tej samej kolumnie. Wcześniej była w obu miejscach, w obu
          ucięta, więc zajmowała miejsce nic nie wnosząc. Przy gałęzi zostaje sam typ
          przewodu, czyli informacja, której w tabeli nie ma. */}
      {/* Zacisk listwy odpływowej: kółko (symbol zacisku) i oznaczenie X1:n. Wcześniej
          schemat kończył odejście w powietrzu — elektryk nie miał na rysunku, gdzie
          podłączyć przewód obwodu ani jak opisać listwę (audyt rozdzielnicy, pkt 14). */}
      {zacisk && (
        <g data-zacisk={zacisk}>
          <circle cx={x} cy={s.Y_WIRE_END} r={2.4} fill="#fff" stroke={STROKE} strokeWidth={LINE_W} />
          <text x={x + 5} y={s.Y_WIRE_END + 3} fontSize={7} fill={MUTED}>
            {zacisk}
          </text>
        </g>
      )}
      {zPrzewodem && device.cable && (
        <text x={x} y={s.Y_TERMINAL_TEXT} fontSize={7.5} textAnchor="middle" fill={MUTED}>
          {truncate(device.cable, 20)}
        </text>
      )}
    </g>
  );
}

/**
 * Jedno odejście na dole schematu — jedna kolumna tabeli, jeden odczep PE.
 *
 * Zwykle to po prostu wyłącznik obwodu. Gdy pod wyłącznikiem stoją aparaty zasilane
 * z niego szeregowo (np. B6 → lampka i CZF), każdy z nich dostaje WŁASNE odejście:
 * wyłącznik rysuje się raz, nad pierwszym z nich, a szynka pod nim rozprowadza
 * zasilanie do wszystkich (audyt rozdzielnicy 15.11.2026, błąd 7).
 */
interface Lisc {
  /** Aparat zabezpieczający odejście (wyłącznik, bezpiecznik…). */
  aparat: PanelDevice;
  /** Aparat zasilany szeregowo spod `aparat` — jeśli jest. */
  szeregowy?: PanelDevice;
  /** Pierwsze odejście danego aparatu — tylko nad nim rysuje się jego symbol. */
  pierwszy: boolean;
  /** Ile odejść ma `aparat` (długość szynki pod nim). */
  ileOdejsc: number;
}

/** Odejścia spod jednej różnicówki (albo wprost z szyny), w kolejności aparatów. */
function liscieOdejsc(aparaty: PanelDevice[], wszystkie: PanelDevice[]): Lisc[] {
  return aparaty.flatMap((aparat): Lisc[] => {
    const dzieci = dzieciAparatu(aparat, wszystkie).filter((d) => d.kind !== "spd");
    if (!dzieci.length) return [{ aparat, pierwszy: true, ileOdejsc: 1 }];
    return dzieci.map((szeregowy, i) => ({ aparat, szeregowy, pierwszy: i === 0, ileOdejsc: dzieci.length }));
  });
}

/** Lampka i czujnik zaniku fazy nie mają części przewodzących dostępnych — bez odczepu PE. */
function bezOdczepuPe(l: Lisc): boolean {
  return l.szeregowy?.kind === "lampka" || l.szeregowy?.kind === "ovr" || l.aparat.kind === "ovr";
}

/** Rysunek jednego odejścia: wyłącznik (nad pierwszym), szynka, aparat szeregowy. */
function Odejscie({ x, lisc, zacisk, s }: { x: number; lisc: Lisc; zacisk?: string; s: Siatka }) {
  const { aparat, szeregowy, pierwszy, ileOdejsc } = lisc;
  return (
    <>
      {pierwszy && (
        <CircuitBranch x={x} device={aparat} gora={s.Y_SUBBUS} dol={s.Y_MCB_BOTTOM} doY={szeregowy ? s.Y_SER_TOP : s.Y_WIRE_END} zPrzewodem={!szeregowy} zacisk={szeregowy ? undefined : zacisk} s={s} />
      )}
      {pierwszy && ileOdejsc > 1 && (
        <line data-szynka-szeregowa="" x1={x} y1={s.Y_SER_TOP} x2={x + (ileOdejsc - 1) * LEAF_W} y2={s.Y_SER_TOP} stroke={STROKE} strokeWidth={LINE_W} />
      )}
      {szeregowy && <CircuitBranch x={x} device={szeregowy} gora={s.Y_SER_TOP} dol={s.Y_SER_BOTTOM} doY={s.Y_WIRE_END} zPrzewodem zacisk={zacisk} s={s} />}
    </>
  );
}

interface RcdBlock {
  /** Różnicówka nad grupą. `undefined` dla wyłączników wychodzących wprost z szyny
   *  głównej — układ normalny, np. obwód przeciwpożarowy poza zasięgiem RCD. */
  device?: PanelDevice;
  liscie: Lisc[];
}

interface Column {
  kind: "spd" | "rcd" | "lampka";
  width: number;
  x0: number;
  cx: number;
  block?: RcdBlock;
  /** Tylko dla `kind: "lampka"` — jedna kolumna na jeden aparat. */
  device?: PanelDevice;
}

/**
 * Współrzędne x wszystkich odejść obwodowych, w kolejności rysowania. Jedno źródło dla
 * trzech warstw, które muszą stać w tych samych pionach: gałęzi z wyłącznikami, odczepów
 * PE i tabeli odpływów. Wcześniej ten sam wzór był przepisany w każdej z nich osobno,
 * więc każda zmiana układu groziła rozjechaniem się warstw względem siebie.
 */
function circuitX(col: Column, i: number): number {
  const n = col.block?.liscie.length ?? 0;
  return col.x0 + (col.width - n * LEAF_W) / 2 + LEAF_W * (i + 0.5);
}

/** Odejścia z odczepem PE. Lampka na szynie głównej ma własną kolumnę i nie trafia
 *  tutaj; lampka i CZF zasilane spod wyłącznika — patrz `bezOdczepuPe`. */
function circuitXs(columns: Column[]): number[] {
  const out: number[] = [];
  columns.forEach((col) => {
    if (col.kind !== "rcd" || !col.block) return;
    col.block.liscie.forEach((l, i) => {
      if (!bezOdczepuPe(l)) out.push(circuitX(col, i));
    });
  });
  return out;
}

/**
 * Tabela pod schematem — wyłącznie odpływy końcowe (obwody), bez W1/SPD/RCD.
 * Rysowana w tym samym układzie współrzędnych co gałęzie obwodów powyżej, więc
 * każda komórka wypada dokładnie pod swoim wyłącznikiem — nie osobny HTML-owy
 * `<table>`, którego szerokości kolumn musiałyby być ręcznie zsynchronizowane z SVG.
 */
function FinalCircuitsTable({ columns, s }: { columns: Column[]; s: Siatka }) {
  return (
    <g id="final-circuits-table">
      {columns.map((col) => {
        if (col.kind !== "rcd" || !col.block || col.block.liscie.length === 0) return null;
        // Komórka opisuje to, co faktycznie wychodzi z odejścia: aparat szeregowy, jeśli
        // jest (lampka, stycznik…), inaczej sam wyłącznik. Faza zawsze z wyłącznika —
        // aparat szeregowy siedzi na tej samej.
        const mcbs = col.block.liscie.map((l) => ({ ...(l.szeregowy ?? l.aparat), phase: l.aparat.phase }));
        // Komórki wychodzą od tej samej funkcji co gałęzie powyżej, więc każda wypada
        // dokładnie pod swoim wyłącznikiem bez osobnego przeliczania układu.
        const left = circuitX(col, 0) - LEAF_W / 2;
        const right = left + mcbs.length * LEAF_W;
        return (
          <g key={col.block.device?.uid ?? `bez-rcd-${col.x0}`}>
            <line x1={left} y1={s.TABLE_TOP} x2={right} y2={s.TABLE_TOP} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={s.TABLE_MID} x2={right} y2={s.TABLE_MID} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={s.TABLE_PHASE_BOTTOM} x2={right} y2={s.TABLE_PHASE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={s.TABLE_BOTTOM} x2={right} y2={s.TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={right} y1={s.TABLE_TOP} x2={right} y2={s.TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            {mcbs.map((mcb, i) => {
              const cellLeft = left + LEAF_W * i;
              const cx = cellLeft + LEAF_W / 2;
              return (
                <g key={mcb.uid}>
                  <line x1={cellLeft} y1={s.TABLE_TOP} x2={cellLeft} y2={s.TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
                  <text x={cx} y={s.TABLE_TOP + 13} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={STROKE}>
                    {mcb.tag}
                  </text>
                  {/* Faza obwodu. „3F" dla odbiorników trójfazowych, L1/L2/L3 dla
                      jednofazowych; kolor wg PN-HD 308 S2, ten sam co na widoku
                      czołowym rozdzielnicy — żeby oznaczenie na schemacie i w szafce
                      czytało się jako jedno i to samo. */}
                  <text
                    x={cx}
                    y={s.TABLE_MID + 11}
                    fontSize={8.5}
                    fontWeight={700}
                    textAnchor="middle"
                    fill={PHASE_COLORS[mcb.phase ?? ""] ?? MUTED}
                  >
                    {mcb.phase || "—"}
                  </text>
                  {(() => {
                    const [l1, l2] = wrapTwoLines(mcb.caption, TABLE_CHARS_PER_LINE);
                    return (
                      <text fontSize={8} textAnchor="middle" fill={STROKE}>
                        <title>{mcb.caption}</title>
                        <tspan x={cx} y={l2 ? s.TABLE_PHASE_BOTTOM + 11 : s.TABLE_PHASE_BOTTOM + 16}>
                          {l1}
                        </tspan>
                        {l2 && (
                          <tspan x={cx} y={s.TABLE_PHASE_BOTTOM + 21}>
                            {l2}
                          </tspan>
                        )}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Schemat instalacji jednokreskowy — generowany automatycznie z tej samej listy
 * aparatów co widok „Rozdzielnica” (`buildPanelDevices`), żeby oba widoki zawsze
 * zgadzały się co do tego, czy jest SPD, ile jest RCD i jakie mają obwody. Czysty
 * SVG (nie Konva), rysowany jak dokumentacja techniczna: cienkie czarne linie,
 * symbole aparatów wg IEC (odłącznik, RCD z cewką, SPD ze strzałką i uziemieniem),
 * bez kolorów i zaokrąglonych kart. Layout liczony dynamicznie z liczby obwodów —
 * dodanie/usunięcie elementu na planie od razu zmienia liczbę gałęzi.
 */
export function SchemaTab() {
  const elements = useProjectStore((s) => s.draft.elements);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  // Warunki, skale i geometria CALEGO budynku ida jednym pakietem wspolnym z
  // Rozdzielnica i Kosztorysem — patrz `useOpcjeDoboru`.
  const opcjeDoboru = useOpcjeDoboru();
  const panelConfig = useProjectStore((s) => s.panelConfig);
  const projectName = useProjectStore((s) => s.projectName);
  const svgRef = useRef<SVGSVGElement>(null);
  const rawDocHeader = useProjectStore((s) => s.docHeader);
  // Nazwa projektu jako domyślny „Obiekt" — dzięki temu tabliczka rysunkowa i nazwa
  // pliku są wypełnione nawet bez wizyty w zakładce Protokoły pomiarowe.
  const docHeader = resolveDocHeader(rawDocHeader, projectName);
  const [podglad, setPodglad] = useState(false);
  const [pdfTrwa, setPdfTrwa] = useState(false);

  /**
   * Schemat do PDF-a. Rysunek idzie jako obraz zrasteryzowany z TEGO SAMEGO <svg>,
   * który widać na ekranie — odtwarzanie geometrii po raz drugi w prymitywach PDF-a
   * byłoby drugą implementacją schematu, rozjeżdżającą się z pierwszą przy każdej
   * zmianie. Tabliczka rysunkowa dorysowywana jest wektorowo, więc metryka zostaje
   * ostra i możliwa do zaznaczenia.
   *
   * SVG zostaje jako osobny przycisk: PDF jest do wydruku i wysyłki, SVG do CAD-u.
   */
  async function zbudujDokument(): Promise<PdfDoc> {
    const node = svgRef.current;
    if (!node) throw new Error("Rysunek nie jest jeszcze gotowy.");
    // Szerokość pola rysunku na kartce A4 poziomo, przeliczona na piksele druku.
    const canvas = await svgDoPlotna(node, Math.round(770 * PIKSELI_NA_PUNKT));
    return buildDrawingDoc({
      tytul: "Schemat jednokreskowy",
      header: docHeader,
      rysunek: await plotnoDoPdf(canvas),
    });
  }

  /** Zgloszenie schematu do kompletu dokumentacji — rysunek rasteryzuje sie z zywego
   *  <svg> tej zakladki, wiec komplet musi ja otworzyc (patrz lib/pdf/rejestr.ts). */
  useEffect(() => zarejestrujProducenta("schemat", zbudujDokument));

  async function pobierzPdf() {
    setPdfTrwa(true);
    try {
      const bytes = await (await zbudujDokument()).finish();
      downloadPdfBytes(bytes, projectFileName("schemat-jednokreskowy", projectName, "pdf"));
    } finally {
      setPdfTrwa(false);
    }
  }

  /**
   * Eksport rysunku do pliku SVG. Schemat jest już wektorem w DOM, więc wystarczy go
   * zserializować — nie ma potrzeby odtwarzania geometrii w generatorze PDF (jak przy
   * legendzie rozdzielnicy), a wynik zostaje w pełni skalowalny i da się go otworzyć
   * w CAD-zie czy wstawić do dokumentacji. Style są zapisane atrybutami prezentacyjnymi
   * wprost na elementach (`stroke`, `fill`…), więc plik jest samowystarczalny bez CSS.
   */
  function exportSvg() {
    const node = svgRef.current;
    if (!node) return;
    const clone = node.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // Rozmiar NATURALNY, nie ten z ekranu — powiększenie w oknie schematu zmienia
    // `width`/`height`, a plik ma wyglądać tak samo niezależnie od tego, jak go oglądano.
    const vb = node.viewBox.baseVal;
    clone.setAttribute("width", String(vb.width));
    clone.setAttribute("height", String(vb.height));
    clone.removeAttribute("style");
    // Białe tło — bez niego rysunek na czarnej kreskce ginie w przeglądarkach
    // i podglądach, które domyślnie renderują SVG na ciemnym tle.
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#fff");
    clone.insertBefore(bg, clone.firstChild);
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), projectFileName("schemat-jednokreskowy", projectName, "svg"));
  }

  // Te same obwody co w Rozdzielnicy — z doborem, nie ze stałymi z `computeCircuits`.
  // Inaczej schemat jednokreskowy pokazywałby inny przekrój niż front rozdzielnicy.
  const { circuits, sized } = useMemo(
    () => computeSizedCircuits(elements, opcjeDoboru, roomShapes),
    [elements, opcjeDoboru, roomShapes]
  );
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  // Ta sama waga bilansu faz co w Rozdzielnicy — inaczej schemat zbudowany przed
  // pierwszym wejściem do tamtej zakładki rozkładałby fazy inaczej niż ona potem.
  const pradyWgKlucza = useMemo(() => pradyWgKluczaAparatu(sized), [sized]);
  /**
   * Aparaty bierzemy z ROZDZIELNICY, nie budujemy własnych.
   *
   * Wcześniej schemat wołał `buildPanelDevices` po swojemu, więc wszystko, co
   * użytkownik zrobił w zakładce Rozdzielnica — dołożone aparaty, skasowane pozycje,
   * kolejność na szynie — nie miało jak trafić na schemat i oba widoki potrafiły
   * pokazywać co innego. Tym bardziej dotyczy to rozdzielnicy składanej ręcznie,
   * bez rzutu: nie ma wtedy obwodów, z których dałoby się cokolwiek odtworzyć.
   *
   * Odbudowa z obwodów zostaje jako zapas dla projektów zapisanych, zanim rozdzielnica
   * zaczęła być trwała, oraz na wypadek, gdyby ktoś w ogóle nie zajrzał do tamtej
   * zakładki — wtedy schemat pokazuje to, co wynika z rzutu.
   */
  const panelDevices = useProjectStore((s) => s.panelDevices);
  const panelTryb = useProjectStore((s) => s.panelTryb);
  const devices = useMemo(
    () => aparatyDoWidoku(panelDevices, panelTryb, () => buildPanelDevices(rcdGroups, { ...panelConfig, pradyWgKlucza })),
    [panelDevices, panelTryb, rcdGroups, panelConfig, pradyWgKlucza]
  );

  const zasilanie = zasilanieRozdzielnicy(panelConfig);
  const mainDevice = devices.find((d) => d.kind === "main");
  const spdDevice = devices.find((d) => d.kind === "spd");
  /** Bezpiecznik stojący szeregowo nad SPD — rysowany w kolumnie SPD, nie jako odejście. */
  const spdBezpiecznik = spdDevice ? rodzicAparatu(spdDevice, devices) : undefined;
  const ppozDevice = devices.find((d) => d.kind === "ppoz");
  const rcdDevices = devices.filter((d) => d.kind === "rcd");
  // Lampka zasilana spod wyłącznika stoi w rzędzie odejść (patrz `Odejscie`); własną
  // kolumnę na szynie głównej ma tylko ta, która nie ma zabezpieczenia.
  const lampkaDevices = devices.filter((d) => d.kind === "lampka" && !rodzicAparatu(d, devices));
  /**
   * Aparaty, które zaczynają odejście: odpływy bez aparatu nad sobą. Aparat zasilany
   * szeregowo (stycznik, CZF…) rysuje się pod swoim zabezpieczeniem, a zabezpieczenie
   * SPD — w kolumnie SPD; żaden z nich nie jest osobnym odejściem z szyny.
   */
  const poczatkiOdejsc = devices.filter((d) => jestOdplywem(d) && !rodzicAparatu(d, devices) && d !== spdBezpiecznik);
  const liczbaObwodow = poczatkiOdejsc.length;

  /**
   * Grupy różnicówek wyprowadzone z SAMYCH APARATÓW (po `rcdTag`), a nie z obwodów
   * policzonych z rzutu. To ta sama zasada grupowania, po której widok czołowy
   * rozdzielnicy rysuje klamry „zasięg różnicówki" — jedno źródło prawdy zamiast dwóch.
   *
   * Bez tego rozdzielnica złożona ręcznie dawała pusty schemat: nie ma rzutu, więc nie
   * ma obwodów, więc nie było z czego zbudować kolumn.
   */
  const rcdBlocks: RcdBlock[] = rcdDevices.map((rcd) => ({
    device: rcd,
    liscie: liscieOdejsc(
      poczatkiOdejsc.filter((d) => d.rcdTag === rcd.tag),
      devices
    ),
  }));

  // Wyłączniki spoza zasięgu jakiejkolwiek różnicówki idą wprost z szyny głównej —
  // to normalny układ (np. obwód przeciwpożarowy), a wcześniej takie aparaty po
  // prostu znikały ze schematu.
  const pozaRcd = poczatkiOdejsc.filter((d) => !rcdDevices.some((r) => r.tag === d.rcdTag));
  if (pozaRcd.length) rcdBlocks.push({ device: undefined, liscie: liscieOdejsc(pozaRcd, devices) });

  // Sam ogranicznik przepięć też jest czym zacząć rysunek — ma własną kolumnę pod szyną.
  const pusty = !mainDevice || (rcdBlocks.every((b) => b.liscie.length === 0) && lampkaDevices.length === 0 && !spdDevice);
  if (pusty) {
    return (
      <div className="pe-card p-8 text-center">
        <h2 className="pe-display mb-2 text-xl">Schemat instalacji (jednokreskowy)</h2>
        <p className="mx-auto max-w-lg text-sm text-slate-500">
          Schemat powstaje z aparatów rozdzielnicy. Rozstaw elementy w zakładce „Instalacja” albo złóż
          rozdzielnicę ręcznie w zakładce „Rozdzielnica” — rysunek pojawi się tu sam.
        </p>
      </div>
    );
  }

  // --- Layout: kolumny od lewej — SPD (jeśli skonfigurowany), potem każda grupa RCD
  //     z jej obwodami rozłożonymi równomiernie. Szerokość i wysokość liczone z danych,
  //     nie ze sztywnych stałych — schemat ma wyglądać dobrze przy 3 i przy 30 obwodach.
  /*
   * Kolumny w KOLEJNOŚCI Z FRONTU rozdzielnicy — po pozycji pierwszego aparatu kolumny
   * na liście. Wcześniej schemat zawsze rysował SPD, lampki, różnicówki, a na końcu
   * odejścia bez różnicówki, niezależnie od tego, jak stały na szynie — czujnik tuż za
   * Q1 lądował na prawym końcu rysunku (audyt rozdzielnicy 15.11.2026, pkt 13).
   */
  const pozycja = (d: PanelDevice | undefined) => (d ? devices.indexOf(d) : Infinity);
  const kandydaci: (Omit<Column, "x0" | "cx"> & { kotwica: number })[] = [];
  if (spdDevice) kandydaci.push({ kind: "spd", width: SPD_COL_W, kotwica: Math.min(pozycja(spdDevice), pozycja(spdBezpiecznik)) });
  lampkaDevices.forEach((device) => kandydaci.push({ kind: "lampka", width: LAMPKA_COL_W, device, kotwica: pozycja(device) }));
  rcdBlocks.forEach((block) =>
    kandydaci.push({
      kind: "rcd",
      width: Math.max(block.liscie.length * LEAF_W, RCD_MIN_W),
      block,
      kotwica: block.device ? pozycja(block.device) : Math.min(...block.liscie.map((l) => pozycja(l.aparat))),
    })
  );
  const columns: Column[] = [];
  let cursorX = LEFT_X;
  kandydaci
    .sort((a, b) => a.kotwica - b.kotwica)
    .forEach(({ kotwica: _k, ...k }) => {
      void _k;
      columns.push({ ...k, x0: cursorX, cx: cursorX + k.width / 2 });
      cursorX += k.width + GROUP_GAP;
    });

  const width = Math.max(760, cursorX - GROUP_GAP + MARGIN_X);
  const busX0 = columns[0].cx;
  const busX1 = columns[columns.length - 1].cx;
  const mainX = (busX0 + busX1) / 2;
  /** Zaciski listwy X1 — kolejno w odejściach wychodzących z rozdzielnicy, od lewej.
   *  Lampka i CZF pod wyłącznikiem zostają w rozdzielnicy, więc zacisku nie dostają. */
  const zaciski = new Map<Lisc, string>();
  columns.forEach((col) => col.block?.liscie.forEach((l) => !bezOdczepuPe(l) && zaciski.set(l, `X1:${zaciski.size + 1}`)));
  const s = siatka(!!ppozDevice, rcdBlocks.some((b) => b.liscie.some((l) => l.szeregowy)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="pe-display mb-1 text-xl">Schemat instalacji (jednokreskowy)</h2>
          <p className="text-sm text-slate-500">
            {/* Liczby z APARATÓW, tak jak sam rysunek — nie z obwodów policzonych z rzutu
                (po usunięciu aparatu w Rozdzielnicy nagłówek mówił dalej „11 obwodów").
                Różnicówki to prawdziwe aparaty RCD, bez umownej grupy „poza różnicówką". */}
            Generowany automatycznie z obwodów rozdzielnicy — {zLiczba(liczbaObwodow, "obwód", "obwody", "obwodów")},{" "}
            {zLiczba(rcdDevices.length, "różnicówka", "różnicówki", "różnicówek")}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPodglad(true)} title="Zobacz, jak wyjdzie na kartce">
            <Eye size={13} /> Podgląd PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={exportSvg} title="Zapisz rysunek jako plik SVG (wektor)">
            <Download size={13} /> Eksportuj SVG
          </Button>
          <Button
            variant="copper"
            size="sm"
            onClick={pobierzPdf}
            disabled={pdfTrwa}
            title="Zapisz rysunek jako PDF (A4 poziomo, z tabliczką rysunkową)"
          >
            <FileText size={13} /> Eksportuj PDF
          </Button>
        </div>

        <PdfPreview
          open={podglad}
          onOpenChange={setPodglad}
          title="Schemat jednokreskowy"
          filename={projectFileName("schemat-jednokreskowy", projectName, "pdf")}
          build={async () => (await zbudujDokument()).finish()}
        />
      </div>

      <OknoRysunku szerokosc={width} wysokosc={s.SCHEMA_HEIGHT} svgRef={svgRef} srodekStartowyX={mainX}>
          <IncomingSupply
            x={mainX}
            supply3f={panelConfig.supply3f}
            uklad={zasilanie.uklad}
            przedlicznikowe={zasilanie.przedlicznikowe}
            ppoz={!!ppozDevice}
            s={s}
          />
          {ppozDevice && <RozlacznikPpoz x={mainX} device={ppozDevice} s={s} />}
          <ZrodloPe mainX={mainX} uklad={zasilanie.uklad} s={s} />
          <MainSwitch x={mainX} device={mainDevice} s={s} />

          <line x1={mainX} y1={s.Y_SWITCH_BOT} x2={mainX} y2={s.Y_BUS} stroke={STROKE} strokeWidth={LINE_W} />
          <line x1={busX0} y1={s.Y_BUS} x2={busX1} y2={s.Y_BUS} stroke={STROKE} strokeWidth={LINE_W} />

          {columns.map((col) =>
            col.kind === "spd" && spdDevice ? (
              <SpdBranch key="spd" col={col} device={spdDevice} bezpiecznik={spdBezpiecznik} s={s} />
            ) : col.kind === "lampka" && col.device ? (
              <LampkaBranch key={col.device.uid} col={col} device={col.device} s={s} />
            ) : col.block ? (
              <g key={col.block.device?.uid ?? `bez-rcd-${col.x0}`}>
                {col.block.device ? (
                  <RcdBranch col={col} device={col.block.device} s={s} />
                ) : (
                  // Odejścia spoza zasięgu różnicówki (np. obwód przeciwpożarowy) idą
                  // WPROST z szyny głównej — bez RCD nie ma tu żadnego symbolu, który
                  // sam narysowałby ten odcinek (RCD/SPD robią to jako część własnego
                  // glifu), więc bez tej kreski wyłącznik wisiałby w powietrzu,
                  // odcięty od szyny głównej powyżej.
                  <line x1={col.cx} y1={s.Y_BUS} x2={col.cx} y2={s.Y_SUBBUS} stroke={STROKE} strokeWidth={LINE_W} />
                )}
                {(() => {
                  // Szyna podrzędna łączy wyjście różnicówki (oś kolumny) z WYŁĄCZNIKAMI —
                  // nie z każdym odejściem: aparaty szeregowe dostają zasilanie spod swojego
                  // wyłącznika, nie stąd. Przy jednym wyłączniku z kilkoma odejściami stoi on
                  // nad pierwszym z nich, czyli z boku osi — szyna musi do niego dojść.
                  const xs = col.block.liscie.flatMap((l, i) => (l.pierwszy ? [circuitX(col, i)] : []));
                  const x1 = Math.min(col.cx, ...xs);
                  const x2 = Math.max(col.cx, ...xs);
                  return x2 > x1 ? <line x1={x1} y1={s.Y_SUBBUS} x2={x2} y2={s.Y_SUBBUS} stroke={STROKE} strokeWidth={LINE_W} /> : null;
                })()}
                {col.block.liscie.map((l, i) => (
                  <Odejscie key={`${l.aparat.uid}-${l.szeregowy?.uid ?? ""}`} x={circuitX(col, i)} lisc={l} zacisk={zaciski.get(l)} s={s} />
                ))}
              </g>
            ) : null
          )}

          {/* Rysowane po odejściach, żeby poziome szyny biegły ciągłą kreską po ich wierzchu,
              a kropki połączeniowe PE leżały na wierzchu szyny, nie pod nią. */}
          <ProtectiveBuses width={width} columns={columns} s={s} />
          <PeTaps columns={columns} s={s} />

          <FinalCircuitsTable columns={columns} s={s} />
          <UwagiSchematu uklad={zasilanie.uklad} dane={daneRozdzielnicy(panelConfig, zasilanie.uklad)} s={s} />
      </OknoRysunku>
    </div>
  );
}

/**
 * Okno schematu: rysunek w przewijanym pojemniku plus powiększenie.
 *
 * Schemat otwiera się w NATURALNYM rozmiarze, wycentrowany na wyłączniku głównym —
 * na każdej szerokości, na której rysunek się nie mieści (telefon, tablet w pionie).
 * Na tablecie 768–820 px startował wcześniej od lewej krawędzi i Q1 był przecięty
 * prawą krawędzią okienka; tam, gdzie rysunek się mieści, przewinięcie i tak wynosi 0.
 *
 * Na telefonie wcześniej otwierał się dopasowany do szerokości: 24%, napisy po 2,5 px,
 * okienko 140 px wysokości — miniatura, z której nie dało się odczytać niczego, a do
 * czytelnego rozmiaru trzeba było siedmiu stuknięć w „+". Całość jest o jedno
 * stuknięcie dalej, pod „Dopasuj". Jeszcze wcześniej 100% startowało od LEWEJ krawędzi
 * i pokazywało pustą górną połowę bez rozdzielnicy głównej — stąd środek na wyłączniku.
 *
 * Na monitorze rysunek mieści się w 100%, jak dotąd. W obu przypadkach dochodzą
 * przyciski −/+ i „Dopasuj", a na dotyku szczypanie (patrz `usePowiekszanieRysunku`).
 *
 * Osobny komponent, bo hook potrzebuje szerokości rysunku, a ta jest znana dopiero
 * po wczesnym `return` pustego schematu w `SchemaTab`.
 *
 * Powiększenie zmienia tylko `width`/`height` na ekranie. Eksport SVG przywraca rozmiar
 * naturalny, a raster do PDF-a i tak ustawia własny (`svgDoPlotna`).
 */
function OknoRysunku({
  szerokosc,
  wysokosc,
  svgRef,
  srodekStartowyX,
  children,
}: {
  szerokosc: number;
  wysokosc: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** Wyłącznik główny — staje na środku okienka, gdy rysunek jest od niego szerszy. */
  srodekStartowyX: number;
  children: React.ReactNode;
}) {
  // Na monitorze rysunek mieści się w okienku i stał w 100% przy lewej krawędzi —
  // obok 190 px (1440) do 670 px (1920) pustki, a opisy obwodów po 7,5 px. Teraz rośnie
  // do szerokości okienka (najwyżej 140%) i stoi pośrodku. Tam, gdzie się nie mieści
  // (telefon, tablet w pionie), start jak dotąd: 100% z wyłącznikiem na środku.
  const p = usePowiekszanieRysunku(szerokosc, "powiekszaj", srodekStartowyX, 1.4);
  return (
    <div className="space-y-2">
      <PrzyciskiPowiekszenia p={p} nazwa={{ dopelniacz: "schematu", biernik: "schemat" }} />
      <div
        ref={p.kontenerRef}
        data-testid="schemat-okno"
        // Przewijany obszar musi dać się obsłużyć z klawiatury: bez `tabIndex` kto nie ma
        // myszy ani palca, nie przewinie powiększonego schematu (WCAG 2.1.1).
        tabIndex={0}
        role="region"
        aria-label="Schemat jednokreskowy — obszar przewijany"
        className="pe-card pe-scroll overflow-auto p-4"
        // `pan-x pan-y`: jeden palec przewija pojemnik, ale szczypanie nie powiększa
        // CAŁEJ strony — to bierze `usePowiekszanieRysunku`.
        // `maxHeight`: powiększony schemat przesuwa się w pionie WEWNĄTRZ okienka.
        // Bez limitu okienko rosło razem z rysunkiem i rozpychało stronę — a wtedy
        // punkt spod palców uciekał w pionie, bo nie było czego przewinąć.
        style={{ background: "#fff", touchAction: "pan-x pan-y", maxHeight: "70vh" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${szerokosc} ${wysokosc}`}
          width={szerokosc * p.zoom}
          height={wysokosc * p.zoom}
          style={{ display: "block", margin: "0 auto" }}
        >
          {children}
        </svg>
      </div>
    </div>
  );
}
