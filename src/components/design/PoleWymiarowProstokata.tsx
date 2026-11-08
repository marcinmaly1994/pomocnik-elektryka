import { useState } from "react";
import { prostokatOdKotwicy } from "@/lib/geometry";
import type { Point } from "@/types";
import { Button } from "@/components/ui/button";

/**
 * Wymiary prostokątnego pomieszczenia wpisane z klawiatury, zamiast rysowane myszą.
 *
 * „Mam pokój 4 × 3" to zdanie, które użytkownik tej aplikacji ma w głowie gotowe —
 * a dotąd musiał je zamieniać na celowanie kursorem w piksel. Kotwicę nadal stawia
 * kliknięciem, więc to on decyduje GDZIE; wpisuje tylko JAK DUŻY.
 *
 * Trzy rzeczy działają tu tak samo jak w `PoleDlugosciOdcinka` obok i z tych samych
 * powodów: przecinek dziesiętny jest zamieniany na kropkę, Enter nie wychodzi poza
 * pole, a wartości żyją w stanie lokalnym.
 */
export function PoleWymiarowProstokata({
  kotwica,
  mpu,
  planSize,
  onUtworz,
}: {
  kotwica: Point;
  /** Metrów na jednostkę planu; `null` = plan bez kalibracji. */
  mpu: number | null;
  planSize: { w: number; h: number };
  onUtworz: (punkty: Point[]) => void;
}) {
  const [szerokosc, setSzerokosc] = useState("");
  const [wysokosc, setWysokosc] = useState("");

  /** Przecinek pod ręką na polskiej klawiaturze numerycznej, a `Number("4,2")` to NaN. */
  function liczba(tekst: string): number {
    return Number(tekst.replace(",", "."));
  }

  function utworz() {
    const szer = liczba(szerokosc);
    const wys = liczba(wysokosc);
    const wJednostkach = (v: number) => (mpu !== null ? v / mpu : v);
    const punkty = prostokatOdKotwicy(kotwica, wJednostkach(szer), wJednostkach(wys), planSize);
    // `null` znaczy „to nie jest prostokąt" — nie robimy nic i zostawiamy wpisane
    // wartości na ekranie, żeby użytkownik zobaczył, co poprawić.
    if (!punkty) return;
    setSzerokosc("");
    setWysokosc("");
    onUtworz(punkty);
  }

  function obsluzEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // Enter poza polem zatwierdza rysowaną figurę (patrz obsługa klawiatury
    // w DesignTab). Tutaj ma utworzyć pomieszczenie z wpisanych wymiarów i nic więcej.
    e.preventDefault();
    e.stopPropagation();
    utworz();
  }

  const pole = "w-16 rounded border border-border px-1.5 py-0.5";

  return (
    // Dwa nierozrywalne kawałki, które ZAWIJAJĄ SIĘ względem siebie: podpis i pola
    // z przyciskiem. Wcześniej całość była jednym `whitespace-nowrap` + `shrink-0`
    // i na telefonie (320–390 px) drugie pole, jednostka i „Utwórz" wypadały poza
    // nakładkę nad rzutem — przycisku nie dało się nacisnąć (audyt 5.11.2026).
    // Same pola z przyciskiem (ok. 230 px) mieszczą się w nakładce nawet przy 320 px.
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-slate-500">
      <span className="whitespace-nowrap">albo podaj wymiary:</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
      <input
        data-testid="room-rect-width-input"
        type="text"
        inputMode="decimal"
        aria-label="Szerokość pomieszczenia"
        value={szerokosc}
        onChange={(e) => setSzerokosc(e.target.value)}
        onKeyDown={obsluzEnter}
        className={pole}
      />
      ×
      <input
        data-testid="room-rect-height-input"
        type="text"
        inputMode="decimal"
        aria-label="Wysokość pomieszczenia"
        value={wysokosc}
        onChange={(e) => setWysokosc(e.target.value)}
        onKeyDown={obsluzEnter}
        className={pole}
      />
      {mpu !== null ? "m" : "jedn."}
      <Button variant="secondary" size="sm" onClick={utworz} className="shrink-0 text-sm">
        Utwórz
      </Button>
      </span>
    </span>
  );
}
