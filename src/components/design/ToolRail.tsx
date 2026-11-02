import type { ToolMode } from "./DesignCanvas";
import { RAIL_TOOLS } from "./railTools";

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

/** `onToolRef` pozwala rodzicowi przypiąć się do konkretnego przycisku — coach-mark
 *  onboardingu rysuje strzałkę do „Kalibracji skali" i musi znać jej pozycję. */
export function ToolRail({
  value,
  onChange,
  onToolRef,
  pionowo = false,
}: {
  value: ToolMode;
  onChange: (t: ToolMode) => void;
  onToolRef?: (id: ToolMode, el: HTMLButtonElement | null) => void;
  /**
   * Wymusza układ PIONOWY niezależnie od szerokości okna.
   *
   * Domyślnie pasek jest responsywny: pionowy od `md` w górę, poziomy niżej — bo
   * w zwykłym widoku stoi wtedy nad planem, w poprzek. W pełnym ekranie jest jednak
   * lewą krawędzią karty przyklejonej do boku okna, więc układ poziomy rozpychał ją
   * na całą szerokość telefonu: zmierzone 345 px na ekranie 375 px, czyli po
   * odsłonięciu narzędzi znikał cały rysunek. Tam decyduje MIEJSCE, w którym pasek
   * stoi, a nie szerokość okna.
   */
  pionowo?: boolean;
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
      className={
        pionowo
          ? "pe-bez-suwaka flex min-w-0 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-1.5"
          : "pe-bez-suwaka flex min-w-0 flex-row gap-1 overflow-x-auto border-r border-border p-1.5 md:shrink-0 md:flex-col md:overflow-x-visible md:overflow-y-auto"
      }
      style={{ background: "#F7F9FB" }}
    >
      {RAIL_TOOLS.map(({ id, label, icon: Icon, hint, shortcut }) => {
        const active = value === id;
        return (
          <button
            key={id}
            ref={(el) => onToolRef?.(id, el)}
            onClick={() => onChange(id)}
            // Nazwa NA POCZATKU dymka, bo Pomoc odsyla do narzedzi wlasnie po niej
            // („narzedziem «Narysuj Sciane»"), a wczesniej byla wylacznie `aria-label` —
            // czyli widzialna tylko dla czytnikow ekranu. Widzacy uzytkownik czytal
            // w Pomocy o narzedziu, ktorego nazwy nie znajdowal nigdzie na ekranie:
            // ikony sa swiadomie bez podpisow, a dymek pokazywal sama wskazowke.
            title={`${label} — ${hint} (${shortcut})`}
            aria-label={label}
            aria-pressed={active}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={active ? { background: "#C1793F14", color: "#8A5526" } : { color: "#4F5D73" }}
          >
            <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
          </button>
        );
      })}
    </nav>
  );
}
