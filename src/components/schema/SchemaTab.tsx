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
import { CadGlyph, GLYPHS, labelOffset, LINE_W, STROKE } from "./deviceGlyphs";
import { computeRcdGroups } from "@/lib/panel/circuits";
import { computeSizedCircuits } from "@/lib/panel/project";
import { buildPanelDevices, PHASE_COLORS } from "@/lib/panel/devices";
import type { PanelDevice } from "@/types";
import { waskiEkran } from "@/lib/design";
import { usePowiekszanieRysunku } from "@/hooks/usePowiekszanieRysunku";
import { PrzyciskiPowiekszenia } from "@/components/ui/PrzyciskiPowiekszenia";

const MUTED = "#6B7684";

const LEAF_W = 96;
const RCD_MIN_W = 130;
const SPD_COL_W = 108;
const LAMPKA_COL_W = 90;
const GROUP_GAP = 50;
const MARGIN_X = 50;

// Siatka pionowa schematu — jedna wspólna skala dla wszystkich gałęzi, żeby aparaty
// tego samego rzędu (np. wszystkie RCD, wszystkie wyłączniki obwodów) leżały na tej
// samej wysokości niezależnie od tego, ile mają obwodów czy jak długie mają opisy.
//
// Wysokości gniazd na aparaty (MAIN_H/BRANCH_H/MCB_H) są dobrane pod symbole CAD
// użytkownika: to one, a nie odwrotnie, wyznaczają skalę rysunku, bo rozciągnięte na
// zbyt małą wysokość gubiłyby czytelność detali (przekładnik RCD, strzałka SPD).
// Oznaczenie faz stoi nad grotem zasilania, więc siatka zaczyna się od niego,
// a nie od samej strzałki — inaczej napis wychodziłby poza górną krawędź rysunku.
const Y_PHASES = 11;
const Y_ARROW = 20;
const Y_SWITCH_TOP = Y_ARROW + 22;
const MAIN_H = 60;
const Y_SWITCH_BOT = Y_SWITCH_TOP + MAIN_H;
const Y_BUS = Y_SWITCH_BOT + 26;
const BRANCH_H = 110;
const SPD_H = 84;
const Y_SUBBUS = Y_BUS + BRANCH_H;
const Y_MCB_TOP = Y_SUBBUS + 20;
const MCB_H = 26;
const Y_MCB_BOTTOM = Y_MCB_TOP + MCB_H;
// Szyny ochronna i neutralna — poziome przewody wspólne dla wszystkich odejść,
// przecinające je pod wyłącznikami (jak na rysunku referencyjnym od użytkownika).
// Przewód obwodu musi kończyć się PONIŻEJ obu, inaczej wyglądałby na urwany nad nimi.
const Y_N_BUS = Y_MCB_BOTTOM + 26;
const Y_PE_BUS = Y_N_BUS + 12;
const Y_WIRE_END = Y_PE_BUS + 10;
const Y_TERMINAL_TEXT = Y_WIRE_END + 14;
// Uziemienie SPD zaczyna się pod symbolem — nie jest częścią pliku użytkownika,
// bo należy do topologii schematu, a nie do samego aparatu.
const Y_SPD_BOTTOM = Y_BUS + SPD_H;
const Y_SPD_GROUND = Y_SPD_BOTTOM + 12;
// Lampka sygnalizacyjna stoi w TYM SAMYM rzędzie co RCD/SPD (odejście wprost z szyny
// głównej), nie w rzędzie wyłączników obwodowych — stąd własna wysokość zaczepiona o
// Y_BUS, a nie o Y_SUBBUS. W odróżnieniu od SPD i zwykłych obwodów układ KOŃCZY SIĘ
// na symbolu — bez przewodu do szyn N/PE i bez odczepu PE (patrz `circuitXs`): to sam
// obwód zasilający lampkę ma je zapewnić, nie schemat rozdzielnicy. Wysokość liczona
// tak, żeby okrąg wyszedł tej samej wielkości co przy pudełku SPD (`SPD_H`), ale bez
// pustego marginesu pod nim — glif lampki (patrz `GLYPHS.lampka`) kończy się na
// dolnej krawędzi okręgu (66/100 wysokości źródłowej), nie na umownej siatce 0–100.
const LAMPKA_H = Math.round((SPD_H * 66) / 100);
const Y_LAMPKA_BOTTOM = Y_BUS + LAMPKA_H;

const MCB_LABEL_DX = labelOffset(GLYPHS.mcb, Y_SUBBUS, Y_MCB_BOTTOM);
// Odsunięcie etykiety przy symbolu zastępczym (GLYPHS.generic) — liczone osobno, bo ta
// ramka jest węższa niż glif MCB, więc ten sam MCB_LABEL_DX zostawiałby zbędną pustkę.
const GENERIC_LABEL_DX = labelOffset(GLYPHS.generic, Y_SUBBUS, Y_MCB_BOTTOM);
// Rozłącznik izolacyjny bezpiecznikowy — jeden wspólny odsuw dla obu wariantów
// (3-fazowego i 1-fazowego): różni je tylko liczba kresek wkładki wewnątrz, oś i
// najdalej wysunięty w prawo punkt (`rightX`) są identyczne w obu plikach źródłowych.
const ROZBEZP_LABEL_DX = labelOffset(GLYPHS.rozBezp3f, Y_SUBBUS, Y_MCB_BOTTOM);

// Tabela odpływów końcowych pod schematem — tylko obwody (nie W1/SPD/RCD), każda
// komórka dokładnie pod swoją gałęzią powyżej (te same współrzędne x co CircuitBranch).
const TABLE_GAP = 24;
const TABLE_TOP = Y_TERMINAL_TEXT + TABLE_GAP;
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
const TABLE_MID = TABLE_TOP + TABLE_TAG_H;
const TABLE_PHASE_BOTTOM = TABLE_MID + TABLE_PHASE_H;
const TABLE_BOTTOM = TABLE_PHASE_BOTTOM + TABLE_NAME_H;
const SCHEMA_HEIGHT = TABLE_BOTTOM + 14;

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
  const bieguny = device.poles?.trim();
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
 * Wejście zasilania: oznaczenie faz, grot i przewód do rozłącznika. Fazy wypisane z
 * nazwy, a nie jako „3-fazowe" — na schemacie liczy się, KTÓRE przewody dochodzą, bo
 * to one są potem rozdzielane na obwody jednofazowe (patrz bilans faz w Rozdzielnicy).
 */
function IncomingSupply({ x, supply3f }: { x: number; supply3f: boolean }) {
  return (
    <g id="incoming-supply">
      <text x={x} y={Y_PHASES} fontSize={9.5} textAnchor="middle" fill={STROKE}>
        {supply3f ? "L1, L2, L3" : "L1"}
      </text>
      <polygon points={`${x - 4},${Y_ARROW} ${x + 4},${Y_ARROW} ${x},${Y_ARROW + 9}`} fill={STROKE} />
      <line x1={x} y1={Y_ARROW + 9} x2={x} y2={Y_SWITCH_TOP} stroke={STROKE} strokeWidth={LINE_W} />
    </g>
  );
}

/** Rozłącznik izolacyjny główny — symbol wgrany przez użytkownika (Q1.svg), z opisem obok. */
function MainSwitch({ x, device }: { x: number; device: PanelDevice }) {
  const dx = labelOffset(GLYPHS.main, Y_SWITCH_TOP, Y_SWITCH_BOT, 16);
  return (
    <g id="main-switch">
      <CadGlyph spec={GLYPHS.main} x={x} top={Y_SWITCH_TOP} bottom={Y_SWITCH_BOT} />
      <text x={x + dx} y={Y_SWITCH_TOP + 9} fontSize={11.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={Y_SWITCH_TOP + 22} fontSize={10} fill={STROKE}>
        {opisZBiegunami(device)}
      </text>
      <text x={x + dx} y={Y_SWITCH_TOP + 34} fontSize={8.5} fill={MUTED}>
        {truncate(device.caption, 28)}
      </text>
    </g>
  );
}

/** Ogranicznik przepięć — symbol wgrany przez użytkownika (SPD.svg) plus uziemienie. */
function SpdBranch({ col, device }: { col: Column; device: PanelDevice }) {
  const x = col.cx;
  const dx = labelOffset(GLYPHS.spd, Y_BUS, Y_SPD_BOTTOM);
  return (
    <g id="spd">
      <CadGlyph spec={GLYPHS.spd} x={x} top={Y_BUS} bottom={Y_SPD_BOTTOM} />
      <line x1={x} y1={Y_SPD_BOTTOM} x2={x} y2={Y_SPD_GROUND} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 9} y1={Y_SPD_GROUND} x2={x + 9} y2={Y_SPD_GROUND} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 6} y1={Y_SPD_GROUND + 4} x2={x + 6} y2={Y_SPD_GROUND + 4} stroke={STROKE} strokeWidth={LINE_W} />
      <line x1={x - 3} y1={Y_SPD_GROUND + 8} x2={x + 3} y2={Y_SPD_GROUND + 8} stroke={STROKE} strokeWidth={LINE_W} />

      <text x={x + dx} y={Y_BUS + 44} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={Y_BUS + 56} fontSize={9} fill={MUTED}>
        {opisZBiegunami(device)}
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
function LampkaBranch({ col, device }: { col: Column; device: PanelDevice }) {
  const x = col.cx;
  const dx = labelOffset(GLYPHS.lampka, Y_BUS, Y_LAMPKA_BOTTOM);
  return (
    <g id={`lampka-${device.tag}`}>
      <CadGlyph spec={GLYPHS.lampka} x={x} top={Y_BUS} bottom={Y_LAMPKA_BOTTOM} />
      <text x={x + dx} y={Y_BUS + 34} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={Y_BUS + 46} fontSize={9} fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
    </g>
  );
}

/** Wyłącznik różnicowoprądowy — symbol wgrany przez użytkownika (RCD.svg). */
function RcdBranch({ col, device }: { col: Column; device: PanelDevice }) {
  const x = col.cx;
  const dx = labelOffset(GLYPHS.rcd, Y_BUS, Y_SUBBUS);
  return (
    <g id={`rcd-${device.tag}`}>
      <CadGlyph spec={GLYPHS.rcd} x={x} top={Y_BUS} bottom={Y_SUBBUS} />
      <text x={x + dx} y={Y_BUS + 34} fontSize={10.5} fontWeight={700} fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + dx} y={Y_BUS + 46} fontSize={9} fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
    </g>
  );
}

/**
 * Szyny PE i N — poziome przewód ochronny i neutralny, wspólne dla wszystkich odejść.
 * Na schemacie jednokreskowym pojedyncza kreska obwodu reprezentuje komplet żył, więc
 * szyny przecinają odejścia bez kropek połączeniowych (tak jak na rysunku referencyjnym).
 * Opisy stoją z lewej strony, w marginesie rysunku, żeby nie wchodziły na żaden obwód.
 */
function ProtectiveBuses({ width }: { width: number }) {
  const x1 = MARGIN_X;
  const x2 = width - MARGIN_X;
  return (
    <g id="pe-n-buses">
      {[
        { y: Y_N_BUS, label: "N", dash: undefined },
        // PE kreską przerywaną — odróżnia przewód ochronny od neutralnego na wydruku
        // czarno-białym, gdzie kolor nie niesie żadnej informacji.
        { y: Y_PE_BUS, label: "PE", dash: "6 3" },
      ].map(({ y, label, dash }) => (
        <g key={label}>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={STROKE} strokeWidth={LINE_W} strokeDasharray={dash} />
          <text x={x1 - 6} y={y + 3.5} fontSize={9} fontWeight={700} textAnchor="end" fill={STROKE}>
            {label}
          </text>
        </g>
      ))}
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
function PeTaps({ columns }: { columns: Column[] }) {
  return (
    <g id="pe-taps">
      {circuitXs(columns).map((cx) => (
        <g key={cx}>
          <line
            x1={cx - PE_TAP_DX}
            y1={Y_PE_BUS}
            x2={cx}
            y2={Y_PE_BUS + PE_TAP_DY}
            stroke={STROKE}
            strokeWidth={LINE_W}
          />
          <circle cx={cx - PE_TAP_DX} cy={Y_PE_BUS} r={2} fill={STROKE} />
        </g>
      ))}
    </g>
  );
}

/**
 * Czy aparat rysujemy jako gałąź odpływową pod szyną (MCB, RCBO, stycznik…).
 * Wyklucza aparaty, które mają już własne, osobne miejsce na schemacie (main/spd/rcd/
 * lampka) oraz `blank` — zaślepka nie jest prawdziwym aparatem, nie ma czego rysować.
 * Wcześniej ten filtr sprawdzał wyłącznie `kind === "mcb"`, więc cały reszta katalogu
 * (stycznik, przekaźnik, zasilacz, lampka, CZF, rozłącznik ppoż, RCBO…) po prostu
 * znikała ze schematu bez żadnego ostrzeżenia. Lampka dostała WŁASNE miejsce (patrz
 * `LampkaBranch`) zamiast rzędu wyłączników obwodowych, więc wypadła z tego filtru tak
 * samo jak main/spd/rcd.
 */
/** „1 obwód", „3 obwody", „12 obwodów", „22 obwody" — polska odmiana liczebnika. */
function odmiana(n: number, jeden: string, kilka: string, wiele: string): string {
  if (n === 1) return `1 ${jeden}`;
  const d = n % 10;
  const s = n % 100;
  return `${n} ${d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? kilka : wiele}`;
}

function jestOdplywem(d: PanelDevice): boolean {
  return d.kind !== "main" && d.kind !== "spd" && d.kind !== "rcd" && d.kind !== "blank" && d.kind !== "lampka";
}

/** Jeden obwód odbiorczy: wyłącznik nadprądowy (symbol MCB użytkownika), znacznik przewodu i nazwa odbiornika. */
function CircuitBranch({ x, device }: { x: number; device: PanelDevice }) {
  // Wyłącznik nadprądowy i rozłącznik izolacyjny bezpiecznikowy mają symbol
  // odwzorowany z pliku CAD — reszta katalogu (stycznik, przekaźnik, zasilacz,
  // CZF, rozłącznik ppoż…) dostaje na razie symbol zastępczy (patrz komentarz przy
  // GLYPHS.generic w deviceGlyphs.tsx), żeby nic już nie znikało po cichu ze
  // schematu, tak jak wcześniej. Rozłącznik bezpiecznikowy ma DWA warianty symbolu
  // (liczba kresek wkładki) — wybrane po liczbie biegunów aparatu, nie po zasilaniu
  // całej rozdzielnicy, bo to jego WŁASNA nastawa (tak jak przy MCB).
  const isMcb = device.kind === "mcb";
  const isRozBezp = device.kind === "rozBezp";
  const spec = isMcb ? GLYPHS.mcb : isRozBezp ? (device.poles === "3P" ? GLYPHS.rozBezp3f : GLYPHS.rozBezp1f) : GLYPHS.generic;
  const labelDx = isMcb ? MCB_LABEL_DX : isRozBezp ? ROZBEZP_LABEL_DX : GENERIC_LABEL_DX;
  return (
    <g id={`circuit-${device.tag}`}>
      <CadGlyph spec={spec} x={x} top={Y_SUBBUS} bottom={Y_MCB_BOTTOM} />
      <line x1={x} y1={Y_MCB_BOTTOM} x2={x} y2={Y_WIRE_END} stroke={STROKE} strokeWidth={LINE_W} />

      {/* Tag i wartość zabezpieczenia (B10/B16…) stoją RAZEM z prawej strony symbolu —
          tag nad wartością, tak jak przy pozostałych aparatach (RcdBranch, SpdBranch,
          MainSwitch). Wcześniej tag wisiał osobno nad glifem, a wartość osobno obok,
          więc nie czytało się ich jako pary. Obie linie odsunięte o labelDx od osi
          przewodu, żeby ominąć najszerszy punkt glifu (strzałka wyzwalacza sięga ok.
          +20px od osi na tej wysokości) — żadna już nie leży na przewodzie, więc bez
          białej „poświaty" pod spodem (była potrzebna tylko, gdy tag siedział na kresce). */}
      <text x={x + labelDx} y={Y_MCB_TOP + MCB_H / 2 - 4} fontSize={9.5} fontWeight={700} textAnchor="start" fill={STROKE}>
        {device.tag}
      </text>
      <text x={x + labelDx} y={Y_MCB_TOP + MCB_H / 2 + 8} fontSize={8.5} fontWeight={700} textAnchor="start" fill={MUTED}>
        {opisZBiegunami(device)}
      </text>
      {/* Nazwa odbiornika celowo NIE jest powtarzana tutaj — stoi w tabeli odpływów pod
          schematem, dokładnie w tej samej kolumnie. Wcześniej była w obu miejscach, w obu
          ucięta, więc zajmowała miejsce nic nie wnosząc. Przy gałęzi zostaje sam typ
          przewodu, czyli informacja, której w tabeli nie ma. */}
      {device.cable && (
        <text x={x} y={Y_TERMINAL_TEXT} fontSize={7.5} textAnchor="middle" fill={MUTED}>
          {truncate(device.cable, 20)}
        </text>
      )}
    </g>
  );
}

interface RcdBlock {
  /** Różnicówka nad grupą. `undefined` dla wyłączników wychodzących wprost z szyny
   *  głównej — układ normalny, np. obwód przeciwpożarowy poza zasięgiem RCD. */
  device?: PanelDevice;
  mcbs: PanelDevice[];
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
  const n = col.block?.mcbs.length ?? 0;
  return col.x0 + (col.width - n * LEAF_W) / 2 + LEAF_W * (i + 0.5);
}

function circuitXs(columns: Column[]): number[] {
  const out: number[] = [];
  columns.forEach((col) => {
    // Lampka NIE dostaje odczepu PE — układ kończy się na jej symbolu, nie ciągnie
    // się do szyn N/PE (patrz `LampkaBranch`), więc nie ma czego odczepiać.
    if (col.kind !== "rcd" || !col.block) return;
    col.block.mcbs.forEach((_, i) => out.push(circuitX(col, i)));
  });
  return out;
}

/**
 * Tabela pod schematem — wyłącznie odpływy końcowe (obwody), bez W1/SPD/RCD.
 * Rysowana w tym samym układzie współrzędnych co gałęzie obwodów powyżej, więc
 * każda komórka wypada dokładnie pod swoim wyłącznikiem — nie osobny HTML-owy
 * `<table>`, którego szerokości kolumn musiałyby być ręcznie zsynchronizowane z SVG.
 */
function FinalCircuitsTable({ columns }: { columns: Column[] }) {
  return (
    <g id="final-circuits-table">
      {columns.map((col) => {
        if (col.kind !== "rcd" || !col.block || col.block.mcbs.length === 0) return null;
        const { mcbs } = col.block;
        // Komórki wychodzą od tej samej funkcji co gałęzie powyżej, więc każda wypada
        // dokładnie pod swoim wyłącznikiem bez osobnego przeliczania układu.
        const left = circuitX(col, 0) - LEAF_W / 2;
        const right = left + mcbs.length * LEAF_W;
        return (
          <g key={col.block.device?.uid ?? `bez-rcd-${col.x0}`}>
            <line x1={left} y1={TABLE_TOP} x2={right} y2={TABLE_TOP} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={TABLE_MID} x2={right} y2={TABLE_MID} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={TABLE_PHASE_BOTTOM} x2={right} y2={TABLE_PHASE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={left} y1={TABLE_BOTTOM} x2={right} y2={TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            <line x1={right} y1={TABLE_TOP} x2={right} y2={TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
            {mcbs.map((mcb, i) => {
              const cellLeft = left + LEAF_W * i;
              const cx = cellLeft + LEAF_W / 2;
              return (
                <g key={mcb.uid}>
                  <line x1={cellLeft} y1={TABLE_TOP} x2={cellLeft} y2={TABLE_BOTTOM} stroke={STROKE} strokeWidth={LINE_W} />
                  <text x={cx} y={TABLE_TOP + 13} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={STROKE}>
                    {mcb.tag}
                  </text>
                  {/* Faza obwodu. „3F" dla odbiorników trójfazowych, L1/L2/L3 dla
                      jednofazowych; kolor wg PN-HD 308 S2, ten sam co na widoku
                      czołowym rozdzielnicy — żeby oznaczenie na schemacie i w szafce
                      czytało się jako jedno i to samo. */}
                  <text
                    x={cx}
                    y={TABLE_MID + 11}
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
                        <tspan x={cx} y={l2 ? TABLE_PHASE_BOTTOM + 11 : TABLE_PHASE_BOTTOM + 16}>
                          {l1}
                        </tspan>
                        {l2 && (
                          <tspan x={cx} y={TABLE_PHASE_BOTTOM + 21}>
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
  const { circuits } = useMemo(
    () => computeSizedCircuits(elements, opcjeDoboru, roomShapes),
    [elements, opcjeDoboru, roomShapes]
  );
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
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
  const devices = useMemo(
    () => (panelDevices.length ? panelDevices : buildPanelDevices(rcdGroups, panelConfig)),
    [panelDevices, rcdGroups, panelConfig]
  );

  const mainDevice = devices.find((d) => d.kind === "main");
  const spdDevice = devices.find((d) => d.kind === "spd");
  const rcdDevices = devices.filter((d) => d.kind === "rcd");
  const lampkaDevices = devices.filter((d) => d.kind === "lampka");
  const liczbaObwodow = devices.filter(jestOdplywem).length;

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
    mcbs: devices.filter((d) => jestOdplywem(d) && d.rcdTag === rcd.tag),
  }));

  // Wyłączniki spoza zasięgu jakiejkolwiek różnicówki idą wprost z szyny głównej —
  // to normalny układ (np. obwód przeciwpożarowy), a wcześniej takie aparaty po
  // prostu znikały ze schematu.
  const pozaRcd = devices.filter(
    (d) => jestOdplywem(d) && !rcdDevices.some((r) => r.tag === d.rcdTag)
  );
  if (pozaRcd.length) rcdBlocks.push({ device: undefined, mcbs: pozaRcd });

  const pusty = !mainDevice || (rcdBlocks.every((b) => b.mcbs.length === 0) && lampkaDevices.length === 0);
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
  const columns: Column[] = [];
  let cursorX = MARGIN_X;
  if (spdDevice) {
    columns.push({ kind: "spd", width: SPD_COL_W, x0: cursorX, cx: cursorX + SPD_COL_W / 2 });
    cursorX += SPD_COL_W + GROUP_GAP;
  }
  // Lampki stoją obok SPD, w tym samym rzędzie (odejście wprost z szyny głównej) —
  // przed grupami RCD, tak jak SPD, bo to też ochrona/sygnalizacja całej rozdzielnicy,
  // nie pojedynczy obwód odbiorczy.
  lampkaDevices.forEach((device) => {
    columns.push({ kind: "lampka", width: LAMPKA_COL_W, x0: cursorX, cx: cursorX + LAMPKA_COL_W / 2, device });
    cursorX += LAMPKA_COL_W + GROUP_GAP;
  });
  rcdBlocks.forEach((block) => {
    const w = Math.max(block.mcbs.length * LEAF_W, RCD_MIN_W);
    columns.push({ kind: "rcd", width: w, x0: cursorX, cx: cursorX + w / 2, block });
    cursorX += w + GROUP_GAP;
  });

  const width = Math.max(760, cursorX - GROUP_GAP + MARGIN_X);
  const busX0 = columns[0].cx;
  const busX1 = columns[columns.length - 1].cx;
  const mainX = (busX0 + busX1) / 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="pe-display mb-1 text-xl">Schemat instalacji (jednokreskowy)</h2>
          <p className="text-sm text-slate-500">
            {/* Liczby z APARATÓW, tak jak sam rysunek — nie z obwodów policzonych z rzutu
                (po usunięciu aparatu w Rozdzielnicy nagłówek mówił dalej „11 obwodów").
                Różnicówki to prawdziwe aparaty RCD, bez umownej grupy „poza różnicówką". */}
            Generowany automatycznie z obwodów rozdzielnicy — {odmiana(liczbaObwodow, "obwód", "obwody", "obwodów")},{" "}
            {odmiana(rcdDevices.length, "różnicówka", "różnicówki", "różnicówek")}.
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

      <OknoRysunku szerokosc={width} wysokosc={SCHEMA_HEIGHT} svgRef={svgRef}>
          <IncomingSupply x={mainX} supply3f={panelConfig.supply3f} />
          <MainSwitch x={mainX} device={mainDevice} />

          <line x1={mainX} y1={Y_SWITCH_BOT} x2={mainX} y2={Y_BUS} stroke={STROKE} strokeWidth={LINE_W} />
          <line x1={busX0} y1={Y_BUS} x2={busX1} y2={Y_BUS} stroke={STROKE} strokeWidth={LINE_W} />

          {columns.map((col) =>
            col.kind === "spd" && spdDevice ? (
              <SpdBranch key="spd" col={col} device={spdDevice} />
            ) : col.kind === "lampka" && col.device ? (
              <LampkaBranch key={col.device.uid} col={col} device={col.device} />
            ) : col.block ? (
              <g key={col.block.device?.uid ?? `bez-rcd-${col.x0}`}>
                {col.block.device ? (
                  <RcdBranch col={col} device={col.block.device} />
                ) : (
                  // Odejścia spoza zasięgu różnicówki (np. obwód przeciwpożarowy) idą
                  // WPROST z szyny głównej — bez RCD nie ma tu żadnego symbolu, który
                  // sam narysowałby ten odcinek (RCD/SPD robią to jako część własnego
                  // glifu), więc bez tej kreski wyłącznik wisiałby w powietrzu,
                  // odcięty od szyny głównej powyżej.
                  <line x1={col.cx} y1={Y_BUS} x2={col.cx} y2={Y_SUBBUS} stroke={STROKE} strokeWidth={LINE_W} />
                )}
                {col.block.mcbs.length > 1 && (
                  <line
                    x1={col.x0 + (col.width - col.block.mcbs.length * LEAF_W) / 2 + LEAF_W / 2}
                    y1={Y_SUBBUS}
                    x2={col.x0 + col.width - (col.width - col.block.mcbs.length * LEAF_W) / 2 - LEAF_W / 2}
                    y2={Y_SUBBUS}
                    stroke={STROKE}
                    strokeWidth={LINE_W}
                  />
                )}
                {col.block.mcbs.map((mcb, i) => (
                  <CircuitBranch key={mcb.uid} x={circuitX(col, i)} device={mcb} />
                ))}
              </g>
            ) : null
          )}

          {/* Rysowane po odejściach, żeby poziome szyny biegły ciągłą kreską po ich wierzchu,
              a kropki połączeniowe PE leżały na wierzchu szyny, nie pod nią. */}
          <ProtectiveBuses width={width} />
          <PeTaps columns={columns} />

          <FinalCircuitsTable columns={columns} />
      </OknoRysunku>
    </div>
  );
}

/**
 * Okno schematu: rysunek w przewijanym pojemniku plus powiększenie.
 *
 * Na telefonie schemat otwiera się DOPASOWANY do szerokości — w naturalnym rozmiarze
 * (1200 px w okienku 330 px) widać było pustą górną połowę i ani kawałka rozdzielnicy
 * głównej. Na monitorze zostaje 100%, jak dotąd. W obu przypadkach dochodzą przyciski
 * −/+ i „Dopasuj", a na dotyku szczypanie (patrz `usePowiekszanieRysunku`).
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
  children,
}: {
  szerokosc: number;
  wysokosc: number;
  svgRef: React.RefObject<SVGSVGElement>;
  children: React.ReactNode;
}) {
  // Media query, nie `innerWidth` — patrz `waskiEkran`.
  const wasko = waskiEkran();
  const p = usePowiekszanieRysunku(szerokosc, wasko);
  return (
    <div className="space-y-2">
      <PrzyciskiPowiekszenia p={p} nazwa={{ dopelniacz: "schematu", biernik: "schemat" }} />
      <div
        ref={p.kontenerRef}
        data-testid="schemat-okno"
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
          style={{ display: "block" }}
        >
          {children}
        </svg>
      </div>
    </div>
  );
}
