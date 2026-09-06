/**
 * Maksymalna długość obwodu — „ile metrów mogę pociągnąć 2,5 mm² pod B16?".
 *
 * Pytanie, które elektryk zadaje sobie na budowie częściej niż jakiekolwiek inne,
 * a które dotąd wymagało tu przeliczania w drugą stronę: wpisz długość, popatrz na
 * wynik, popraw długość, popatrz jeszcze raz. Ten kalkulator odwraca rachunek i
 * podaje granicę wprost.
 *
 * Granice są DWIE i wiąże ta niższa:
 *
 *  (1) SPADEK NAPIĘCIA — ΔU = k·L·Ib·ρ/S ≤ ΔU_dop, czyli L ≤ ΔU_dop·S / (k·Ib·ρ).
 *  (2) SAMOCZYNNE WYŁĄCZENIE — Zs = Z_przed + L·ρ·(1/S_L + 1/S_PE) ≤ Cmin·U₀/Ia,
 *      czyli L ≤ (Zs_max − Z_przed) / (ρ·(1/S_L + 1/S_PE)).
 *
 * Warunku cieplnego (S ≥ Ik·√t/k) tu NIE MA — i to nie przeoczenie. Wydłużanie
 * obwodu ZMNIEJSZA prąd zwarcia, więc warunek cieplny robi się łatwiejszy, a nie
 * trudniejszy; jedyne, co długość psuje po stronie zwarciowej, to zdolność
 * zabezpieczenia do zadziałania — czyli dokładnie warunek (2).
 *
 * Pętla zwarciowa liczona jest jako FAZA + PE, bo prąd zwarcia doziemnego płynie
 * tam i z powrotem różnymi żyłami. Przy PE o połowie przekroju fazy rezystancja
 * pętli jest trzy razy większa niż samej fazy — pominięcie tego dawałoby długości
 * grubo poza normą.
 */

import {
  GAMMA_20,
  KROTNOSC_MAGNETYCZNA,
  MIN_PRZEKROJ_Z_REAKTANCJA_MM2,
  TEMP_PRACY,
  rezystywnoscRobocza,
  type Izolacja,
  type Material,
  type ModelRezystywnosci,
} from "@/lib/norms/conductors";
import { U0 } from "@/lib/panel/norms";
import { zsMaxDlaIa } from "@/lib/panel/sizing";
import {
  bladWyniku,
  formatLiczba,
  ocenPodLimitem,
  type CalcError,
  type CalcResult,
  type Krok,
  type Ocena,
} from "./result";
import type { UkladFaz } from "./voltageDrop";

export type Charakterystyka = "B" | "C" | "D";

export interface DlugoscWejscie {
  uklad: UkladFaz;
  /** Napięcie odniesienia [V]: 230 dla 1-faz., 400 (międzyfazowe) dla 3-faz. */
  napiecie_V: number;
  /** Prąd obliczeniowy obwodu [A] — do warunku spadku napięcia. */
  prad_A: number;
  material: Material;
  izolacja: Izolacja;
  przekroj_mm2: number;
  /** Przekrój żyły ochronnej [mm²] — pętla zwarciowa idzie fazą I przewodem PE. */
  przekrojPE_mm2: number;
  modelRezystywnosci?: ModelRezystywnosci;
  charakterystyka: Charakterystyka;
  /** Prąd znamionowy zabezpieczenia [A]. */
  In_A: number;
  /** Impedancja pętli PRZED tym odcinkiem [Ω] — od transformatora do rozdzielnicy. */
  Zs_przed_Ohm: number;
  /** Budżet spadku napięcia dla tego odcinka [%]. */
  limitSpadku_pct: number;
  /** Planowana długość trasy [m] — to ją oceniamy względem wyliczonej granicy. */
  dlugoscPlanowana_m: number;
}

export type WiazaceKryterium = "spadek" | "ochrona";

export interface DlugoscWynik {
  /** Granica wiążąca [m] — mniejsza z dwóch. */
  L_max_m: number;
  L_spadek_m: number;
  L_ochrona_m: number;
  wiazace: WiazaceKryterium;
  /** Prąd zadziałania wyzwalacza magnetycznego [A]. */
  Ia_A: number;
  Zs_max_Ohm: number;
  /** Rezystancja pętli faza+PE na metr [Ω/m]. */
  rPetli_ohm_m: number;
  /** Dopuszczalny spadek wyrażony w woltach [V]. */
  spadekDopuszczalny_V: number;
}

/** Mnożnik długości: pętla (2·L) dla 1 fazy, √3·L dla 3 faz symetrycznych. */
function mnoznikUkladu(uklad: UkladFaz): number {
  return uklad === "3f" ? Math.sqrt(3) : 2;
}

function walidacja(w: DlugoscWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.napiecie_V > 0)) b.push({ code: "NAPIECIE", pole: "napiecie_V", message: "Napięcie musi być większe od zera." });
  if (!(w.prad_A > 0))
    b.push({ code: "PRAD", pole: "prad_A", message: "Podaj prąd obliczeniowy obwodu — bez niego nie ma czego liczyć." });
  if (!(w.przekroj_mm2 > 0))
    b.push({ code: "PRZEKROJ", pole: "przekroj_mm2", message: "Przekrój żyły fazowej musi być większy od zera." });
  if (!(w.przekrojPE_mm2 > 0))
    b.push({ code: "PRZEKROJ_PE", pole: "przekrojPE_mm2", message: "Przekrój żyły ochronnej musi być większy od zera." });
  if (!(w.In_A > 0))
    b.push({ code: "IN", pole: "In_A", message: "Podaj prąd znamionowy zabezpieczenia." });
  if (!(w.limitSpadku_pct > 0))
    b.push({ code: "LIMIT", pole: "limitSpadku_pct", message: "Dopuszczalny spadek napięcia musi być większy od zera." });
  if (w.Zs_przed_Ohm < 0)
    b.push({ code: "ZS_PRZED", pole: "Zs_przed_Ohm", message: "Impedancja przed odcinkiem nie może być ujemna." });

  // Ta sama granica, co w kalkulatorze spadku napięcia: metoda uproszczona
  // (sama rezystancja) jest niedopuszczalna dla dużych przekrojów, bo reaktancja
  // przestaje być pomijalna. Kalkulator długości liczy WYŁĄCZNIE uproszczoną,
  // więc nie ma tu czego włączyć — zostaje twardy błąd.
  if (w.przekroj_mm2 >= MIN_PRZEKROJ_Z_REAKTANCJA_MM2)
    b.push({
      code: "ZA_DUZY_PRZEKROJ",
      pole: "przekroj_mm2",
      message: `Dla przekroju ${formatLiczba(w.przekroj_mm2, 0)} mm² (≥ ${MIN_PRZEKROJ_Z_REAKTANCJA_MM2} mm²) ten kalkulator się nie sprawdzi — przy takich żyłach reaktancja przestaje być pomijalna, a rachunek długości pomija ją z założenia. Użyj „Spadku napięcia" z metodą pełną i „Impedancji pętli zwarcia".`,
    });
  return b;
}

/**
 * Ocena planowanej trasy względem wyliczonej granicy.
 *
 * Osobno obsłużony jest przypadek granicy ZEROWEJ: gdy sama impedancja przed
 * odcinkiem przekracza już dopuszczalną, żadna długość nie spełni warunku, a
 * `ocenPodLimitem` dzieliłoby wtedy przez zero i podało bezsensowny margines.
 */
function ocena(dlugosc_m: number, L_max_m: number, wiazace: WiazaceKryterium): Ocena {
  if (L_max_m <= 0) {
    return {
      verdict: "niespelniony",
      margines_pct: null,
      komunikat:
        "Impedancja pętli przed tym odcinkiem przekracza już wartość dopuszczalną dla tego zabezpieczenia — warunku samoczynnego wyłączenia nie spełni żadna długość. Zmień charakterystykę albo prąd znamionowy zabezpieczenia, dołóż RCD jako ochronę uzupełniającą lub popraw zasilanie rozdzielnicy.",
    };
  }
  const o = ocenPodLimitem(dlugosc_m, L_max_m, { co: "Długość trasy", jednostka: "m" });
  const powod = wiazace === "spadek" ? "spadek napięcia" : "samoczynne wyłączenie zasilania";
  return { ...o, komunikat: `${o.komunikat} Granicę wyznacza ${powod}.` };
}

export function obliczMaksymalnaDlugosc(w: DlugoscWejscie): CalcResult<DlugoscWynik> {
  const bledy = walidacja(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const model = w.modelRezystywnosci ?? "annexG";
  const tempZyly = TEMP_PRACY[w.izolacja];
  const rho = rezystywnoscRobocza(w.material, model, tempZyly);
  const k = mnoznikUkladu(w.uklad);
  const kroki: Krok[] = [];

  kroki.push({
    opis:
      model === "annexG"
        ? "Rezystywność w warunkach ruchowych (uproszczenie normy, zał. G)"
        : `Rezystywność w temperaturze żyły ${formatLiczba(tempZyly, 0)} °C`,
    wzor: model === "annexG" ? "ρ = 1,25 · ρ₂₀" : "ρ(θ) = ρ₂₀ · [1 + α · (θ − 20)]",
    podstawienie:
      model === "annexG"
        ? `1,25 · 1/${formatLiczba(GAMMA_20[w.material], 0)}`
        : `1/${formatLiczba(GAMMA_20[w.material], 0)} · [1 + ${w.material === "Cu" ? "0,00393" : "0,00403"} · (${formatLiczba(tempZyly, 0)} − 20)]`,
    wynik: `${formatLiczba(rho, 5)} Ω·mm²/m`,
  });

  // --- (1) granica ze spadku napięcia ---------------------------------------
  const dU_dop = (w.limitSpadku_pct / 100) * w.napiecie_V;
  kroki.push({
    opis: "Dopuszczalny spadek napięcia w woltach",
    wzor: "ΔU_dop = limit% · U",
    podstawienie: `${formatLiczba(w.limitSpadku_pct, 2)}% · ${formatLiczba(w.napiecie_V, 0)} V`,
    wynik: `${formatLiczba(dU_dop, 2)} V`,
  });

  const L_spadek = (dU_dop * w.przekroj_mm2) / (k * w.prad_A * rho);
  kroki.push({
    opis: "Granica z warunku spadku napięcia",
    wzor: w.uklad === "3f" ? "L ≤ ΔU_dop · S / (√3 · Ib · ρ)" : "L ≤ ΔU_dop · S / (2 · Ib · ρ)",
    podstawienie: `${formatLiczba(dU_dop, 2)} · ${formatLiczba(w.przekroj_mm2, 1)} / (${
      w.uklad === "3f" ? "√3" : "2"
    } · ${formatLiczba(w.prad_A, 2)} · ${formatLiczba(rho, 5)})`,
    wynik: `${formatLiczba(L_spadek, 1)} m`,
  });

  // --- (2) granica z warunku samoczynnego wyłączenia -------------------------
  const krotnosc = KROTNOSC_MAGNETYCZNA[w.charakterystyka].gora;
  const Ia = krotnosc * w.In_A;
  const Zs_max = zsMaxDlaIa(Ia);
  kroki.push({
    opis: "Prąd zadziałania wyzwalacza i dopuszczalna impedancja pętli",
    wzor: "Ia = k · In;  Zs_max = Cmin · U₀ / Ia",
    podstawienie: `Ia = ${krotnosc} · ${formatLiczba(w.In_A, 0)} = ${formatLiczba(Ia, 0)} A;  Zs_max = 0,95 · ${formatLiczba(U0, 0)} / ${formatLiczba(Ia, 0)}`,
    wynik: `${formatLiczba(Zs_max, 3)} Ω`,
  });

  const rPetli = rho * (1 / w.przekroj_mm2 + 1 / w.przekrojPE_mm2);
  kroki.push({
    opis: "Rezystancja pętli faza + PE na metr trasy",
    wzor: "r = ρ · (1/S_L + 1/S_PE)",
    podstawienie: `${formatLiczba(rho, 5)} · (1/${formatLiczba(w.przekroj_mm2, 1)} + 1/${formatLiczba(w.przekrojPE_mm2, 1)})`,
    wynik: `${formatLiczba(rPetli * 1000, 2)} mΩ/m`,
  });

  const zapasZs = Zs_max - w.Zs_przed_Ohm;
  const L_ochrona = Math.max(0, zapasZs / rPetli);
  kroki.push({
    opis: "Granica z warunku samoczynnego wyłączenia",
    wzor: "L ≤ (Zs_max − Z_przed) / r",
    podstawienie: `(${formatLiczba(Zs_max, 3)} − ${formatLiczba(w.Zs_przed_Ohm, 3)}) / ${formatLiczba(rPetli, 5)}`,
    wynik: `${formatLiczba(L_ochrona, 1)} m`,
  });

  // --- granica wiążąca -------------------------------------------------------
  const wiazace: WiazaceKryterium = L_spadek <= L_ochrona ? "spadek" : "ochrona";
  const L_max = Math.min(L_spadek, L_ochrona);
  kroki.push({
    opis: "Granica wiążąca — mniejsza z dwóch",
    wzor: "L_max = min(L_spadek, L_ochrona)",
    podstawienie: `min(${formatLiczba(L_spadek, 1)}; ${formatLiczba(L_ochrona, 1)})`,
    wynik: `${formatLiczba(L_max, 1)} m (${wiazace === "spadek" ? "spadek napięcia" : "samoczynne wyłączenie"})`,
  });

  return {
    wartosci: {
      L_max_m: L_max,
      L_spadek_m: L_spadek,
      L_ochrona_m: L_ochrona,
      wiazace,
      Ia_A: Ia,
      Zs_max_Ohm: Zs_max,
      rPetli_ohm_m: rPetli,
      spadekDopuszczalny_V: dU_dop,
    },
    kroki,
    ocena: ocena(w.dlugoscPlanowana_m, L_max, wiazace),
    zalozenia: [
      "Metoda uproszczona: sama rezystancja żyły, bez reaktancji — dopuszczalna dla przekrojów poniżej 35 mm².",
      "Pętla zwarciowa liczona jako faza + PE. Przy PE o połowie przekroju fazy rezystancja pętli jest trzy razy większa niż samej fazy.",
      `Prąd zadziałania przyjęty z GÓRNEJ krotności pasma wyzwalania (${w.charakterystyka} → ${krotnosc}·In) — dolna krotność nie gwarantuje zadziałania.`,
      "Współczynnik napięciowy Cmin = 0,95 (PN-EN 60909-0): napięcie w sieci bywa niższe od znamionowego, więc prąd zwarcia jest mniejszy niż przy 230 V.",
      "Warunek cieplny nie ogranicza długości: dłuższy obwód to mniejszy prąd zwarcia, czyli mniejsze obciążenie cieplne żyły.",
      "Obwód z wyłącznikiem różnicowoprądowym: RCD spełnia warunek samoczynnego wyłączenia niezależnie od impedancji pętli, więc realną granicą zostaje wtedy sam spadek napięcia.",
      "Prąd obliczeniowy przyjęty jako skupiony na końcu trasy. Dla obciążenia rozłożonego (np. linia opraw) granica jest większa — policz je w kalkulatorze „Spadek napięcia”.",
    ],
    zrodla: [
      { norma: "PN-HD 60364-5-52", miejsce: "zał. G", czego: "dopuszczalne spadki napięcia" },
      { norma: "PN-HD 60364-4-41", czego: "samoczynne wyłączenie zasilania, Zs · Ia ≤ U₀" },
      { norma: "PN-EN 60909-0", czego: "współczynnik napięciowy Cmin = 0,95" },
      { norma: "PN-EN 60898-1", czego: "krotności prądu wyzwalacza magnetycznego" },
    ],
    bledy: [],
  };
}
