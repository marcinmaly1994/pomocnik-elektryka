import { DoorOpen, Hand, Layers, MousePointer2, PenLine, Plus, Ruler } from "lucide-react";
import type { ToolMode } from "./DesignCanvas";

/**
 * Pionowy pasek narzędzi rysowania — ikona nad podpisem, jedno narzędzie aktywne.
 *
 * Pionowo, a nie poziomo jak wcześniej: pasek stoi przy krawędzi płótna i nie
 * zabiera mu wysokości, a podpisy pod ikonami mieszczą się bez skracania („Przesuń
 * widok" łamał się w poziomie na dwie linie i robił przycisk wyższym od sąsiadów).
 */

export interface RailTool {
  id: ToolMode;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
}

export const RAIL_TOOLS: RailTool[] = [
  { id: "zaznacz", label: "Zaznacz", icon: MousePointer2, hint: "Zaznaczaj i przesuwaj elementy" },
  { id: "elementy", label: "Wstaw Element", icon: Plus, hint: "Stawiaj elementy klikając na planie" },
  // Liczba pojedyncza: narzędzie rysuje JEDNO pomieszczenie naraz. Makieta ma tu
  // „Pomieszczenia", ale to etykieta panelu z listą, a nie nazwa narzędzia.
  { id: "pomieszczenie", label: "Narysuj Pomieszczenie", icon: Layers, hint: "Obrysuj pomieszczenie" },
  { id: "sciany", label: "Narysuj Ścianę", icon: PenLine, hint: "Rysuj ściany łamaną" },
  { id: "otwory", label: "Drzwi / Okno", icon: DoorOpen, hint: "Kliknij ścianę, żeby dodać drzwi albo okno" },
  { id: "pan", label: "Przesuń widok", icon: Hand, hint: "Przeciągaj widok planu" },
  { id: "skala", label: "Kalibracja skali", icon: Ruler, hint: "Ustaw, ile metrów ma odcinek" },
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
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-r border-border p-1.5 md:flex-col md:overflow-visible"
      style={{ background: "#F7F9FB" }}
    >
      {RAIL_TOOLS.map(({ id, label, icon: Icon, hint }) => {
        const active = value === id;
        return (
          <button
            key={id}
            ref={(el) => onToolRef?.(id, el)}
            onClick={() => onChange(id)}
            title={hint}
            aria-pressed={active}
            className="flex w-[70px] shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] leading-tight transition-colors"
            style={active ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#64748B" }}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
            <span className="text-center">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
