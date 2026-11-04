/**
 * Pełny dobór przekroju i zabezpieczenia — spec pkt 5.2, cztery kryteria naraz.
 *
 * Norma nie pyta „jaki przekrój wystarczy pod obciążalność" — pyta, jaki
 * przekrój spełnia WSZYSTKIE CZTERY warunki jednocześnie:
 *   (1) obciążalność długotrwała (Ib ≤ In ≤ Iz),
 *   (2) spadek napięcia w dopuszczalnym limicie,
 *   (3) skuteczność ochrony przeciwporażeniowej (Zs·Ia ≤ U₀),
 *   (4) wytrzymałość zwarciowa cieplna (S ≥ Ik·√t / k).
 * Każdy z nich osobno wskazuje MINIMALNY przekrój, który go spełnia — wynikowy
 * przekrój to MAKSIMUM z tych czterech liczb, nie tylko z pierwszego z brzegu.
 * Kalkulator mówi wprost, KTÓRE kryterium zadecydowało, bo to jest właśnie
 * informacja, której zwykły „dobór pod obciążalność" nie daje.
 *
 * DANE WEJŚCIOWE — TYLKO 3-FAZOWE. Silnik korzysta z `ampacity3.ts`
 * (PN-HD 60364-5-52 tabl. B.52.4/B.52.5, TRZY żyły obciążone). Tablica dla
 * dwóch żył (obwody 1-fazowe) nie została jeszcze dostarczona — dopóki jej nie
 * ma, ten kalkulator odmawia liczenia obwodów 1-fazowych zamiast zgadywać
 * przez jakiś współczynnik przeliczeniowy.
 *
 * METODY D1/D2 (grunt) — bez korekty temperatury/grupowania. Współczynniki k1/k2
 * już w aplikacji (`temperatureFactor`, `groupingFactor`) są WPROST opisane jako
 * dotyczące POWIETRZA — użycie ich dla kabla w gruncie byłoby błędem fizycznym,
 * nie przybliżeniem. Dla D1/D2 wynik jest więc ważny dla warunków referencyjnych
 * tablicy (20°C grunt) — bez korekty na inną temperaturę gruntu, rezystywność
 * cieplną czy głębokość ułożenia (te tablice nie zostały jeszcze dostarczone).
 *
 * KRYTERIA 3 i 4 SĄ OPCJONALNE — wymagają danych, których ten kalkulator nie
 * ma skąd wziąć sam (impedancja źródła, prąd zwarcia). Bez nich są pomijane
 * z jawnym komunikatem, NIGDY po cichu.
 */

import {
  K_ZYLA,
  TEMP_PRACY,
  minPrzekrojPE,
  rezystywnoscRobocza,
  type Izolacja,
  type Material,
} from "@/lib/norms/conductors";
import {
  METODA_LABELS,
  obciazalnosc3Zyly,
  PRZEKROJE_3ZYLY_AL,
  PRZEKROJE_3ZYLY_CU,
  type MetodaOdniesienia3,
} from "@/lib/norms/ampacity3";
import { maksCzasWylaczenia_s, type UkladSieci } from "@/lib/norms/conductors";
import { CURVE_MULTIPLIER, groupingFactor, temperatureFactor, type Curve } from "@/lib/panel/norms";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";
import { wStrefieElektromagnetycznej } from "./warunekCieplny";

export type Kryterium = "obciazalnosc" | "spadek_napiecia" | "ochrona_przeciwporazeniowa" | "wytrzymalosc_zwarciowa";

export const KRYTERIUM_LABELS: Record<Kryterium, string> = {
  obciazalnosc: "obciążalność długotrwała",
  spadek_napiecia: "spadek napięcia",
  ochrona_przeciwporazeniowa: "ochrona przeciwporażeniowa",
  wytrzymalosc_zwarciowa: "wytrzymałość zwarciowa cieplna",
};

/** Czy metoda dotyczy ułożenia w GRUNCIE — decyduje o pominięciu korekt k1/k2. */
function metodaGruntowa(m: MetodaOdniesienia3): boolean {
  return m === "D1" || m === "D2";
}

export interface PelnyDoborWejscie {
  Ib_A: number;
  napiecie_V: number; // międzyfazowe, 3-fazowy
  material: Material;
  izolacja: Izolacja;
  metoda: MetodaOdniesienia3;
  temperatura_otoczenia_C?: number;
  obwodow_w_wiazce?: number;
  rozruch_silnikowy?: boolean;

  dlugosc_m: number;
  cosfi: number;
  limitSpadku_pct: number;

  /** Impedancja źródła i reszty obwodu PRZED tym odcinkiem [Ω] — do kryterium (3). */
  impedancjaZrodla_ohm?: number;
  uklad?: UkladSieci;
  obwodOdbiorczy?: boolean;

  /** Prąd zwarciowy w tym miejscu [A] — do kryterium (4). */
  Ik_A?: number;
}

export interface KryteriumWynik {
  minPrzekroj_mm2: number | null;
  ocenione: boolean;
  powod_pominiecia?: string;
}

export interface PelnyDoborWynik {
  przekroj_mm2: number;
  In_A: number;
  kabel: string;
  decydujace: Kryterium[];
  kryteria: Record<Kryterium, KryteriumWynik>;
  Iz_A: number;
}

const KABEL_LABEL: Record<Material, string> = { Cu: "YDY/YKY (Cu)", Al: "AsXSn/AKY (Al)" };

/**
 * Znormalizowane prądy znamionowe wyłączników — szereg PRZEMYSŁOWY.
 *
 * `BREAKER_RATINGS` w `lib/panel/norms.ts` jest jawnie „szeregiem domowym"
 * ograniczonym do 63 A — ten kalkulator sięga do 300 mm² i prądów grubo
 * powyżej 63 A, więc wymaga szerszego szeregu wyłączników/rozłączników
 * kompaktowych. Wartości znormalizowane wg PN-EN 60947-2 (typowe wielkości
 * ramowe aparatów kompaktowych).
 */
const PRZEMYSLOWE_IN = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630] as const;

function kandydaci(material: Material, metoda: MetodaOdniesienia3): number[] {
  const wszystkie = material === "Cu" ? PRZEKROJE_3ZYLY_CU : PRZEKROJE_3ZYLY_AL;
  return wszystkie.filter((s) => obciazalnosc3Zyly(material, "PVC", metoda, s) !== undefined || obciazalnosc3Zyly(material, "XLPE", metoda, s) !== undefined);
}

/** Prąd zadziałania wyzwalacza magnetycznego przy GÓRNEJ granicy pasma —
 *  spec pkt 7 zakazuje przyjmowania dolnej krotności do sprawdzeń ochronnych. */
function pradZadzialania(curve: Curve, In: number): number {
  return CURVE_MULTIPLIER[curve] * In;
}

export function pelnyDoborPrzekroju(w: PelnyDoborWejscie): CalcResult<PelnyDoborWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Ib_A > 0)) bledy.push({ code: "IB", pole: "Ib_A", message: "Prąd obliczeniowy musi być większy od zera." });
  if (!(w.napiecie_V > 0)) bledy.push({ code: "NAPIECIE", pole: "napiecie_V", message: "Napięcie musi być większe od zera." });
  if (!(w.dlugosc_m > 0)) bledy.push({ code: "DLUGOSC", pole: "dlugosc_m", message: "Długość trasy musi być większa od zera." });
  if (!(w.cosfi > 0) || w.cosfi > 1) bledy.push({ code: "COSFI", pole: "cosfi", message: "cosφ musi mieścić się w przedziale (0; 1]." });
  if (!(w.limitSpadku_pct > 0))
    bledy.push({ code: "LIMIT", pole: "limitSpadku_pct", message: "Dopuszczalny spadek napięcia musi być większy od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const grunt = metodaGruntowa(w.metoda);
  const k1 = grunt ? 1 : temperatureFactor(w.temperatura_otoczenia_C ?? 30);
  const k2 = grunt ? 1 : groupingFactor(w.obwodow_w_wiazce ?? 1);
  const candidates = kandydaci(w.material, w.metoda);
  const curve: Curve = w.rozruch_silnikowy ? "C" : "B";

  const kroki: Krok[] = [];
  const zalozenia: string[] = [
    `Metoda odniesienia ${METODA_LABELS[w.metoda]}.`,
    grunt
      ? "Metoda gruntowa (D1/D2): BEZ korekty temperatury gruntu, rezystywności cieplnej i głębokości ułożenia — te tablice nie zostały jeszcze dostarczone. Wynik ważny dla warunków referencyjnych tablicy (grunt 20°C)."
      : `Współczynniki poprawkowe (powietrze): k1 = ${formatLiczba(k1, 3)} (temperatura), k2 = ${formatLiczba(k2, 3)} (grupowanie).`,
  ];

  // --- kryterium 1: obciążalność + dobór zabezpieczenia ----------------------
  let S1: number | null = null;
  let In = 0;
  let IzWybrany = 0;
  for (const S of candidates) {
    const IzTab = obciazalnosc3Zyly(w.material, w.izolacja, w.metoda, S);
    if (IzTab === undefined) continue;
    const Iz = IzTab * k1 * k2;
    const InKand = PRZEMYSLOWE_IN.find((r) => r >= w.Ib_A && r <= Iz);
    if (InKand !== undefined) {
      S1 = S;
      In = InKand;
      IzWybrany = Iz;
      break;
    }
  }
  kroki.push({
    opis: "Kryterium 1 — obciążalność: najmniejszy przekrój z dobieralnym In (Ib ≤ In ≤ Iz)",
    wzor: "Iz = Iz,tab · k1 · k2;  Ib ≤ In ≤ Iz",
    podstawienie: `Ib = ${formatLiczba(w.Ib_A, 2)} A, przeszukano ${candidates.length} przekrojów tablicy`,
    wynik: S1 !== null ? `${formatLiczba(S1, 1)} mm² (In = ${curve}${In} A, Iz = ${formatLiczba(IzWybrany, 1)} A)` : "brak przekroju spełniającego warunek",
  });
  if (S1 === null) {
    return {
      wartosci: null,
      kroki,
      ocena: null,
      zalozenia,
      zrodla: [{ norma: "PN-HD 60364-4-43", czego: "warunek doboru zabezpieczenia" }],
      bledy: [
        {
          code: "OBCIAZALNOSC_NIE_DO_SPELNIENIA",
          message: `Żaden dostępny przekrój (do ${formatLiczba(candidates[candidates.length - 1] ?? 0, 0)} mm²) nie mieści prądu ${formatLiczba(w.Ib_A, 1)} A pod dobieralny wyłącznik przy tej metodzie ułożenia. Popraw warunki ułożenia albo podziel obciążenie.`,
        },
      ],
    };
  }

  // --- kryterium 2: spadek napięcia ------------------------------------------
  const gamma = 1 / rezystywnoscRobocza(w.material, "annexG", TEMP_PRACY[w.izolacja]);
  let S2: number | null = null;
  for (const S of candidates) {
    const dU = (Math.sqrt(3) * w.Ib_A * w.dlugosc_m) / (gamma * S);
    if ((dU / w.napiecie_V) * 100 <= w.limitSpadku_pct) {
      S2 = S;
      break;
    }
  }
  const dUatS2 = S2 !== null ? (Math.sqrt(3) * w.Ib_A * w.dlugosc_m) / (gamma * S2) : null;
  kroki.push({
    opis: "Kryterium 2 — spadek napięcia w limicie",
    wzor: "ΔU = √3 · Ib · L / (γ · S);  ΔU% ≤ limit",
    podstawienie: `√3 · ${formatLiczba(w.Ib_A, 2)} · ${formatLiczba(w.dlugosc_m, 1)} / (${formatLiczba(gamma, 1)} · S)`,
    wynik: S2 !== null ? `${formatLiczba(S2, 1)} mm² (ΔU = ${formatLiczba(dUatS2!, 2)} V = ${formatLiczba((dUatS2! / w.napiecie_V) * 100, 2)}%)` : "żaden przekrój nie mieści się w limicie",
  });

  // --- kryterium 3: ochrona przeciwporażeniowa (opcjonalne) ------------------
  let S3: number | null = null;
  let ocenioneS3 = false;
  let powodPominiecia3: string | undefined;
  if (w.impedancjaZrodla_ohm !== undefined && w.impedancjaZrodla_ohm >= 0) {
    ocenioneS3 = true;
    const U0 = w.napiecie_V / Math.sqrt(3);
    const Ia = pradZadzialania(curve, In);
    const ZsMax = U0 / Ia;
    const rho = rezystywnoscRobocza(w.material, "annexG", TEMP_PRACY[w.izolacja]);
    for (const S of candidates) {
      const Spe = minPrzekrojPE(S);
      const R = (rho * w.dlugosc_m) / S + (rho * w.dlugosc_m) / Spe;
      const Zs = w.impedancjaZrodla_ohm! + R;
      if (Zs <= ZsMax) {
        S3 = S;
        break;
      }
    }
    kroki.push({
      opis: "Kryterium 3 — ochrona przeciwporażeniowa (Zs · Ia ≤ U₀)",
      wzor: "Zs = Z_źródła + R_L(S) + R_PE(S);  Ia = k · In (górna granica pasma)",
      podstawienie: `Ia = ${CURVE_MULTIPLIER[curve]} · ${In} = ${formatLiczba(Ia, 0)} A;  Zs max = ${formatLiczba(U0, 0)} / ${formatLiczba(Ia, 0)} = ${formatLiczba(ZsMax, 3)} Ω`,
      wynik: S3 !== null ? `${formatLiczba(S3, 1)} mm²` : "żaden przekrój nie spełnia warunku — sprawdź impedancję źródła albo charakterystykę",
    });
    zalozenia.push(`Przekrój PE dobrany z reguły wg przekroju fazowego (PN-HD 60364-5-54), z tego samego materiału co żyła robocza.`);
  } else {
    powodPominiecia3 = "Nie podano impedancji źródła i reszty obwodu — kryterium NIE zostało sprawdzone.";
    zalozenia.push(powodPominiecia3);
  }

  // --- kryterium 4: wytrzymałość zwarciowa cieplna (opcjonalne) --------------
  let S4: number | null = null;
  let ocenioneS4 = false;
  let powodPominiecia4: string | undefined;
  const IaS4 = pradZadzialania(curve, In);
  if (w.Ik_A !== undefined && w.Ik_A > 0 && wStrefieElektromagnetycznej(w.Ik_A, IaS4)) {
    // Ik ≥ Ia: wyłącznik zadziała elektromagnetycznie w czasie < 0,1 s. Wzór z czasem
    // DOPUSZCZALNYM (0,4/5 s) kazałby tu dobierać przekrój kilkukrotnie za duży — przy
    // 6 kA i B16 wychodziło ponad 30 mm². Norma każe wtedy porównać k²S² z I²t aparatu,
    // którego ten silnik nie zna, więc kryterium zostaje jawnie nieocenione.
    const k = K_ZYLA[w.material][w.izolacja];
    powodPominiecia4 =
      `Ik ${formatLiczba(w.Ik_A, 0)} A ≥ Ia ${formatLiczba(IaS4, 0)} A — wyłącznik zadziała elektromagnetycznie (< 0,1 s). ` +
      `Warunek cieplny sprawdź przez I²t aparatu z karty katalogowej: musi być ≤ k²S² (dla k = ${k}: k²S² = ${formatLiczba(k * k, 0)}·S² A²s).`;
    zalozenia.push(powodPominiecia4);
  } else if (w.Ik_A !== undefined && w.Ik_A > 0) {
    ocenioneS4 = true;
    const czas = maksCzasWylaczenia_s(w.uklad ?? "TN", w.obwodOdbiorczy ?? true);
    const k = K_ZYLA[w.material][w.izolacja];
    const minAnaliczny = (w.Ik_A * Math.sqrt(czas)) / k;
    S4 = candidates.find((s) => s >= minAnaliczny) ?? null;
    kroki.push({
      opis: "Kryterium 4 — wytrzymałość zwarciowa cieplna",
      wzor: "S ≥ Ik · √t / k",
      podstawienie: `${formatLiczba(w.Ik_A, 0)} · √${formatLiczba(czas, 2)} / ${k}`,
      wynik: `min. analitycznie ${formatLiczba(minAnaliczny, 2)} mm² → ${S4 !== null ? formatLiczba(S4, 1) : "brak"} mm² z szeregu`,
    });
    zalozenia.push(
      `Czas t = ${formatLiczba(czas, 2)} s przyjęty jako MAKSYMALNY dopuszczalny czas wyłączenia wg tabl. 41.1 (nie rzeczywisty czas zadziałania wyłącznika) — konserwatywnie, na niekorzyść wyniku.`
    );
  } else {
    powodPominiecia4 = "Nie podano prądu zwarciowego w tym miejscu — kryterium NIE zostało sprawdzone.";
    zalozenia.push(powodPominiecia4);
  }

  if (S2 === null || (ocenioneS3 && S3 === null) || (ocenioneS4 && S4 === null)) {
    const ktore = [S2 === null && "spadek napięcia", ocenioneS3 && S3 === null && "ochrona przeciwporażeniowa", ocenioneS4 && S4 === null && "wytrzymałość zwarciowa"]
      .filter(Boolean)
      .join(", ");
    return {
      wartosci: null,
      kroki,
      ocena: null,
      zalozenia,
      zrodla: [{ norma: "PN-HD 60364-4-43", czego: "kryteria doboru przewodu" }],
      bledy: [{ code: "KRYTERIUM_NIE_DO_SPELNIENIA", message: `Żaden dostępny przekrój nie spełnia kryterium: ${ktore}. Zmień warunki (dłuższy przekrój poza tablicą, krótsza trasa, mniejsza impedancja źródła).` }],
    };
  }

  // --- wynik: maksimum z ocenionych kryteriów ---------------------------------
  const wartosci: { kryterium: Kryterium; S: number }[] = [
    { kryterium: "obciazalnosc", S: S1 },
    { kryterium: "spadek_napiecia", S: S2! },
  ];
  if (ocenioneS3) wartosci.push({ kryterium: "ochrona_przeciwporazeniowa", S: S3! });
  if (ocenioneS4) wartosci.push({ kryterium: "wytrzymalosc_zwarciowa", S: S4! });

  const Smax = Math.max(...wartosci.map((x) => x.S));
  const decydujace = wartosci.filter((x) => x.S === Smax).map((x) => x.kryterium);

  kroki.push({
    opis: "Przekrój wynikowy — maksimum z ocenionych kryteriów",
    wzor: "S = max(S₁, S₂, S₃, S₄)",
    podstawienie: wartosci.map((x) => `${KRYTERIUM_LABELS[x.kryterium]}: ${formatLiczba(x.S, 1)} mm²`).join("; "),
    wynik: `${formatLiczba(Smax, 1)} mm² (decyduje: ${decydujace.map((k) => KRYTERIUM_LABELS[k]).join(" i ")})`,
  });

  const kryteria: Record<Kryterium, KryteriumWynik> = {
    obciazalnosc: { minPrzekroj_mm2: S1, ocenione: true },
    spadek_napiecia: { minPrzekroj_mm2: S2, ocenione: true },
    ochrona_przeciwporazeniowa: { minPrzekroj_mm2: S3, ocenione: ocenioneS3, powod_pominiecia: powodPominiecia3 },
    wytrzymalosc_zwarciowa: { minPrzekroj_mm2: S4, ocenione: ocenioneS4, powod_pominiecia: powodPominiecia4 },
  };

  if (!ocenioneS3 || !ocenioneS4) {
    zalozenia.push(
      "UWAGA: przekrój wynikowy NIE jest zweryfikowany względem wszystkich czterech kryteriów — pominięte kryteria mogłyby wymagać większego przekroju, niż tu podano."
    );
  }

  return {
    wartosci: { przekroj_mm2: Smax, In_A: In, kabel: `${KABEL_LABEL[w.material]} ${Smax} mm²`, decydujace, kryteria, Iz_A: IzWybrany },
    kroki,
    ocena: null,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-52", miejsce: w.izolacja === "PVC" ? "tabl. B.52.4" : "tabl. B.52.5", czego: "obciążalność długotrwała" },
      { norma: "PN-HD 60364-4-43", czego: "warunek doboru zabezpieczenia i wytrzymałość zwarciowa" },
      { norma: "PN-HD 60364-4-41", czego: "ochrona przeciwporażeniowa, maksymalne czasy wyłączenia" },
      { norma: "PN-HD 60364-5-54", czego: "dobór przewodu PE" },
    ],
    bledy: [],
  };
}
