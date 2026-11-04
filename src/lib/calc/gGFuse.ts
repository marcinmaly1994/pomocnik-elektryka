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

import { C_NAPIECIOWE, maksCzasWylaczenia_s, type UkladSieci } from "@/lib/norms/conductors";
import { zsMaxDlaIa } from "@/lib/panel/sizing";
import {
  CZAS_GG_LABELS,
  dobierzWkladkeGG,
  punktCzasowy,
  TYP_WKLADKI_LABELS,
  type CzasGG,
  type TypWkladkiGG,
} from "@/lib/norms/gGFuses";
import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok, type Ocena } from "./result";

const KOLEJNOSC_WERDYKTU: Record<string, number> = { niespelniony: 3, graniczny: 2, spelniony: 1 };

/** Jeden werdykt z kilku warunków — decyduje najgorszy, a jego komunikaty idą razem. */
function najgorszaOcena(oceny: Ocena[]): Ocena | null {
  if (oceny.length === 0) return null;
  const waga = (o: Ocena) => KOLEJNOSC_WERDYKTU[o.verdict] ?? 0;
  const max = Math.max(...oceny.map(waga));
  const najgorsze = oceny.filter((o) => waga(o) === max);
  const marginesy = oceny.map((o) => o.margines_pct).filter((m): m is number => typeof m === "number");
  return {
    verdict: najgorsze[0].verdict,
    margines_pct: marginesy.length ? Math.min(...marginesy) : null,
    komunikat: najgorsze.map((o) => o.komunikat).join(" "),
  };
}

export interface WkladkaGGWejscie {
  typ: TypWkladkiGG;
  /** Prąd obliczeniowy obwodu [A] — do doboru najmniejszej wystarczającej wkładki. */
  Ib_A: number;
  uklad: UkladSieci;
  obwodOdbiorczy: boolean;
  /** Zmierzona/obliczona impedancja pętli zwarcia Zs [Ω] — opcjonalnie, do oceny warunku. */
  zmierzonaZs_ohm?: number;
  /**
   * Obciążalność długotrwała przewodu Iz [A] po współczynnikach — opcjonalnie, do
   * warunku przeciążeniowego I₂ ≤ 1,45·Iz (PN-HD 60364-4-43, 433.1). Bez niej warunek
   * nie jest sprawdzany i wynik mówi o tym wprost.
   */
  Iz_A?: number;
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
  if (w.Iz_A !== undefined && !(w.Iz_A > 0))
    bledy.push({ code: "IZ", pole: "Iz_A", message: "Obciążalność przewodu musi być większa od zera." });
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
  // Zs max z TYM SAMYM współczynnikiem Cmin = 0,95 co dla wyłączników (`zsMaxDlaIa`),
  // a nie gotowe Zkdop z tablicy (= 230/Imax). Wcześniej wkładka dopuszczała pętlę
  // o 5% dłuższą niż wyłącznik przy tym samym prądzie zadziałania — dwa różne
  // założenia o napięciu sieci w jednej aplikacji (audyt 2026-11-04, B8).
  const ZsMax = zsMaxDlaIa(punkt.Imax_A);
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
      wzor: "Zs max = Cmin · U₀ / Imax",
      podstawienie: `${formatLiczba(C_NAPIECIOWE.min, 2)} · ${formatLiczba(U0, 0)} / ${formatLiczba(punkt.Imax_A, 1)}`,
      wynik: `${formatLiczba(ZsMax, 3)} Ω`,
    },
  ];

  const oceny: Ocena[] = [];
  if (w.zmierzonaZs_ohm !== undefined) {
    const o = ocenPodLimitem(w.zmierzonaZs_ohm, ZsMax, { co: "Impedancja pętli zwarcia Zs", jednostka: "Ω" });
    oceny.push(o);
    kroki.push({
      opis: "Ocena warunku ochronnego",
      wzor: "Zs (zmierzona) ≤ Zs max",
      podstawienie: `${formatLiczba(w.zmierzonaZs_ohm, 3)} ≤ ${formatLiczba(ZsMax, 3)}`,
      wynik: o.verdict,
    });
  }

  // Warunek przeciążeniowy. Dla wyłączników I₂ = 1,45·In, więc wystarcza In ≤ Iz; wkładka
  // gG ma I₂ = 1,6·In (od 16 A), czyli In ≤ ~0,9·Iz. Dobór „In ≥ Ib" sam tego nie pilnuje —
  // wkładka 25 A na przewodzie o Iz = 24 A przechodziła bez słowa (audyt, B9).
  if (w.Iz_A !== undefined) {
    const granica = 1.45 * w.Iz_A;
    const o = ocenPodLimitem(wiersz.I2_A, granica, { co: "Umowny prąd zadziałania I₂", jednostka: "A" });
    oceny.push(
      o.verdict === "niespelniony"
        ? {
            ...o,
            komunikat: `${o.komunikat} Wkładka ${wiersz.In_A} A nie chroni przewodu o Iz ${formatLiczba(w.Iz_A, 1)} A przed przeciążeniem — większa wkładka nie pomoże, potrzebny jest przewód o większej obciążalności.`,
          }
        : o
    );
    kroki.push({
      opis: "Warunek przeciążeniowy",
      wzor: "I₂ ≤ 1,45 · Iz",
      podstawienie: `${formatLiczba(wiersz.I2_A, 1)} ≤ 1,45 · ${formatLiczba(w.Iz_A, 1)} = ${formatLiczba(granica, 1)}`,
      wynik: o.verdict,
    });
  }
  const ocena = najgorszaOcena(oceny);

  const zalozenia = [
    `Wartości Imax i Zs max pochodzą wprost z tablicy czasowo-prądowej wkładki (nie ze wzoru) — dobór tabelaryczny, zgodnie z zakazem estymacji/interpolacji wartości normatywnych.`,
    `Czas ${formatLiczba(czasWymagany, 1)} s to MAKSYMALNY dopuszczalny czas wyłączenia wg PN-HD 60364-4-41 tabl. 41.1 dla układu ${w.uklad}, U₀=${formatLiczba(
      U0,
      0
    )} V.`,
    `Zs max liczone z Cmin = ${formatLiczba(C_NAPIECIOWE.min, 2)} (PN-EN 60909-0) — tak samo jak dla wyłączników nadprądowych, więc oba rodzaje zabezpieczeń ocenia ta sama miara. Gotowe Zkdop z tablicy źródłowej (= 230 V / Imax) jest o 5% łagodniejsze.`,
  ];
  if (w.zmierzonaZs_ohm === undefined)
    zalozenia.push("Nie podano zmierzonej/obliczonej impedancji pętli zwarcia — warunek ochronny NIE został oceniony, podano wyłącznie dane dobranej wkładki.");
  if (w.Iz_A === undefined)
    zalozenia.push(
      `Nie podano obciążalności przewodu Iz — warunek przeciążeniowy I₂ ≤ 1,45·Iz NIE został sprawdzony. Dla tej wkładki wymaga on Iz ≥ ${formatLiczba(wiersz.I2_A / 1.45, 1)} A.`
    );

  return {
    wartosci: { In_A: wiersz.In_A, I2_A: wiersz.I2_A, czas_s: czasWymagany, Imax_A: punkt.Imax_A, ZsMax_ohm: ZsMax },
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
