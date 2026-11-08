import { useEffect, useState } from "react";
import { przesunNaDlugosc } from "@/lib/geometry";
import type { Point } from "@/types";

/**
 * Długości odcinków JUŻ NARYSOWANEJ ściany — edycja po fakcie.
 *
 * Wpisywanie wymiarów w trakcie rysowania (`PoleDlugosciOdcinka`) pomaga tylko temu,
 * kto wie z góry, ile ma mieć. Pomyłkę zauważa się zwykle później — przy kosztorysie
 * albo przy sąsiednim pokoju — i wtedy jedyną drogą było przeciąganie narożnika myszą.
 *
 * Zmiana długości przesuwa PUNKT KOŃCOWY danego odcinka wzdłuż jego kierunku, czyli
 * robi dokładnie to, co przeciągnięcie tego narożnika, tylko dokładnie. Pozostałe
 * punkty zostają nietknięte. To świadomy wybór: aplikacja już nauczyła użytkownika,
 * że narożnik porusza dwa sąsiednie odcinki, i druga, sprzeczna reguła (przesuwanie
 * całego „ogona" ściany) rozjeżdżałaby się z tym, co widać przy przeciąganiu.
 */

/** Czy łamana jest zamknięta — ostatni punkt pokrywa się z pierwszym. Tak wygląda
 *  obrys domu rysowany jedną ścianą. */
function zamknieta(punkty: Point[]): boolean {
  if (punkty.length < 3) return false;
  const a = punkty[0];
  const b = punkty[punkty.length - 1];
  return Math.hypot(b.x - a.x, b.y - a.y) < 0.001;
}

function WierszOdcinka({
  numer,
  od,
  doPunktu,
  mpu,
  onZmiana,
}: {
  numer: number;
  od: Point;
  doPunktu: Point;
  mpu: number | null;
  onZmiana: (nowyPunkt: Point) => void;
}) {
  const wJednostkach = Math.hypot(doPunktu.x - od.x, doPunktu.y - od.y);
  const wyswietlana = mpu !== null ? Math.round(wJednostkach * mpu * 100) / 100 : Math.round(wJednostkach);

  // Stan lokalny z tego samego powodu co w `PoleDlugosciOdcinka`: liczony przy każdym
  // renderze uniemożliwiałby wpisanie „4,2" — po pierwszym znaku pole dostawałoby
  // z powrotem przeliczoną długość.
  const [tekst, setTekst] = useState(String(wyswietlana));
  useEffect(() => {
    setTekst(String(wyswietlana));
  }, [wyswietlana]);

  function zatwierdz() {
    const podana = Number(tekst.replace(",", "."));
    if (!Number.isFinite(podana) || podana <= 0) {
      setTekst(String(wyswietlana));
      return;
    }
    onZmiana(przesunNaDlugosc(od, doPunktu, mpu !== null ? podana / mpu : podana));
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="w-4 text-right text-slate-400">{numer}.</span>
      <input
        data-testid={`wall-segment-${numer}-length-input`}
        type="text"
        inputMode="decimal"
        aria-label={`Długość odcinka ${numer}`}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Enter poza polem zatwierdza rysowaną figurę — tutaj ma zatwierdzić
            // samą liczbę (patrz obsługa klawiatury w DesignTab).
            e.preventDefault();
            e.stopPropagation();
            zatwierdz();
          }
        }}
        onBlur={zatwierdz}
        className="pe-input w-20 px-1.5 py-0.5"
      />
      {mpu !== null ? "m" : "jedn."}
    </label>
  );
}

export function DlugosciOdcinkowSciany({
  punkty,
  mpu,
  onPrzesunPunkt,
}: {
  punkty: Point[];
  /** Metrów na jednostkę planu; `null` = plan bez kalibracji. */
  mpu: number | null;
  /** Ten sam wywołujący co przeciąganie narożnika — `moveWallPoint(id, index, point)`. */
  onPrzesunPunkt: (index: number, punkt: Point) => void;
}) {
  if (punkty.length < 2) return null;

  const czyZamknieta = zamknieta(punkty);
  // Ostatni odcinek ściany ZAMKNIĘTEJ domyka figurę — jego długość wynika z położenia
  // pozostałych punktów. Pole do wpisania otwierałoby obrys po cichu, więc go nie ma:
  // lepiej nie dać narzędzia, niż dać takie, które psuje figurę.
  const ostatni = czyZamknieta ? punkty.length - 2 : punkty.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="text-slate-500">Długości odcinków:</span>
      {punkty.slice(0, ostatni).map((od, i) => (
        <WierszOdcinka
          key={i}
          numer={i + 1}
          od={od}
          doPunktu={punkty[i + 1]}
          mpu={mpu}
          onZmiana={(nowy) => onPrzesunPunkt(i + 1, nowy)}
        />
      ))}
      {czyZamknieta && (
        <span className="text-slate-400">ostatni odcinek domyka obrys, więc wynika z pozostałych</span>
      )}
    </div>
  );
}
