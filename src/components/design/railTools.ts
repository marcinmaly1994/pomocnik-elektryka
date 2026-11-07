import { DoorOpen, Hand, Layers, MousePointer2, PenLine, Plus, Ruler, StickyNote } from "lucide-react";
import type { ToolMode } from "./DesignCanvas";

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
  // Notatki dla montera (F6 z audytu 5.11.2026) — trafiają też na rzut w PDF.
  { id: "notatka", label: "Notatka", icon: StickyNote, hint: "Kliknij na planie, żeby dodać notatkę — trafi też na wydruk", shortcut: "N" },
  // Podpowiedź mówi też o rolce, bo inaczej ten skrót jest nie do odkrycia: nikt
  // nie wciska środkowego przycisku „na próbę", żeby sprawdzić, czy coś zrobi.
  { id: "pan", label: "Przesuń widok", icon: Hand, hint: "Przeciągaj widok planu — albo przytrzymaj rolkę myszy w dowolnym narzędziu", shortcut: "H" },
  { id: "skala", label: "Kalibracja skali", icon: Ruler, hint: "Ustaw, ile metrów ma odcinek", shortcut: "S" },
];
