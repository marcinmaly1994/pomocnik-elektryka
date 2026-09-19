import { useEffect, useState } from "react";
import { przesunNaDlugosc } from "@/lib/geometry";
import type { Point } from "@/types";

/**
 * Wpisanie długości OSTATNIEGO rysowanego odcinka — dla ściany i dla wieloboku
 * pomieszczenia.
 *
 * Zasada jest taka: klikasz z grubsza, a potem podajesz liczbę. Zmienia się wyłącznie
 * odległość ostatniego punktu od poprzedniego; kąt zostaje nietknięty, bo to on niesie
 * intencję kliknięcia. Bez tego jedyną drogą do wymiaru było celowanie myszą w piksel,
 * co przy planie mieszkania oznacza kilkanaście prób i tak nigdy nie daje równych 4,20 m.
 *
 * Osobny plik, a nie kolejny fragment `DesignTab` (3800 linii): to samodzielny kawałek
 * używany w dwóch miejscach, z własnym stanem pola i własną regułą zatwierdzania.
 */

/** Ile miejsc po przecinku ma sens przy danej jednostce. Milimetry to złudna
 *  dokładność przy planie klikanym myszą, ale centymetry są w budowlance normą. */
function zaokraglij(v: number, mpu: number | null): number {
  return mpu !== null ? Math.round(v * 100) / 100 : Math.round(v);
}

export function PoleDlugosciOdcinka({
  punkty,
  mpu,
  onZmiana,
  testId,
}: {
  punkty: Point[];
  /** Metrów na jednostkę planu; `null` = plan bez kalibracji. */
  mpu: number | null;
  onZmiana: (punkty: Point[]) => void;
  testId: string;
}) {
  const jestOdcinek = punkty.length >= 2;
  const od = jestOdcinek ? punkty[punkty.length - 2] : null;
  const doPunktu = jestOdcinek ? punkty[punkty.length - 1] : null;

  const dlugoscJednostek = od && doPunktu ? Math.hypot(doPunktu.x - od.x, doPunktu.y - od.y) : 0;
  const wyswietlana = zaokraglij(mpu !== null ? dlugoscJednostek * mpu : dlugoscJednostek, mpu);

  /**
   * Wartość pola żyje w stanie LOKALNYM, a nie jest liczona przy każdym renderze.
   *
   * Inaczej wpisywanie „4,2" byłoby niemożliwe: po pierwszym znaku pole dostałoby
   * z powrotem przeliczoną długość i skasowało to, co użytkownik właśnie pisze.
   * Zatwierdzamy dopiero Enterem albo wyjściem z pola.
   */
  const [tekst, setTekst] = useState(String(wyswietlana));
  useEffect(() => {
    setTekst(String(wyswietlana));
  }, [wyswietlana]);

  if (!jestOdcinek || !od || !doPunktu) return null;

  function zatwierdz() {
    // Przecinek dziesiętny: na polskiej klawiaturze numerycznej to on jest pod ręką,
    // a `Number("4,2")` daje NaN. Zamiana tutaj, a nie w funkcji geometrycznej —
    // to sprawa pola tekstowego, nie matematyki.
    const podana = Number(tekst.replace(",", "."));
    if (!Number.isFinite(podana) || podana <= 0) {
      setTekst(String(wyswietlana));
      return;
    }
    const wJednostkach = mpu !== null ? podana / mpu : podana;
    const nowyKoniec = przesunNaDlugosc(od!, doPunktu!, wJednostkach);
    onZmiana([...punkty.slice(0, -1), nowyKoniec]);
  }

  return (
    <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-slate-500">
      Długość odcinka:
      <input
        data-testid={testId}
        type="text"
        inputMode="decimal"
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Enter zatwierdza ŚCIANĘ, gdy pada poza polem (patrz obsługa klawiatury
            // w DesignTab). Tutaj ma zatwierdzić samą długość i nie zakończyć rysowania,
            // więc zdarzenie nie może polecieć dalej.
            e.preventDefault();
            e.stopPropagation();
            zatwierdz();
          }
        }}
        onBlur={zatwierdz}
        className="w-20 rounded border border-border px-1.5 py-0.5"
      />
      {mpu !== null ? "m" : "jedn."}
    </label>
  );
}
