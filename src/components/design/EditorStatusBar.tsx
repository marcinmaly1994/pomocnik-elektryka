import { ArrowRight, Layers } from "lucide-react";
import { oczkoSiatkiM } from "@/lib/design";
import type { Point, RoomShape } from "@/types";
import { polygonAreaM2 } from "@/lib/geometry";
import { SaveIndicator } from "@/components/ui/SaveIndicator";

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
  /** Pozycja kursora w jednostkach planu; `null`, gdy poza planem. */
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
}

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
  cursor,
  nastepnyKrok,
}: EditorStatusBarProps) {
  const area = totalRoomAreaM2(roomShapes, metersPerUnit);
  const oczko = oczkoSiatkiM(metersPerUnit);

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
      <span>
        Siatka:{" "}
        <span className="pe-mono text-slate-700">
          {oczko === null ? "skala nieustawiona" : `oczko ${fmt(oczko)} m`}
        </span>
      </span>

      {/* Współrzędne kursora liczone od lewego górnego rogu planu. Pokazywane tylko
          nad planem — poza nim nie ma czego mierzyć, a zamrożona ostatnia wartość
          wyglądałaby jak zawieszony odczyt. */}
      <span className="pe-mono tabular-nums">
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
