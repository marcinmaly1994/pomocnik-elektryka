/**
 * Dobór wkładki topikowej gG do warunku ochrony przeciwporażeniowej (samoczynne
 * wyłączenie zasilania) — spec pkt 5.3, wariant z zabezpieczeniem topikowym
 * zamiast wyłącznika nadprądowego.
 *
 * W odróżnieniu od wyłączników B/C/D (gdzie Ia = k·In wg jednej stałej krotności
 * z PN-EN 60898-1), charakterystyka wkładki topikowej NIE jest liniowa — Imax
 * (prąd zapewniający wyłączenie w zadanym czasie) pochodzi WPROST z tablicy
 * czasowo-prądowej producenta/normy, osobno dla 0,2 s / 0,4 s / 5 s. Dlatego ten
 * kalkulator odczytuje Imax z `gGFuses.ts`, a nie liczy go ze wzoru.
 *
 * Tablica NIE pokrywa czasu 1 s (obwód rozdzielczy w układzie TT) ani 0,1 s —
 * dla takiego przypadku kalkulator zwraca błąd zamiast zgadywać wartość
 * pośrednią interpolacją.
 */

import { maksCzasWylaczenia_s, type UkladSieci } from "@/lib/norms/conductors";
import {
  CZAS_GG_LABELS,
  dobierzWkladkeGG,
  punktCzasowy,
  TYP_WKLADKI_LABELS,
  type CzasGG,
  type TypWkladkiGG,
} from "@/lib/norms/gGFuses";
import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok } from "./result";

export interface WkladkaGGWejscie {
  typ: TypWkladkiGG;
  /** Prąd obliczeniowy obwodu [A] — do doboru najmniejszej wystarczającej wkładki. */
  Ib_A: number;
  uklad: UkladSieci;
  obwodOdbiorczy: boolean;
  /** Zmierzona/obliczona impedancja pętli zwarcia Zs [Ω] — opcjonalnie, do oceny warunku. */
  zmierzonaZs_ohm?: number;
}

export interface WkladkaGGWynik {
  In_A: number;
  /** Umowny prąd wyłączający [A] (informacyjnie — dotyczy czasu n godzin, nie czasu ochronnego). */
  I2_A: number;
  czas_s: number;
  /** Prąd zapewniający wyłączenie w zadanym czasie — odpowiednik Ia dla wyłącznika. */
  Imax_A: number;
  /** Maksymalna dopuszczalna impedancja pętli zwarcia przy tym czasie. */
  ZsMax_ohm: number;
}

export function dobierzWkladkeGGOchrona(w: WkladkaGGWejscie): CalcResult<WkladkaGGWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Ib_A > 0)) bledy.push({ code: "IB", pole: "Ib_A", message: "Prąd obliczeniowy musi być większy od zera." });
  if (w.zmierzonaZs_ohm !== undefined && !(w.zmierzonaZs_ohm > 0))
    bledy.push({ code: "ZS", pole: "zmierzonaZs_ohm", message: "Impedancja pętli zwarcia musi być większa od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const U0 = 230;
  const czasWymagany = maksCzasWylaczenia_s(w.uklad, w.obwodOdbiorczy);
  if (czasWymagany !== 0.2 && czasWymagany !== 0.4 && czasWymagany !== 5) {
    return bladWyniku([
      {
        code: "CZAS_BRAK_W_TABLICY",
        pole: "uklad",
        message: `Dla układu ${w.uklad}, obwód ${w.obwodOdbiorczy ? "odbiorczy" : "rozdzielczy"} wymagany czas wyłączenia to ${formatLiczba(
          czasWymagany,
          1
        )} s. Wbudowana tablica charakterystyk wkładek gG (Poradnik Projektanta Elektryka, tabl. Z.10.3/Z.10.4) podaje wyłącznie punkty 0,2 s / 0,4 s / 5 s — nie zawiera tego czasu. Kalkulator nie interpoluje ani nie ekstrapoluje.`,
      },
    ]);
  }
  const czas: CzasGG = czasWymagany === 0.2 ? "0.2" : czasWymagany === 0.4 ? "0.4" : "5";

  const wiersz = dobierzWkladkeGG(w.typ, w.Ib_A);
  if (!wiersz) {
    return bladWyniku([
      {
        code: "IN_POZA_ZAKRESEM",
        pole: "Ib_A",
        message: `Brak wkładki typu ${TYP_WKLADKI_LABELS[w.typ]} o In ≥ ${formatLiczba(
          w.Ib_A,
          1
        )} A w wbudowanej tablicy. Sprawdź inny typ wkładki lub podział obwodu.`,
      },
    ]);
  }

  const punkt = punktCzasowy(wiersz, czas);
  const kroki: Krok[] = [
    {
      opis: "Dobór najmniejszej wkładki pokrywającej prąd obliczeniowy",
      wzor: "In ≥ Ib",
      podstawienie: `In ≥ ${formatLiczba(w.Ib_A, 1)} A → ${TYP_WKLADKI_LABELS[w.typ]}, In = ${wiersz.In_A} A`,
      wynik: `${wiersz.In_A} A`,
    },
    {
      opis: `Prąd zapewniający wyłączenie w czasie ${CZAS_GG_LABELS[czas]}, odczytany z tablicy`,
      wzor: "Imax — wartość tabelaryczna, NIE ze wzoru",
      podstawienie: `${TYP_WKLADKI_LABELS[w.typ]}, In=${wiersz.In_A} A, t=${czasWymagany} s`,
      wynik: `${formatLiczba(punkt.Imax_A, 1)} A  (k = ${formatLiczba(punkt.k, 1)}×In)`,
    },
    {
      opis: "Maksymalna dopuszczalna impedancja pętli zwarcia",
      wzor: "Zs max = U₀ / Imax",
      podstawienie: `${formatLiczba(U0, 0)} / ${formatLiczba(punkt.Imax_A, 1)}`,
      wynik: `${formatLiczba(punkt.Zkdop_ohm, 3)} Ω`,
    },
  ];

  const ocena =
    w.zmierzonaZs_ohm !== undefined
      ? ocenPodLimitem(w.zmierzonaZs_ohm, punkt.Zkdop_ohm, { co: "Impedancja pętli zwarcia Zs", jednostka: "Ω" })
      : null;
  if (w.zmierzonaZs_ohm !== undefined) {
    kroki.push({
      opis: "Ocena warunku ochronnego",
      wzor: "Zs (zmierzona) ≤ Zs max",
      podstawienie: `${formatLiczba(w.zmierzonaZs_ohm, 3)} ≤ ${formatLiczba(punkt.Zkdop_ohm, 3)}`,
      wynik: ocena!.verdict,
    });
  }

  const zalozenia = [
    `Wartości Imax i Zs max pochodzą wprost z tablicy czasowo-prądowej wkładki (nie ze wzoru) — dobór tabelaryczny, zgodnie z zakazem estymacji/interpolacji wartości normatywnych.`,
    `Czas ${formatLiczba(czasWymagany, 1)} s to MAKSYMALNY dopuszczalny czas wyłączenia wg PN-HD 60364-4-41 tabl. 41.1 dla układu ${w.uklad}, U₀=${formatLiczba(
      U0,
      0
    )} V.`,
    "Tablica źródłowa podaje Zkdop już przeliczone dla U₀ = 230 V (sieć TN/TT 230/400 V) — kalkulator nie przelicza na inne napięcie względem ziemi.",
  ];
  if (w.zmierzonaZs_ohm === undefined)
    zalozenia.push("Nie podano zmierzonej/obliczonej impedancji pętli zwarcia — warunek ochronny NIE został oceniony, podano wyłącznie dane dobranej wkładki.");

  return {
    wartosci: { In_A: wiersz.In_A, I2_A: wiersz.I2_A, czas_s: czasWymagany, Imax_A: punkt.Imax_A, ZsMax_ohm: punkt.Zkdop_ohm },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "Poradnik Projektanta Elektryka", miejsce: w.typ === "D0gG" ? "tabl. Z.10.3" : "tabl. Z.10.4", czego: "charakterystyka czasowo-prądowa wkładki gG" },
      { norma: "PN-HD 60364-4-41", miejsce: "tabl. 41.1", czego: "maksymalny czas wyłączenia" },
    ],
    bledy: [],
  };
}
