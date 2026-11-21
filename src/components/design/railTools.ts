import { DoorOpen, Hand, MousePointer2, PenLine, Plus, Ruler, Spline, StickyNote, VectorSquare } from "lucide-react";
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
  /** Grupa na pasku — między grupami stoi odstęp z kreską. Kolejność grup to przebieg
   *  pracy: poruszanie się → bryła budynku → instalacja → notatki → skala. */
  grupa: "widok" | "bryla" | "instalacja" | "notatki" | "skala";
}

/**
 * Kolejność = przebieg pracy (przegląd Instalacji 21.11.2026, pkt 3). Dotąd pasek szedł:
 * Zaznacz, Wstaw Element, Pomieszczenie, Ściana, Drzwi, Notatka, Przewód, Przesuń, Skala —
 * czyli osprzęt PRZED bryłą, na której się go stawia, a „Przesuń widok" (nawigacja, jak
 * „Zaznacz") na przedostatnim miejscu, na telefonie za krawędzią ekranu.
 *
 * Ikony bez dubli (pkt 6): pomieszczenie miało ikonę warstw — tę samą co wybór
 * kondygnacji — a przewód ikonę kabla, tę samą co przełącznik „Pokaż trasy przewodów".
 */
export const RAIL_TOOLS: RailTool[] = [
  { id: "zaznacz", label: "Zaznacz", icon: MousePointer2, hint: "Zaznaczaj i przesuwaj elementy", shortcut: "V", grupa: "widok" },
  // Podpowiedź mówi też o rolce, bo inaczej ten skrót jest nie do odkrycia: nikt
  // nie wciska środkowego przycisku „na próbę", żeby sprawdzić, czy coś zrobi.
  { id: "pan", label: "Przesuń widok", icon: Hand, hint: "Przeciągaj widok planu — albo przytrzymaj rolkę myszy w dowolnym narzędziu", shortcut: "H", grupa: "widok" },
  // Liczba pojedyncza: narzędzie rysuje JEDNO pomieszczenie naraz. Makieta ma tu
  // „Pomieszczenia", ale to etykieta panelu z listą, a nie nazwa narzędzia.
  { id: "pomieszczenie", label: "Narysuj Pomieszczenie", icon: VectorSquare, hint: "Obrysuj pomieszczenie", shortcut: "P", grupa: "bryla" },
  { id: "sciany", label: "Narysuj Ścianę", icon: PenLine, hint: "Rysuj ściany łamaną", shortcut: "W", grupa: "bryla" },
  { id: "otwory", label: "Drzwi i okna", icon: DoorOpen, hint: "Kliknij ścianę albo krawędź pomieszczenia, żeby wstawić drzwi albo okno", shortcut: "D", grupa: "bryla" },
  { id: "elementy", label: "Wstaw Element", icon: Plus, hint: "Stawiaj elementy klikając na planie", shortcut: "E", grupa: "instalacja" },
  // Przewód poprowadzony ręcznie między dwoma elementami (F11 z audytu 5.11.2026).
  { id: "przewod", label: "Przewód", icon: Spline, hint: "Kliknij dwa elementy, żeby poprowadzić między nimi przewód z opisem kabla", shortcut: "K", grupa: "instalacja" },
  // Notatki dla montera (F6 z audytu 5.11.2026) — trafiają też na rzut w PDF.
  { id: "notatka", label: "Notatka", icon: StickyNote, hint: "Kliknij na planie, żeby dodać notatkę — trafi też na wydruk", shortcut: "N", grupa: "notatki" },
  { id: "skala", label: "Kalibracja skali", icon: Ruler, hint: "Ustaw, ile metrów ma odcinek", shortcut: "S", grupa: "skala" },
];
