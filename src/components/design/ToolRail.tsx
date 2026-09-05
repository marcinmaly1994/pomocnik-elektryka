import { DoorOpen, Hand, Layers, MousePointer2, PenLine, Plus, Ruler } from "lucide-react";
import type { ToolMode } from "./DesignCanvas";

/**
 * Pionowy pasek narzędzi rysowania — sama ikona, podpis i skrót klawiszowy tylko
 * w tooltipie, jedno narzędzie aktywne.
 *
 * Wcześniej pod każdą ikoną stał PEŁNY podpis (bywało, że na dwóch liniach —
 * „Narysuj Pomieszczenie", „Kalibracja skali"), co przy siedmiu narzędziach z
 * rzędu robiło ścianę tekstu. Sama ikona + accessible name (`aria-label`, WIDOCZNY
 * dla czytników i dalej trafiający w te same testy `getByRole("button", {name})`,
 * mimo że wizualnie zniknął) + tooltip z podpowiedzią i skrótem daje ten sam sens,
 * dużo mniej szumu — a przy okazji siedem przycisków zajmuje mniej miejsca.
 * Skróty klawiszowe (bez modyfikatora) obsługuje `DesignTab.tsx`.
 */

export interface RailTool {
  id: ToolMode;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
  /** Skrót klawiszowy (jedna litera, bez modyfikatora) — patrz keydown handler w
   *  DesignTab.tsx. Dobrane tak, by nie kolidowały z istniejącymi skrótami R
   *  (obrót/odbicie zaznaczenia) i F (pełny ekran). */
  shortcut: string;
}

export const RAIL_TOOLS: RailTool[] = [
  { id: "zaznacz", label: "Zaznacz", icon: MousePointer2, hint: "Zaznaczaj i przesuwaj elementy", shortcut: "V" },
  { id: "elementy", label: "Wstaw Element", icon: Plus, hint: "Stawiaj elementy klikając na planie", shortcut: "E" },
  // Liczba pojedyncza: narzędzie rysuje JEDNO pomieszczenie naraz. Makieta ma tu
  // „Pomieszczenia", ale to etykieta panelu z listą, a nie nazwa narzędzia.
  { id: "pomieszczenie", label: "Narysuj Pomieszczenie", icon: Layers, hint: "Obrysuj pomieszczenie", shortcut: "P" },
  { id: "sciany", label: "Narysuj Ścianę", icon: PenLine, hint: "Rysuj ściany łamaną", shortcut: "W" },
  { id: "otwory", label: "Drzwi i okna", icon: DoorOpen, hint: "Kliknij ścianę albo krawędź pomieszczenia, żeby wstawić drzwi albo okno", shortcut: "D" },
  // Podpowiedź mówi też o rolce, bo inaczej ten skrót jest nie do odkrycia: nikt
  // nie wciska środkowego przycisku „na próbę", żeby sprawdzić, czy coś zrobi.
  { id: "pan", label: "Przesuń widok", icon: Hand, hint: "Przeciągaj widok planu — albo przytrzymaj rolkę myszy w dowolnym narzędziu", shortcut: "H" },
  { id: "skala", label: "Kalibracja skali", icon: Ruler, hint: "Ustaw, ile metrów ma odcinek", shortcut: "S" },
];

/** `onToolRef` pozwala rodzicowi przypiąć się do konkretnego przycisku — coach-mark
 *  onboardingu rysuje strzałkę do „Kalibracji skali" i musi znać jej pozycję. */
export function ToolRail({
  value,
  onChange,
  onToolRef,
}: {
  value: ToolMode;
  onChange: (t: ToolMode) => void;
  onToolRef?: (id: ToolMode, el: HTMLButtonElement | null) => void;
}) {
  return (
    <nav
      aria-label="Narzędzia rysowania"
      // Bez własnej ramki i tła: pasek jest LEWĄ KRAWĘDZIĄ wspólnej karty z panelem,
      // a nie osobnym kafelkiem. Delikatne tło odróżnia go od zawartości panelu tak,
      // jak activity bar odróżnia się od panelu bocznego w VS Code.
      // `md:overflow-y-auto` zamiast `md:overflow-visible`: w pełnym ekranie karta
      // narzędzi ma `overflow-hidden`, więc na niskim oknie ostatnie narzędzia
      // zostałyby ucięte bez żadnego sposobu, żeby do nich dotrzeć.
      className="pe-bez-suwaka flex shrink-0 flex-row gap-1 overflow-x-auto border-r border-border p-1.5 md:flex-col md:overflow-x-visible md:overflow-y-auto"
      style={{ background: "#F7F9FB" }}
    >
      {RAIL_TOOLS.map(({ id, label, icon: Icon, hint, shortcut }) => {
        const active = value === id;
        return (
          <button
            key={id}
            ref={(el) => onToolRef?.(id, el)}
            onClick={() => onChange(id)}
            title={`${hint} (${shortcut})`}
            aria-label={label}
            aria-pressed={active}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={active ? { background: "#C1793F14", color: "#8A5526" } : { color: "#64748B" }}
          >
            <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
          </button>
        );
      })}
    </nav>
  );
}
