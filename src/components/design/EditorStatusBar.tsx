import { AlertTriangle, ArrowRight, Check, Layers } from "lucide-react";
import { oczkoSiatkiM } from "@/lib/design";
import type { Point, RoomShape } from "@/types";
import { polygonAreaM2 } from "@/lib/geometry";
import { SaveIndicator } from "@/components/ui/SaveIndicator";
import { formatLiczba } from "@/lib/liczby";
import type { stanSprawdzenia } from "@/lib/planCheck";

/**
 * Pasek stanu pod płótnem: powierzchnia, liczba elementów, skala, pozycja kursora
 * i stan zapisu.
 *
 * Wszystkie te liczby dało się wcześniej wyczytać najwyżej pośrednio (albo wcale),
 * a to one mówią użytkownikowi, czy projekt idzie w dobrą stronę — stąd stałe
 * miejsce na dole, a nie rozsypane po zakładkach.
 */

export interface EditorStatusBarProps {
  floorName: string;
  roomShapes: RoomShape[];
  elementCount: number;
  metersPerUnit: number | null;
  /**
   * Powiększenie widoku — potrzebne do odczytu oczka siatki, bo skok siatki idzie za
   * powiększeniem (patrz `krokSiatki`). Bez tego pasek podawałby oczko sprzed zmiany
   * i mierzenie nim rysunku dawałoby zły wynik.
   */
  zoom: number;
  /** Pozycja kursora w jednostkach planu; `null`, gdy kursor jest poza płótnem.
   *  Nie „poza planem": płótno nie ma granic, więc każdy punkt pod kursorem jest
   *  punktem planu (patrz `planPoint` w DesignCanvas). */
  cursor: Point | null;
  /**
   * Przejście do kolejnego kroku przepływu — przycisk na prawym końcu paska.
   *
   * Stoi TUTAJ, a nie jako pływająca pigułka w rogu okna (tak działa na pozostałych
   * zakładkach, patrz App.tsx), bo pigułka leżała na płótnie i zjadała tam kliknięcia.
   * Pasek stanu jest tuż pod rysunkiem i zawsze w kadrze (płótno kończy się nad nim —
   * patrz `wysokoscPlotna`), więc przycisk jest równie blisko oka, a rysunku nie
   * dotyka. Sąsiedztwo jest zresztą sensowne: obok liczby elementów i powierzchni
   * stoi „a teraz dobierz do tego zabezpieczenia".
   *
   * `undefined`, gdy nie ma dokąd iść — projekt jest pusty albo to ostatni krok.
   */
  nastepnyKrok?: { tytul: string; przejdz: () => void; pobierz: () => void };
  /**
   * Szerokość rzutu w metrach — tak laik sprawdzi, czy skala się zgadza („1:50" nic
   * mu nie mówi bez formatu arkusza w ręku). Stała dawniej osobną plakietką POD
   * paskiem, poza zarezerwowanym miejscem, więc przy 1440×900 wisiała przycięta
   * dolną krawędzią okna. Tu siedzi przy oczku siatki — to ten sam rodzaj odczytu.
   */
  szerokoscRzutuM?: number | null;
  /** Stan sprawdzenia rzutu (patrz `stanSprawdzenia`) i skok do karty z uwagami. */
  sprawdzenie?: { stan: ReturnType<typeof stanSprawdzenia>; pokaz: () => void };
}

const KOLOR_SPRAWDZENIA = { error: "#A2352C", warn: "#8A5526", ok: "#2C6B4A", pusto: "#64748B" } as const;

/** Suma powierzchni obrysowanych pomieszczeń [m²]. `null` bez kalibracji skali. */
export function totalRoomAreaM2(roomShapes: RoomShape[], metersPerUnit: number | null): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return null;
  let sum = 0;
  for (const r of roomShapes) {
    const a = polygonAreaM2(r.points, metersPerUnit);
    if (a !== null) sum += a;
  }
  return sum;
}

function fmt(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",");
}

export function EditorStatusBar({
  floorName,
  roomShapes,
  elementCount,
  metersPerUnit,
  zoom,
  cursor,
  nastepnyKrok,
  szerokoscRzutuM = null,
  sprawdzenie,
}: EditorStatusBarProps) {
  const area = totalRoomAreaM2(roomShapes, metersPerUnit);
  const oczko = oczkoSiatkiM(metersPerUnit, zoom);

  return (
    <div
      role="status"
      aria-label="Stan projektu"
      className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-card border border-border bg-white px-3.5 py-2 text-[11.5px] text-slate-500"
    >
      <span className="flex items-center gap-1.5 font-medium text-slate-600">
        <Layers size={13} className="text-slate-400" /> {floorName}
      </span>

      <span>
        Powierzchnia:{" "}
        <span className="pe-mono text-slate-700">
          {area === null ? "— (brak skali)" : `${fmt(area)} m²`}
        </span>
      </span>

      <span>
        Elementy: <span className="pe-mono text-slate-700">{elementCount}</span>
      </span>

      {/* Oczko siatki, a NIE „1 jedn. = 5,00 cm". Jednostka planu to pojecie z kodu —
          elektryk nie ma jak go uzyc ani z czym zestawic. Oczko widac na ekranie, wiec
          ten odczyt da sie sprawdzic wzrokiem: „pokoj ma cztery kratki, czyli 4 m". */}
      {/*
        SZEROKOŚĆ PASKA JEST POLICZONA. Pasek zawija się, gdy pozycje się nie mieszczą,
        a jego wysokość odbiera się płótnu (patrz `zapasPod`) — zawinięcie w chwili,
        gdy kursor wjeżdża nad plan i rośnie odczyt X/Y, przesuwa rzut spod kursora.
        Przy 1280 px stary pasek miał 17 px zapasu po najechaniu. Stąd progi niżej:
        szerokość rzutu w wierszu dopiero od 1536 px (poniżej w dymku „Siatki"), odczyt
        kursora od 1440 px, a pozycja sprawdzenia krótka. Pilnuje tego
        e2e/instalacja-uwagi.spec.ts („pasek stanu nie zawija się…").
      */}
      <span title={oczko !== null && szerokoscRzutuM !== null ? `Rzut ma ok. ${formatLiczba(szerokoscRzutuM, 1)} m szerokości` : undefined}>
        Siatka:{" "}
        <span className="pe-mono text-slate-700">
          {oczko === null ? "skala nieustawiona" : `oczko ${fmt(oczko)} m`}
        </span>
        {oczko !== null && szerokoscRzutuM !== null && (
          <span className="hidden min-[1536px]:inline" data-testid="szerokosc-rzutu">
            {" · "}rzut <span className="pe-mono text-slate-700">≈ {formatLiczba(szerokoscRzutuM, 1)} m</span>
          </span>
        )}
      </span>

      {sprawdzenie && sprawdzenie.stan.poziom !== "pusto" && (
        <button
          type="button"
          onClick={sprawdzenie.pokaz}
          aria-label={`Pokaż sprawdzenie rzutu: ${sprawdzenie.stan.tekst}`}
          className="flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          style={{ color: KOLOR_SPRAWDZENIA[sprawdzenie.stan.poziom] }}
          data-poziom={sprawdzenie.stan.poziom}
          data-testid="sprawdzenie-w-pasku"
          title={`Sprawdzenie rzutu: ${sprawdzenie.stan.tekst} — pokaż`}
        >
          {sprawdzenie.stan.poziom === "error" || sprawdzenie.stan.poziom === "warn" ? (
            <AlertTriangle size={13} className="shrink-0" />
          ) : (
            <Check size={13} className="shrink-0" />
          )}
          {sprawdzenie.stan.krotko}
        </button>
      )}

      {/* Współrzędne kursora liczone od lewego górnego rogu planu. Pokazywane tylko
          nad planem — poza nim nie ma czego mierzyć, a zamrożona ostatnia wartość
          wyglądałaby jak zawieszony odczyt. */}
      <span className="pe-mono hidden tabular-nums min-[1440px]:inline">
        {cursor && metersPerUnit !== null
          ? `X: ${fmt(cursor.x * metersPerUnit)} m   Y: ${fmt(cursor.y * metersPerUnit)} m`
          : cursor
            ? `X: ${Math.round(cursor.x)}   Y: ${Math.round(cursor.y)} jedn.`
            : "X: —   Y: —"}
      </span>

      {/*
        Prawy koniec paska: stan zapisu i przejście do kolejnego kroku (patrz
        `nastepnyKrok` — to działanie, a nie odczyt, więc stoi za informacjami).

        Grupa ma STAŁĄ wysokość, także wtedy, gdy przycisku nie ma, i to nie jest
        kosmetyka. Przycisk pojawia się przy PIERWSZYM narysowanym obiekcie; gdyby
        podnosił wtedy pasek o swoje kilka pikseli, zmieniłaby się też wysokość płótna
        (pasek jest pod nim rezerwowany — patrz `zapasPod` w DesignTab.tsx), rzut
        przeskalowałby się i uciekł spod kursora dokładnie w chwili, gdy użytkownik coś
        stawia. Dokładnie ten sam powód, dla którego wysokość płótna pomija banery.
      */}
      <span className="ml-auto flex h-[25px] shrink-0 items-center gap-4">
        <SaveIndicator compact />
        {nastepnyKrok && (
          <button
            onClick={nastepnyKrok.przejdz}
            onPointerEnter={nastepnyKrok.pobierz}
            onFocus={nastepnyKrok.pobierz}
            className="flex h-full shrink-0 items-center gap-1.5 rounded-full bg-copper px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-copper/90"
          >
            Dalej: {nastepnyKrok.tytul}
            <ArrowRight size={13} />
          </button>
        )}
      </span>
    </div>
  );
}
