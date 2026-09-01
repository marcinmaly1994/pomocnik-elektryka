import { useRef, useState } from "react";
import { PHASE_COLORS, accentForDevice, layoutPanel } from "@/lib/panel/devices";
import { zawijNaDwieLinie } from "@/lib/tekst";
import type { SizedCircuit } from "@/lib/panel/sizing";
import type { PanelDevice } from "@/types";

/**
 * Realistyczny widok czołowy rozdzielnicy — SVG, BEZ PRZEWODÓW.
 *
 * Świadomie nie rysujemy żył, wiązek ani szyn grzebieniowych: na zdjęciu gotowej
 * rozdzielnicy przewody i tak zasłaniają połowę aparatów, a rysunek ma służyć do
 * rozpoznania, CO gdzie siedzi i jakie ma nastawy. Przynależność obwodu do
 * różnicówki pokazuje klamra nad grupą, a nie linia — to informacja logiczna,
 * nie fizyczna trasa.
 *
 * SVG, a nie Konva (jak w `PanelCanvas`), bo ten widok ma się skalować razem
 * z szerokością strony i zachować tekst jako tekst — do wydruku, eksportu
 * i czytania na telefonie. Płótno rastrowe nie daje żadnej z tych rzeczy.
 */

const MODULE_W = 30;
const DEVICE_H = 124;
const TAG_H = 34; // pas nad aparatami: oznaczenie + klamra RCD
/** Pas pod aparatami: przekrój, faza i nazwa obwodu. Wysoki, bo przy aparatach
 *  1-modułowych nazwa nie mieści się poziomo i jest pisana pionowo. */
const LABEL_H = 90;
/** Poniżej tej szerokości nazwa obwodu idzie pionowo — inaczej podpisy sąsiednich
 *  aparatów nachodzą na siebie i zlewają się w nieczytelny ciąg. */
const NARROW_W = 62;
const ROW_GAP = 14;
const PAD = 26;
const LEGEND_H = 80;

/** O ile powiększyć cały rysunek względem rozmiaru naturalnego — patrz komentarz
 *  przy `maxWidth` niżej. Skalujemy WIDOK, nie geometrię, więc proporcje aparatów
 *  i wzajemne odległości zostają dokładnie takie same. */
const SKALA_WIDOKU = 1.8;

export interface PanelRenderProps {
  devices: PanelDevice[];
  perRow: number;
  onDelete: (uid: string) => void;
  /** Przeniesienie aparatu na inną pozycję szyny (indeksy w tablicy `devices`).
   *  Brak funkcji = widok tylko do oglądania, bez chwytania aparatów. */
  onMove?: (from: number, to: number) => void;
  /** Otwiera edycję aparatu — klik, nie przeciągnięcie (patrz `przeciagnieto` niżej). */
  onEdit?: (uid: string) => void;
  /** Wynik doboru dla aparatów obwodowych, kluczowany polem `key` aparatu. */
  sizing?: Map<string, SizedCircuit>;
}

/** Kolor obwódki wg statusu doboru — OK neutralnie, ostrzeżenie pomarańczowo, błąd czerwono. */
function statusStroke(status: SizedCircuit["status"] | undefined): { stroke: string; width: number } {
  if (status === "error") return { stroke: "#C6433A", width: 2.2 };
  if (status === "warn") return { stroke: "#C1793F", width: 2 };
  return { stroke: "#9AA6B2", width: 1.2 };
}

function Screws({ modules }: { modules: number }) {
  return (
    <>
      {Array.from({ length: modules }).map((_, i) => {
        const cx = MODULE_W * (i + 0.5);
        return (
          <g key={i}>
            {[16, DEVICE_H - 16].map((cy) => (
              <g key={cy}>
                <circle cx={cx} cy={cy} r={4.2} fill="#C3CBD4" stroke="#94A0AC" strokeWidth={0.8} />
                <line x1={cx - 2.8} y1={cy} x2={cx + 2.8} y2={cy} stroke="#7E8B98" strokeWidth={1.1} />
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}

/**
 * Lico aparatu — jeden kształt na RODZAJ urządzenia, nie jeden uniwersalny rocker.
 *
 * Wcześniej każdy aparat poza SPD/SPD-bezpiecznikiem dostawał tę samą ciemną dźwignię
 * z „I” — lampka sygnalizacyjna wyglądała identycznie jak wyłącznik nadprądowy, bo
 * jedyną różnicą był kolor nadruku pod spodem. Reszta katalogu dostaje więc własny
 * kształt, dobrany pod to, co dany aparat FAKTYCZNIE ma na przedniej ściance:
 * przekaźnik monitorujący ma lampki fazowe, nie dźwignię; zasilacz ma zaciski
 * wyjściowe, nie dźwignię; stycznik ma okienko stanu i zaciski cewki A1/A2 — to
 * właśnie te zaciski odróżniają go na pierwszy rzut oka od zwykłego łącznika.
 */
function DeviceFace({ device, w, accent }: { device: PanelDevice; w: number; accent: string }) {
  const leverY = DEVICE_H * 0.4;

  if (device.kind === "ovr") {
    // Czujnik zaniku/kolejności faz: trzy lampki fazowe u góry (obecność L1/L2/L3),
    // okienko statusu przekaźnika pod spodem — monitoruje, nie łączy ręcznie.
    return (
      <>
        {(["L1", "L2", "L3"] as const).map((p, i) => (
          <circle key={p} cx={w / 2 + (i - 1) * 8} cy={33} r={3} fill={PHASE_COLORS[p]} />
        ))}
        <rect x={w / 2 - 11} y={43} width={22} height={16} rx={1.5} fill="#fff" stroke="#8494A5" strokeWidth={0.9} />
        <circle cx={w / 2} cy={51} r={3.2} fill="#3B8C63" />
      </>
    );
  }

  if (device.kind === "ppoz") {
    // Rozłącznik przeciwpożarowy: pokrętło izolacyjne (obrót, nie rocker) — tak
    // rozróżnia się go na rysunku od zwykłego łącznika, niezależnie od koloru.
    return (
      <>
        <circle cx={w / 2} cy={leverY} r={16} fill={accent} fillOpacity={0.12} stroke={accent} strokeWidth={2} />
        <line x1={w / 2} y1={leverY} x2={w / 2 + 11} y2={leverY - 11} stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={w / 2} cy={leverY} r={2.2} fill={accent} />
      </>
    );
  }

  if (device.kind === "stycznik") {
    // Stycznik: mechaniczne okienko stanu („I” = zwarty) plus zaciski cewki
    // sterującej A1/A2 — to one, nie dźwignia, są tym, co widać na styczniku.
    return (
      <>
        <rect x={w / 2 - 14} y={leverY - 14} width={28} height={20} rx={2} fill="#fff" stroke={accent} strokeWidth={1.1} />
        <rect x={w / 2 - 11} y={leverY - 11} width={9} height={14} fill={accent} fillOpacity={0.85} />
        <text x={w / 2 + 5.5} y={leverY - 1} textAnchor="middle" fontSize={8} fontWeight={700} fill={accent}>
          I
        </text>
        <text x={w / 2} y={leverY + 17} textAnchor="middle" fontSize={6} fontWeight={600} fill="#8494A5">
          A1 · A2
        </text>
      </>
    );
  }

  if (device.kind === "przekaznik") {
    // Przekaźnik bistabilny (np. schodowy): mały okrągły przycisk ręcznego
    // testu/override — jedyny manualny element na czole tego aparatu.
    return (
      <>
        <circle cx={w / 2} cy={leverY} r={11} fill="#fff" stroke={accent} strokeWidth={1.6} />
        <circle cx={w / 2} cy={leverY} r={7} fill={accent} fillOpacity={0.18} />
        <circle cx={w / 2} cy={leverY} r={3} fill={accent} />
      </>
    );
  }

  if (device.kind === "zasilacz") {
    // Zasilacz DC: BEZ dźwigni — to przetwornik, nie łącznik. Zaciski wyjściowe
    // +/− i dioda sygnalizująca obecność napięcia wyjściowego.
    return (
      <>
        <text x={w / 2 - 13} y={leverY - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={accent}>
          +
        </text>
        <text x={w / 2 + 13} y={leverY - 3} textAnchor="middle" fontSize={14} fontWeight={700} fill={accent}>
          −
        </text>
        <line x1={w / 2 - 13} y1={leverY} x2={w / 2 - 13} y2={leverY + 13} stroke={accent} strokeWidth={1.3} />
        <line x1={w / 2 + 13} y1={leverY} x2={w / 2 + 13} y2={leverY + 13} stroke={accent} strokeWidth={1.3} />
        <circle cx={w / 2} cy={leverY + 15.5} r={2.6} fill="#3B8C63" />
      </>
    );
  }

  if (device.kind === "lampka") {
    // Lampka sygnalizacyjna: kolorowy klosz, nie dźwignia. Zawsze zielona —
    // to kolor „załączone/OK", niezależnie od tego, czy klosz jest jeden
    // (obwód pojedynczy), czy trzy (wariant 3-fazowy „L1-L2-L3"). Wcześniej
    // wariant 3-fazowy dostawał barwy żył (brąz/czarny/szary) — myliło to
    // kolor lampki z kolorem przewodu, którego tu w ogóle nie widać.
    const trojfazowa = device.label.includes("L1");
    return trojfazowa ? (
      <>
        {(["L1", "L2", "L3"] as const).map((p, i) => (
          <g key={p}>
            <circle cx={w / 2 + (i - 1) * 9} cy={leverY} r={4.4} fill={accent} />
            <circle cx={w / 2 + (i - 1) * 9 - 1.3} cy={leverY - 1.3} r={1.3} fill="#fff" fillOpacity={0.6} />
          </g>
        ))}
      </>
    ) : (
      <>
        <circle cx={w / 2} cy={leverY} r={10} fill={accent} />
        <circle cx={w / 2 - 3} cy={leverY - 3} r={3} fill="#fff" fillOpacity={0.55} />
      </>
    );
  }

  if (device.kind === "spd" || device.kind === "spdFuse") {
    const tint = device.kind === "spd" ? "#3B8C63" : "#B98C2F";
    return (
      <>
        {Array.from({ length: device.modules }).map((_, i) => (
          <g key={i}>
            <rect
              x={MODULE_W * i + 5}
              y={leverY - 17}
              width={MODULE_W - 10}
              height={32}
              rx={2}
              fill={tint}
              fillOpacity={0.15}
              stroke={tint}
              strokeWidth={0.9}
            />
            {device.kind === "spd" ? (
              // wkład warystorowy z okienkiem kontroli zużycia
              <>
                <rect x={MODULE_W * i + 9} y={leverY - 12} width={MODULE_W - 18} height={12} rx={1.5} fill={tint} />
                <rect x={MODULE_W * i + 11} y={leverY + 3} width={MODULE_W - 22} height={6} rx={1} fill="none" stroke={tint} strokeWidth={0.7} />
              </>
            ) : (
              <>
                <circle cx={MODULE_W * (i + 0.5)} cy={leverY - 1} r={5} fill="none" stroke={tint} strokeWidth={1.4} />
                <circle cx={MODULE_W * (i + 0.5)} cy={leverY - 1} r={1.8} fill={tint} />
              </>
            )}
          </g>
        ))}
      </>
    );
  }

  return (
    <>
      {/* dźwignia w pozycji ON — górna część korpusu, biała kreska „I" */}
      <rect x={w / 2 - 8} y={leverY - 15} width={16} height={27} rx={2} fill="#2B3440" />
      <rect x={w / 2 - 5.5} y={leverY - 12} width={11} height={9} rx={1} fill="#4C5866" />
      <text x={w / 2} y={leverY + 9} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#fff">
        I
      </text>
      {/* Przycisk testowy różnicówki. RCBO dostaje go RÓWNIEŻ — to wyłącznik
          nadprądowy I różnicowoprądowy w jednej obudowie, więc ma oba mechanizmy
          wyzwalania, tak jak samodzielna różnicówka. Wcześniej RCBO wyglądał jak
          zwykły wyłącznik nadprądowy, bez śladu członu różnicowego. */}
      {(device.kind === "rcd" || device.kind === "rcbo") && (
        <g>
          <rect x={w - 17} y={leverY - 15} width={13} height={13} rx={1.5} fill="#C6433A" />
          <text x={w - 10.5} y={leverY - 5.5} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#fff">
            T
          </text>
        </g>
      )}
    </>
  );
}

export function PanelRender({ devices, perRow, onDelete, onMove, onEdit, sizing }: PanelRenderProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  /**
   * Przeciąganie aparatów po szynie.
   *
   * Bez `setPointerCapture`: przechwycenie wskaźnika sprawia, że zdarzenia trafiają
   * wyłącznie do chwyconego elementu, a my potrzebujemy `onPointerEnter` NA SĄSIADACH,
   * żeby wiedzieć, gdzie aparat ma wylądować. Zamiast tego pilnujemy stanu ręcznie
   * i kończymy na `pointerup` gdziekolwiek nad rysunkiem.
   */
  const [chwycony, setChwycony] = useState<number | null>(null);
  const [cel, setCel] = useState<number | null>(null);
  // Rozróżnia kliknięcie od przeciągnięcia — bez tego puszczenie aparatu nad kółkiem
  // kasowania kasowałoby go zamiast przenieść.
  const przeciagnieto = useRef(false);

  const zakonczPrzenoszenie = () => {
    if (chwycony !== null && cel !== null && cel !== chwycony) onMove?.(chwycony, cel);
    setChwycony(null);
    setCel(null);
  };
  const rows = layoutPanel(devices, perRow);
  const rowH = TAG_H + DEVICE_H + LABEL_H + ROW_GAP;
  const innerW = perRow * MODULE_W;
  const svgW = innerW + PAD * 2;
  const svgH = Math.max(rows.length, 1) * rowH + PAD * 2 + LEGEND_H;

  // Rysunek rozdzielnicy traktujemy jak plan: suwak systemowy pod rysunkiem
  // technicznym wygląda jak podgląd pliku, a nie jak narzędzie. Tabele w kosztorysie
  // i protokołach ZOSTAWIAMY z widocznym suwakiem — tam pasek niesie informację,
  // że dalej są kolejne kolumny.
  return (
    <div className="pe-bez-suwaka overflow-x-auto rounded-card border border-border" style={{ background: "#EDF0F3" }}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label="Widok czołowy rozdzielnicy"
        // Rozdzielnica nadal nie rozciąga się na CAŁĄ szerokość — aparat modułowy ma
        // realny rozmiar (17,5 mm) i rozdmuchany do monitora wygląda jak makieta.
        // Ale sam „rozmiar naturalny" okazał się w praktyce za mały: przy 12 modułach
        // to ~410 px, na których opisy obwodów i oznaczenia aparatów są ledwo czytelne.
        // Stąd stały mnożnik: proporcje aparatów zostają nietknięte (skalujemy cały
        // rysunek, nie geometrię), a wszystko — łącznie z tekstem — rośnie razem.
        // `width: 100%` nadal pozwala rysunkowi ZMALEĆ na wąskim ekranie.
        style={{ display: "block", width: "100%", maxWidth: svgW * SKALA_WIDOKU, height: "auto" }}
        onPointerUp={zakonczPrzenoszenie}
        // Wyjście wskaźnikiem poza rysunek ANULUJE przeniesienie: aparat nie ma dokąd
        // trafić, a zostawienie stanu „w trakcie" łapałoby każde kolejne najechanie.
        onPointerLeave={() => {
          setChwycony(null);
          setCel(null);
        }}
      >
        {/* obudowa */}
        <rect x={1} y={1} width={svgW - 2} height={svgH - 2} rx={8} fill="#EDF0F3" stroke="#B6C1CC" strokeWidth={2} />
        <rect x={9} y={9} width={svgW - 18} height={svgH - 18 - LEGEND_H} rx={5} fill="#F7F9FB" stroke="#CBD4DD" strokeWidth={1} />

        {rows.map((row, ri) => {
          const rowTop = PAD + ri * rowH;
          const y = rowTop + TAG_H;

          // Klamry różnicówek: każda RCD obejmuje aparaty, które mają jej tag.
          // Rysowane raz na rząd, nad aparatami — to informacja o przynależności,
          // nie połączenie, więc celowo klamra, a nie linia zasilania.
          const brackets = row
            .filter((d) => d.kind === "rcd")
            .map((rcd) => {
              const members = row.filter((d) => d.rcdTag === rcd.tag);
              if (members.length === 0) return null;
              const startSlot = rcd.slot;
              const endSlot = Math.max(...members.map((m) => m.slot + m.modules));
              return { tag: rcd.tag, x1: PAD + startSlot * MODULE_W, x2: PAD + endSlot * MODULE_W };
            })
            .filter((b): b is { tag: string; x1: number; x2: number } => b !== null);

          return (
            <g key={ri}>
              {brackets.map((b) => {
                const top = y - 15;
                return (
                  <g key={b.tag}>
                    <path
                      d={`M ${b.x1 + 2} ${top + 7} L ${b.x1 + 2} ${top} L ${b.x2 - 2} ${top} L ${b.x2 - 2} ${top + 7}`}
                      fill="none"
                      stroke="#C1793F"
                      strokeWidth={1.3}
                      strokeLinecap="round"
                    />
                    <rect x={(b.x1 + b.x2) / 2 - 26} y={top - 8} width={52} height={12} rx={6} fill="#FDF6EF" stroke="#C1793F" strokeWidth={0.8} />
                    <text x={(b.x1 + b.x2) / 2} y={top + 0.5} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#8A5526">
                      {b.tag} · 30 mA
                    </text>
                  </g>
                );
              })}

              {/* szyna DIN TH35 */}
              <rect x={PAD - 8} y={y + DEVICE_H / 2 - 6} width={innerW + 16} height={12} rx={1.5} fill="#C8D0D8" stroke="#A7B2BD" strokeWidth={0.8} />
              <rect x={PAD - 12} y={y - 5} width={innerW + 24} height={5} rx={1.5} fill="#DDE3E9" />
              <rect x={PAD - 12} y={y + DEVICE_H} width={innerW + 24} height={5} rx={1.5} fill="#DDE3E9" />

              {row.map((d) => {
                const x = PAD + d.slot * MODULE_W;
                const w = d.modules * MODULE_W;
                const sized = d.key ? sizing?.get(d.key) : undefined;
                const { stroke, width } = statusStroke(sized?.status);
                const accent = accentForDevice(d);
                const phase = d.phase ?? "";
                const phaseColor = PHASE_COLORS[phase] ?? PHASE_COLORS[""];
                const deletable = d.kind !== "main" && d.kind !== "blank";

                if (d.kind === "blank") {
                  return (
                    <g key={d.uid}>
                      <rect x={x} y={y} width={w} height={DEVICE_H} rx={2} fill="#E9EDF1" stroke="#CBD4DD" strokeWidth={1} />
                      <line x1={x + w * 0.3} y1={y + DEVICE_H / 2} x2={x + w * 0.7} y2={y + DEVICE_H / 2} stroke="#B6C1CC" strokeWidth={1.5} />
                    </g>
                  );
                }

                const przenoszalny = !!onMove && d.kind !== "main";
                const wRuchu = chwycony === d.index;
                const celTutaj = chwycony !== null && cel === d.index && !wRuchu;

                return (
                  <g
                    key={d.uid}
                    onMouseEnter={() => setHovered(d.uid)}
                    onMouseLeave={() => setHovered((h) => (h === d.uid ? null : h))}
                    onPointerDown={(e) => {
                      if (!przenoszalny) return;
                      // Bez tego przeciąganie zaznacza tekst opisów i rysunek „skacze".
                      e.preventDefault();
                      przeciagnieto.current = false;
                      setChwycony(d.index);
                      setCel(d.index);
                    }}
                    onClick={() => {
                      if (przeciagnieto.current || d.kind === "blank") return;
                      onEdit?.(d.uid);
                    }}
                    onPointerEnter={() => {
                      if (chwycony === null) return;
                      przeciagnieto.current = true;
                      setCel(d.index);
                    }}
                    style={{
                      cursor: przenoszalny ? (chwycony !== null ? "grabbing" : "grab") : onEdit && d.kind !== "blank" ? "pointer" : undefined,
                      opacity: wRuchu ? 0.45 : 1,
                    }}
                  >
                    {/* Kreska w miejscu, gdzie aparat wyląduje po puszczeniu. */}
                    {celTutaj && (
                      <rect
                        x={cel > chwycony! ? x + w - 2 : x - 1}
                        y={y - 6}
                        width={3}
                        height={DEVICE_H + 12}
                        rx={1.5}
                        fill="#C1793F"
                      />
                    )}
                    <text x={x + w / 2} y={y - 20} textAnchor="middle" fontSize={11} fontWeight={700} fill="#16202B">
                      {d.tag}
                    </text>

                    <g transform={`translate(${x} ${y})`}>
                      <rect width={w} height={DEVICE_H} rx={2.5} fill="#F7F8FA" stroke={stroke} strokeWidth={width} />
                      {/* zaciski górny i dolny */}
                      <rect x={2} y={4} width={w - 4} height={20} rx={1.5} fill="#DDE3E9" stroke="#B6C1CC" strokeWidth={0.8} />
                      <rect x={2} y={DEVICE_H - 24} width={w - 4} height={20} rx={1.5} fill="#DDE3E9" stroke="#B6C1CC" strokeWidth={0.8} />
                      <Screws modules={d.modules} />

                      {/* nadruk wartości na licu */}
                      <rect x={2} y={DEVICE_H * 0.6} width={w - 4} height={21} rx={1.5} fill="#fff" stroke="#CBD4DD" strokeWidth={0.8} />
                      <text x={w / 2} y={DEVICE_H * 0.6 + 14.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={accent}>
                        {d.label}
                      </text>

                      <DeviceFace device={d} w={w} accent={accent} />

                      {/* liczba biegunów — drobny nadruk przy krawędzi */}
                      <text x={w / 2} y={DEVICE_H - 30} textAnchor="middle" fontSize={6.5} fill="#8494A5">
                        {d.poles}
                      </text>
                      <rect x={2} y={DEVICE_H - 27} width={w - 4} height={3.5} rx={1} fill={accent} opacity={0.85} />
                    </g>

                    {/* Etykieta pod aparatem: nazwa, przekrój, faza jako kolorowa kropka.
                        Kolor fazy siedzi na ETYKIECIE, nie na przewodzie — przewodów
                        w tym widoku nie ma z założenia. */}
                    <g transform={`translate(${x} ${y + DEVICE_H + 9})`}>
                      {sized?.kabel && (
                        <text x={w / 2} y={7} textAnchor="middle" fontSize={6.8} fill="#8494A5">
                          {sized.kabel.replace("YDYp ", "")}
                        </text>
                      )}
                      {phase === "3F" ? (
                        // Trzy kropki zamiast jednej: aparat trójfazowy zajmuje wszystkie
                        // fazy, więc pokazujemy komplet kolorów zamiast koloru zbiorczego.
                        <g transform={`translate(${w / 2} 19)`}>
                          {(["L1", "L2", "L3"] as const).map((p, i) => (
                            <circle key={p} cx={(i - 1) * 8} cy={-2.5} r={3} fill={PHASE_COLORS[p]} />
                          ))}
                        </g>
                      ) : (
                        phase && (
                          <g transform={`translate(${w / 2} 20)`}>
                            <circle cx={-9} cy={-2.5} r={3} fill={phaseColor} />
                            <text x={5} y={0} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={phaseColor}>
                              {phase}
                            </text>
                          </g>
                        )
                      )}

                      {/* Nazwa obwodu na DWÓCH liniach zamiast ucinania wielokropkiem.
                          Ucinany był koniec nazwy, czyli dokładnie to, co odróżnia
                          „Gniazda — Kuchnia" od „Gniazda — Kuchnia (zmywarka)".
                          Poziomo pod szerokim aparatem, pionowo pod wąskim. */}
                      {(() => {
                        const waski = w < NARROW_W;
                        // Przy wąskim aparacie podpis stoi pionowo, obrócony o 90° — jego
                        // długość zjada wysokość PASA POD APARATEM, nie jego szerokość.
                        // 20 znaków (budżet dla poziomego podpisu) było za dużo: podpis
                        // w granicach 12–20 znaków mieścił się w jednej linii wg tego progu,
                        // ale ta jedna, nieskrócona kolumna i tak wystawała poniżej `LABEL_H`
                        // i zachodziła na rząd aparatów niżej. 12 znaków to w przybliżeniu
                        // to, co faktycznie mieści się w dostępnej wysokości przy tym foncie.
                        const naLinie = waski ? 12 : Math.max(6, Math.floor(w / 3.7));
                        const [l1, l2] = zawijNaDwieLinie(d.caption, naLinie);
                        if (waski) {
                          return (
                            <g transform={`translate(${w / 2 + 2.5} 28) rotate(-90)`}>
                              <text textAnchor="end" fontSize={6.8} fill="#5B6B7E">
                                {l1}
                              </text>
                              {l2 && (
                                <text y={8} textAnchor="end" fontSize={6.8} fill="#5B6B7E">
                                  {l2}
                                </text>
                              )}
                            </g>
                          );
                        }
                        return (
                          <text x={w / 2} y={34} textAnchor="middle" fontSize={7.5} fill="#5B6B7E">
                            <tspan x={w / 2}>{l1}</tspan>
                            {l2 && (
                              <tspan x={w / 2} dy={9}>
                                {l2}
                              </tspan>
                            )}
                          </text>
                        );
                      })()}
                    </g>

                    {/* Kasowanie w prawym górnym rogu LICA aparatu, nie nad nim: pas nad
                        aparatami zajmują oznaczenie i klamra różnicówki, więc kółko
                        lądowało na cudzym tekście. Pokazywane tylko pod kursorem. */}
                    {deletable && hovered === d.uid && (
                      <g
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (przeciagnieto.current) return;
                          onDelete(d.uid);
                        }}
                      >
                        <circle cx={x + w - 9} cy={y + 11} r={7.5} fill="#fff" stroke="#C6433A" strokeWidth={1.3} />
                        <text x={x + w - 9} y={y + 14.5} textAnchor="middle" fontSize={11} fill="#C6433A">
                          ×
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* legenda */}
        <g transform={`translate(${PAD} ${svgH - LEGEND_H + 6})`}>
          <line x1={0} y1={0} x2={innerW} y2={0} stroke="#CBD4DD" strokeWidth={1} />
          <text x={0} y={16} fontSize={8} fontWeight={700} fill="#64748B" letterSpacing={1}>
            OZNACZENIA
          </text>
          {[
            { label: "L1 — brązowy", color: PHASE_COLORS.L1 },
            { label: "L2 — czarny", color: PHASE_COLORS.L2 },
            { label: "L3 — szary", color: PHASE_COLORS.L3 },
          ].map((p, i) => (
            <g key={p.label} transform={`translate(${i * 96} 30)`}>
              <circle cx={4} cy={-3} r={3.4} fill={p.color} />
              <text x={13} y={0} fontSize={8} fill="#5B6B7E">
                {p.label}
              </text>
            </g>
          ))}
          {[
            { label: "dobór OK", color: "#9AA6B2" },
            { label: "ostrzeżenie", color: "#C1793F" },
            { label: "błąd doboru", color: "#C6433A" },
          ].map((s, i) => (
            <g key={s.label} transform={`translate(${i * 96} 50)`}>
              <rect x={0} y={-7} width={9} height={9} rx={1.5} fill="#F7F8FA" stroke={s.color} strokeWidth={1.6} />
              <text x={15} y={0} fontSize={8} fill="#5B6B7E">
                {s.label}
              </text>
            </g>
          ))}
          <g transform="translate(288 50)">
            <path d="M 0 -2 L 0 -7 L 26 -7 L 26 -2" fill="none" stroke="#C1793F" strokeWidth={1.3} />
            <text x={33} y={0} fontSize={8} fill="#5B6B7E">
              zasięg różnicówki
            </text>
          </g>
          <text x={0} y={72} fontSize={7.5} fill="#94A3B8">
            Widok nie pokazuje przewodów ani szyn łączeniowych — służy do identyfikacji aparatów i ich nastaw.
          </text>
        </g>
      </svg>
    </div>
  );
}

