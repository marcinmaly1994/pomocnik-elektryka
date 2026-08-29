/**
 * Spadek napięcia — kalkulator wg specyfikacji pkt 5.1.
 *
 * Dwie metody, świadomie rozdzielone:
 *  - UPROSZCZONA (sama rezystancja) — dopuszczalna tylko dla małych przekrojów
 *    albo cosφ ≈ 1; powyżej `MIN_PRZEKROJ_Z_REAKTANCJA_MM2` jej użycie jest
 *    zakazane (spec pkt 7) i kończy się twardym błędem, a nie ostrzeżeniem:
 *    przy 240 mm² reaktancja potrafi dać większy udział w spadku niż rezystancja,
 *    więc wynik uproszczony nie jest „trochę mniej dokładny", tylko nieprawdziwy.
 *  - PEŁNA (R i X) — ΔU = k·I·L·(R'·cosφ + X'·sinφ).
 *
 * Obciążenie ROZŁOŻONE liczone jest sumą momentów prądowych Σ(Iᵢ·Lᵢ) mierzonych
 * od punktu zasilania do każdego odbioru — nie jako prąd skupiony na końcu linii.
 * Różnica jest zasadnicza dla linii oświetleniowych: dziesięć opraw rozłożonych
 * równomiernie na 100 m daje spadek ok. dwa razy mniejszy niż ta sama moc
 * podpięta na końcu, więc liczenie „na końcu" przewymiarowuje kabel.
 */

import {
  MIN_PRZEKROJ_Z_REAKTANCJA_MM2,
  TEMP_PRACY,
  X_JEDNOSTKOWA_OHM_KM,
  rezystywnoscRobocza,
  type Izolacja,
  type Material,
  type ModelRezystywnosci,
  type RodzajLinii,
} from "@/lib/norms/conductors";
import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok, type Ocena } from "./result";

export type UkladFaz = "1f" | "3f";

/** Jeden odbiór na trasie — do obciążenia rozłożonego. */
export interface OdbiorNaTrasie {
  /** Odległość od punktu ZASILANIA [m]. */
  dlugosc_m: number;
  /** Prąd tego odbioru [A]. */
  prad_A: number;
}

export interface SpadekWejscie {
  uklad: UkladFaz;
  /** Napięcie odniesienia [V]: 230 dla 1-faz., 400 (międzyfazowe) dla 3-faz. */
  napiecie_V: number;
  /** Prąd obliczeniowy [A]. Alternatywa dla `moc_W`. */
  prad_A?: number;
  /** Moc czynna [W] — dla 3-faz. moc TRÓJFAZOWA. Alternatywa dla `prad_A`. */
  moc_W?: number;
  cosfi: number;
  /** Długość trasy w jedną stronę [m] — dla obciążenia skupionego. */
  dlugosc_m?: number;
  /** Obciążenie rozłożone — ma pierwszeństwo przed `dlugosc_m`/prądem skupionym. */
  odbiory?: OdbiorNaTrasie[];
  material: Material;
  przekroj_mm2: number;
  izolacja: Izolacja;
  /** Temperatura żyły [°C]. Domyślnie temperatura pracy wg izolacji.
   *  Ma znaczenie tylko dla modelu `temperaturowy`. */
  tempZyly_C?: number;
  /** Model rezystywności — domyślnie uproszczenie normy (zał. G), zgodnie
   *  z doborem obwodów w Rozdzielnicy. Patrz `ModelRezystywnosci`. */
  modelRezystywnosci?: ModelRezystywnosci;
  /** Czy uwzględniać reaktancję (metoda pełna). */
  zReaktancja: boolean;
  rodzajLinii?: RodzajLinii;
  /** Nadpisanie X' [Ω/km] — parametr edytowalny wg spec pkt 4. */
  xJednostkowa_ohm_km?: number;
  /** Liczba przewodów równoległych na fazę. */
  rownolegle?: number;
  /** Dopuszczalny spadek [%] — edytowalny (3/5/6/8 wg rodzaju zasilania). */
  limit_pct: number;
}

export interface SpadekWynik {
  /** Prąd obliczeniowy [A] — wyliczony albo podany wprost. */
  prad_A: number;
  spadek_V: number;
  spadek_pct: number;
  /** Napięcie na końcu linii [V]. */
  napiecieKoncowe_V: number;
  /** Suma momentów prądowych Σ(Iᵢ·Lᵢ) [A·m] — podstawa rachunku. */
  momentPradowy_Am: number;
  R_ohm: number;
  X_ohm: number;
  /** Najmniejszy przekrój z szeregu handlowego mieszczący się w limicie [mm²]. */
  minPrzekroj_mm2: number | null;
}

/** Szereg handlowy przekrojów [mm²] — do podpowiedzi „co by weszło". */
const SZEREG_PRZEKROJOW = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

/** Mnożnik długości w rachunku: pętla (2·L) dla 1 fazy, √3·L dla 3 faz symetrycznych. */
function mnoznikUkladu(uklad: UkladFaz): number {
  return uklad === "3f" ? Math.sqrt(3) : 2;
}

function walidacja(w: SpadekWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.napiecie_V > 0)) b.push({ code: "NAPIECIE", pole: "napiecie_V", message: "Napięcie musi być większe od zera." });
  if (!(w.cosfi > 0) || w.cosfi > 1)
    b.push({ code: "COSFI", pole: "cosfi", message: "Współczynnik mocy musi mieścić się w przedziale (0; 1]." });
  if (!(w.przekroj_mm2 > 0))
    b.push({ code: "PRZEKROJ", pole: "przekroj_mm2", message: "Przekrój żyły musi być większy od zera." });

  const maObciazenie = (w.prad_A ?? 0) > 0 || (w.moc_W ?? 0) > 0;
  if (!maObciazenie && !(w.odbiory && w.odbiory.length > 0))
    b.push({ code: "BRAK_OBCIAZENIA", message: "Podaj prąd obliczeniowy albo moc odbiornika." });

  const maDlugosc = (w.dlugosc_m ?? 0) > 0 || (w.odbiory && w.odbiory.some((o) => o.dlugosc_m > 0));
  if (!maDlugosc) b.push({ code: "BRAK_DLUGOSCI", pole: "dlugosc_m", message: "Podaj długość trasy — bez niej nie ma czego liczyć." });

  // Spec pkt 7: metoda uproszczona jest ZABRONIONA dla dużych przekrojów.
  if (!w.zReaktancja && w.przekroj_mm2 >= MIN_PRZEKROJ_Z_REAKTANCJA_MM2)
    b.push({
      code: "UPROSZCZONA_ZA_DUZY_PRZEKROJ",
      pole: "zReaktancja",
      message: `Dla przekroju ${formatLiczba(w.przekroj_mm2, 0)} mm² (≥ ${MIN_PRZEKROJ_Z_REAKTANCJA_MM2} mm²) metoda uproszczona jest niedopuszczalna — reaktancja przestaje być pomijalna. Włącz uwzględnianie reaktancji.`,
    });

  if (!(w.limit_pct > 0)) b.push({ code: "LIMIT", pole: "limit_pct", message: "Dopuszczalny spadek napięcia musi być większy od zera." });
  return b;
}

/**
 * Prąd obliczeniowy z mocy: I = P/(U·cosφ) dla 1 fazy, P/(√3·U·cosφ) dla 3 faz.
 * Podany wprost prąd ma pierwszeństwo.
 */
function pradObliczeniowy(w: SpadekWejscie): number {
  if ((w.prad_A ?? 0) > 0) return w.prad_A!;
  const mianownik = w.uklad === "3f" ? Math.sqrt(3) * w.napiecie_V * w.cosfi : w.napiecie_V * w.cosfi;
  return mianownik > 0 ? (w.moc_W ?? 0) / mianownik : 0;
}

export function obliczSpadekNapiecia(w: SpadekWejscie): CalcResult<SpadekWynik> {
  const bledy = walidacja(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const tempZyly = w.tempZyly_C ?? TEMP_PRACY[w.izolacja];
  const model = w.modelRezystywnosci ?? "annexG";
  const rho = rezystywnoscRobocza(w.material, model, tempZyly);
  const gamma = 1 / rho;
  const n = w.rownolegle && w.rownolegle > 0 ? w.rownolegle : 1;
  const k = mnoznikUkladu(w.uklad);
  const kroki: Krok[] = [];
  const zalozenia: string[] = [];

  // --- prąd i moment prądowy -------------------------------------------------
  const rozlozone = !!(w.odbiory && w.odbiory.length > 0);
  const I = rozlozone ? w.odbiory!.reduce((s, o) => s + o.prad_A, 0) : pradObliczeniowy(w);

  if (!rozlozone && (w.prad_A ?? 0) <= 0) {
    kroki.push({
      opis: "Prąd obliczeniowy z mocy",
      wzor: w.uklad === "3f" ? "I = P / (√3 · U · cosφ)" : "I = P / (U · cosφ)",
      podstawienie:
        w.uklad === "3f"
          ? `${formatLiczba(w.moc_W ?? 0, 0)} / (√3 · ${formatLiczba(w.napiecie_V, 0)} · ${formatLiczba(w.cosfi, 2)})`
          : `${formatLiczba(w.moc_W ?? 0, 0)} / (${formatLiczba(w.napiecie_V, 0)} · ${formatLiczba(w.cosfi, 2)})`,
      wynik: `${formatLiczba(I, 2)} A`,
    });
  }

  // Moment prądowy Σ(Iᵢ·Lᵢ) — dla obciążenia skupionego to po prostu I·L.
  const moment = rozlozone
    ? w.odbiory!.reduce((s, o) => s + o.prad_A * o.dlugosc_m, 0)
    : I * (w.dlugosc_m ?? 0);

  if (rozlozone) {
    kroki.push({
      opis: "Suma momentów prądowych (obciążenie rozłożone)",
      wzor: "M = Σ(Iᵢ · Lᵢ)",
      podstawienie: w.odbiory!.map((o) => `${formatLiczba(o.prad_A, 2)}·${formatLiczba(o.dlugosc_m, 1)}`).join(" + "),
      wynik: `${formatLiczba(moment, 1)} A·m`,
    });
    zalozenia.push(
      "Obciążenie rozłożone: spadek liczony sumą momentów prądowych od punktu zasilania do każdego odbioru, a nie jako prąd skupiony na końcu linii."
    );
  }

  // --- rezystancja i reaktancja ---------------------------------------------
  // R liczone z MOMENTU, więc w rachunku figuruje jako R na metr × moment.
  const Rjedn = rho / (w.przekroj_mm2 * n); // [Ω/m]
  const xJedn_ohm_km = w.xJednostkowa_ohm_km ?? X_JEDNOSTKOWA_OHM_KM[w.rodzajLinii ?? "kabel_wielozylowy"];
  const Xjedn = w.zReaktancja ? xJedn_ohm_km / 1000 / n : 0; // [Ω/m]
  const sinfi = Math.sqrt(Math.max(0, 1 - w.cosfi * w.cosfi));

  kroki.push(
    model === "annexG"
      ? {
          opis: "Rezystywność w warunkach ruchowych (uproszczenie normy, zał. G)",
          wzor: "ρ = 1,25 · ρ₂₀",
          podstawienie: `1,25 · 1/${formatLiczba(w.material === "Cu" ? 56 : 35, 0)}`,
          wynik: `${formatLiczba(rho, 5)} Ω·mm²/m  (γ = ${formatLiczba(gamma, 1)} m/(Ω·mm²))`,
        }
      : {
          opis: `Rezystywność w temperaturze żyły ${formatLiczba(tempZyly, 0)} °C`,
          wzor: "ρ(θ) = ρ₂₀ · [1 + α · (θ − 20)]",
          podstawienie: `1/${formatLiczba(w.material === "Cu" ? 56 : 35, 0)} · [1 + ${w.material === "Cu" ? "0,00393" : "0,00403"} · (${formatLiczba(tempZyly, 0)} − 20)]`,
          wynik: `${formatLiczba(rho, 5)} Ω·mm²/m  (γ = ${formatLiczba(gamma, 1)} m/(Ω·mm²))`,
        }
  );

  let spadek_V: number;
  if (w.zReaktancja) {
    spadek_V = k * moment * (Rjedn * w.cosfi + Xjedn * sinfi);
    kroki.push({
      opis: "Spadek napięcia — metoda pełna (R i X)",
      wzor: w.uklad === "3f" ? "ΔU = √3 · M · (R' · cosφ + X' · sinφ)" : "ΔU = 2 · M · (R' · cosφ + X' · sinφ)",
      podstawienie: `${w.uklad === "3f" ? "√3" : "2"} · ${formatLiczba(moment, 1)} · (${formatLiczba(Rjedn, 7)}·${formatLiczba(w.cosfi, 2)} + ${formatLiczba(Xjedn, 7)}·${formatLiczba(sinfi, 3)})`,
      wynik: `${formatLiczba(spadek_V, 2)} V`,
    });
    zalozenia.push(
      `Metoda pełna: uwzględniona reaktancja jednostkowa X' = ${formatLiczba(xJedn_ohm_km, 3)} Ω/km${w.xJednostkowa_ohm_km !== undefined ? " (wartość podana ręcznie)" : ""}.`
    );
  } else {
    spadek_V = (k * moment) / (gamma * w.przekroj_mm2 * n);
    kroki.push({
      opis: "Spadek napięcia — metoda uproszczona (sama rezystancja)",
      wzor: w.uklad === "3f" ? "ΔU = √3 · M / (γ · S)" : "ΔU = 2 · M / (γ · S)",
      podstawienie: `${w.uklad === "3f" ? "√3" : "2"} · ${formatLiczba(moment, 1)} / (${formatLiczba(gamma, 1)} · ${formatLiczba(w.przekroj_mm2, 1)}${n > 1 ? ` · ${n}` : ""})`,
      wynik: `${formatLiczba(spadek_V, 2)} V`,
    });
    zalozenia.push("Metoda uproszczona: pominięta reaktancja — dopuszczalna dla małych przekrojów albo cosφ bliskiego 1.");
  }

  const spadek_pct = (spadek_V / w.napiecie_V) * 100;
  kroki.push({
    opis: "Spadek względny",
    wzor: "ΔU% = ΔU / U · 100%",
    podstawienie: `${formatLiczba(spadek_V, 2)} / ${formatLiczba(w.napiecie_V, 0)} · 100%`,
    wynik: `${formatLiczba(spadek_pct, 2)} %`,
  });

  // --- najmniejszy przekrój mieszczący się w limicie -------------------------
  const minPrzekroj =
    SZEREG_PRZEKROJOW.find((S) => {
      const R = rho / (S * n);
      const X = w.zReaktancja ? xJedn_ohm_km / 1000 / n : 0;
      const dU = k * moment * (R * w.cosfi + X * sinfi);
      return (dU / w.napiecie_V) * 100 <= w.limit_pct;
    }) ?? null;

  const ocena: Ocena = ocenPodLimitem(spadek_pct, w.limit_pct, { co: "Spadek napięcia", jednostka: "%" });

  zalozenia.push(
    model === "annexG"
      ? "Rezystywność wg uproszczenia PN-HD 60364-5-52 zał. G (1,25 × ρ₂₀) — ta sama wartość, którą dobiera obwody zakładka Rozdzielnica, więc oba miejsca podają identyczny wynik. Dla PVC (70 °C) jest to wartość konserwatywna, dla XLPE (90 °C) lekko optymistyczna — przy XLPE rozważ model temperaturowy."
      : `Rezystywność z modelu temperaturowego dla ${formatLiczba(tempZyly, 0)} °C (izolacja ${w.izolacja}). UWAGA: to podejście jest ok. 5% mniej konserwatywne od uproszczenia zał. G i na styku limitu może dopuścić mniejszy przekrój niż dobór w Rozdzielnicy.`
  );
  if (n > 1) zalozenia.push(`${n} przewody równoległe na fazę — założono równomierny rozdział prądu (jednakowa długość i przekrój).`);

  return {
    wartosci: {
      prad_A: I,
      spadek_V,
      spadek_pct,
      napiecieKoncowe_V: w.napiecie_V - spadek_V,
      momentPradowy_Am: moment,
      R_ohm: Rjedn * (rozlozone ? 0 : w.dlugosc_m ?? 0),
      X_ohm: Xjedn * (rozlozone ? 0 : w.dlugosc_m ?? 0),
      minPrzekroj_mm2: minPrzekroj,
    },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-52", miejsce: "zał. G", czego: "dopuszczalne spadki napięcia" },
      { norma: "PN-HD 60364-5-52", czego: "dobór oprzewodowania" },
    ],
    bledy: [],
  };
}
