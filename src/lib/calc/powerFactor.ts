/**
 * Kompensacja mocy biernej — spec pkt 5.7.
 *
 * Poza samym Qc kalkulator liczy CZĘSTOTLIWOŚĆ REZONANSU układu bateria–sieć.
 * To nie jest dodatek: bateria kondensatorów wstawiona do sieci z odbiorami
 * nieliniowymi tworzy z indukcyjnością sieci obwód rezonansowy i potrafi
 * WZMOCNIĆ harmoniczną zamiast poprawić współczynnik mocy — z przeciążeniem
 * kondensatorów włącznie. Dlatego wynik zawsze mówi, w pobliżu której
 * harmonicznej wypada rezonans, i kiedy potrzebne są dławiki odstrojające.
 */

import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

export type UkladBaterii = "trojkat" | "gwiazda" | "jednofazowo";

export const UKLAD_BATERII_LABELS: Record<UkladBaterii, string> = {
  trojkat: "trójkąt (Δ)",
  gwiazda: "gwiazda (Y)",
  jednofazowo: "1-fazowo",
};

export interface KompensacjaWejscie {
  /** Moc czynna odbioru [W]. */
  P_W: number;
  cosfi1: number;
  cosfi2: number;
  /** Napięcie [V] — międzyfazowe dla układu 3-fazowego. */
  napiecie_V: number;
  czestotliwosc_Hz: number;
  uklad: UkladBaterii;
  /** Moc zwarciowa w punkcie przyłączenia [VA] — do sprawdzenia rezonansu. */
  Sk_VA?: number;
}

export interface KompensacjaWynik {
  tgfi1: number;
  tgfi2: number;
  /** Wymagana moc baterii [var]. */
  Qc_var: number;
  /** Pojemność [F]. */
  C_F: number;
  /** Rząd harmonicznej, przy której wypada rezonans. `null` bez podanej Sk. */
  rzadRezonansu: number | null;
  czestotliwoscRezonansu_Hz: number | null;
}

/** tgφ z cosφ: tgφ = √(1/cos²φ − 1). */
export function tgFi(cosfi: number): number {
  return Math.sqrt(1 / (cosfi * cosfi) - 1);
}

/**
 * Rzędy harmonicznych, w pobliżu których rezonans jest realnym zagrożeniem —
 * to harmoniczne dominujące w sieciach z prostownikami 6-pulsowymi (falowniki,
 * zasilacze impulsowe, LED). Rezonans obok 5. albo 7. jest groźny, obok 23.
 * praktycznie nie ma czego wzmacniać.
 */
const HARMONICZNE_RYZYKOWNE = [3, 5, 7, 11, 13];

export function obliczKompensacje(w: KompensacjaWejscie): CalcResult<KompensacjaWynik> {
  const bledy: CalcError[] = [];
  if (!(w.P_W > 0)) bledy.push({ code: "MOC", pole: "P_W", message: "Moc czynna musi być większa od zera." });
  if (!(w.cosfi1 > 0) || w.cosfi1 > 1)
    bledy.push({ code: "COSFI1", pole: "cosfi1", message: "Początkowy cosφ musi mieścić się w przedziale (0; 1]." });
  if (!(w.cosfi2 > 0) || w.cosfi2 > 1)
    bledy.push({ code: "COSFI2", pole: "cosfi2", message: "Docelowy cosφ musi mieścić się w przedziale (0; 1]." });
  if (w.cosfi2 < w.cosfi1)
    bledy.push({
      code: "COSFI_MALEJE",
      pole: "cosfi2",
      message: "Docelowy cosφ jest niższy od początkowego — kompensacja ma go PODNOSIĆ. Sprawdź, czy wartości nie są zamienione miejscami.",
    });
  if (!(w.napiecie_V > 0)) bledy.push({ code: "NAPIECIE", pole: "napiecie_V", message: "Napięcie musi być większe od zera." });
  if (!(w.czestotliwosc_Hz > 0))
    bledy.push({ code: "CZESTOTLIWOSC", pole: "czestotliwosc_Hz", message: "Częstotliwość musi być większa od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const t1 = tgFi(w.cosfi1);
  const t2 = tgFi(w.cosfi2);
  const Qc = w.P_W * (t1 - t2);
  const omega = 2 * Math.PI * w.czestotliwosc_Hz;
  // Δ: C = Qc/(3·ω·U²) przy U międzyfazowym; Y i 1-faz.: C = Qc/(ω·U²).
  const C = w.uklad === "trojkat" ? Qc / (3 * omega * w.napiecie_V * w.napiecie_V) : Qc / (omega * w.napiecie_V * w.napiecie_V);

  const kroki: Krok[] = [
    {
      opis: "Tangens kąta fazowego — stan początkowy i docelowy",
      wzor: "tgφ = √(1/cos²φ − 1)",
      podstawienie: `cosφ₁ = ${formatLiczba(w.cosfi1, 2)} → tgφ₁ = ${formatLiczba(t1, 4)};  cosφ₂ = ${formatLiczba(w.cosfi2, 2)} → tgφ₂ = ${formatLiczba(t2, 4)}`,
      wynik: `tgφ₁ = ${formatLiczba(t1, 4)}, tgφ₂ = ${formatLiczba(t2, 4)}`,
    },
    {
      opis: "Wymagana moc baterii kondensatorów",
      wzor: "Qc = P · (tgφ₁ − tgφ₂)",
      podstawienie: `${formatLiczba(w.P_W / 1000, 2)} kW · (${formatLiczba(t1, 4)} − ${formatLiczba(t2, 4)})`,
      wynik: `${formatLiczba(Qc / 1000, 2)} kvar`,
    },
    {
      opis: `Pojemność baterii — układ ${UKLAD_BATERII_LABELS[w.uklad]}`,
      wzor: w.uklad === "trojkat" ? "C = Qc / (3 · ω · U²)" : "C = Qc / (ω · U²)",
      podstawienie: `${formatLiczba(Qc, 0)} / (${w.uklad === "trojkat" ? "3 · " : ""}${formatLiczba(omega, 1)} · ${formatLiczba(w.napiecie_V, 0)}²)`,
      wynik: `${formatLiczba(C * 1e6, 1)} µF${w.uklad === "trojkat" ? " na gałąź" : ""}`,
    },
  ];

  // --- rezonans --------------------------------------------------------------
  let rzad: number | null = null;
  let fr: number | null = null;
  const zalozenia: string[] = [
    "Kompensacja równoległa (statyczna) dla obciążenia o stałym charakterze.",
    "Pominięto wpływ harmonicznych na wartość skuteczną prądu baterii.",
  ];

  if (w.Sk_VA && w.Sk_VA > 0 && Qc > 0) {
    rzad = Math.sqrt(w.Sk_VA / Qc);
    fr = w.czestotliwosc_Hz * rzad;
    kroki.push({
      opis: "Częstotliwość rezonansu układu bateria–sieć",
      wzor: "n_r = √(Sk / Qc);  f_r = f · n_r",
      podstawienie: `√(${formatLiczba(w.Sk_VA / 1000, 0)} kVA / ${formatLiczba(Qc / 1000, 2)} kvar) = ${formatLiczba(rzad, 2)};  f_r = ${formatLiczba(w.czestotliwosc_Hz, 0)} · ${formatLiczba(rzad, 2)}`,
      wynik: `n_r ≈ ${formatLiczba(rzad, 2)} (f_r ≈ ${formatLiczba(fr, 0)} Hz)`,
    });

    const blisko = HARMONICZNE_RYZYKOWNE.find((h) => Math.abs(rzad! - h) <= 0.5);
    if (blisko !== undefined) {
      zalozenia.push(
        `UWAGA: rezonans wypada przy ${formatLiczba(rzad, 2)}, czyli w pobliżu ${blisko}. harmonicznej. Przy odbiorach nieliniowych bateria bez dławików odstrojających będzie tę harmoniczną WZMACNIAĆ. Zastosuj dławiki 7% (odstrojenie ok. 189 Hz) albo 14% (ok. 134 Hz) i zweryfikuj pomiarem zawartości harmonicznych.`
      );
    } else {
      zalozenia.push(
        `Rezonans wypada przy ${formatLiczba(rzad, 2)} — z dala od dominujących harmonicznych (3., 5., 7., 11., 13.). Przy znaczącym udziale odbiorów nieliniowych i tak zalecany pomiar zawartości harmonicznych przed doborem baterii.`
      );
    }
  } else {
    zalozenia.push(
      "Nie podano mocy zwarciowej — NIE sprawdzono ryzyka rezonansu. Przy odbiorach nieliniowych (falowniki, zasilacze impulsowe, LED) to sprawdzenie jest obowiązkowe przed doborem baterii."
    );
  }

  return {
    wartosci: { tgfi1: t1, tgfi2: t2, Qc_var: Qc, C_F: C, rzadRezonansu: rzad, czestotliwoscRezonansu_Hz: fr },
    kroki,
    ocena: null,
    zalozenia,
    zrodla: [{ norma: "N SEP-E-002", czego: "kompensacja mocy biernej w instalacjach nn" }],
    bledy: [],
  };
}
