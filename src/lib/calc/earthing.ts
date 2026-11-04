/**
 * Uziemienia — spec pkt 5.6.
 *
 * Wszystkie wzory są ANALITYCZNE (geometria uziomu + rezystywność gruntu), więc
 * dają się policzyć bez tablic normatywnych. Jedyna tablica tutaj — typowe
 * rezystywności gruntów — jest jawnie oznaczona jako ORIENTACYJNA i nie ma przy
 * niej odwołania do normy, bo takiego nie ma: to zakresy z praktyki pomiarowej,
 * rozrzucone o rząd wielkości w obrębie jednego rodzaju gruntu (wilgotność, pora
 * roku, zasolenie). Dlatego kalkulator przy każdym wyniku opartym o tablicę mówi
 * wprost, że projektowy dobór wymaga POMIARU, a nie odczytu z listy.
 */

import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok, type Ocena } from "./result";

export type TypUziomu = "pionowy" | "poziomy" | "otokowy";

export const TYP_UZIOMU_LABELS: Record<TypUziomu, string> = {
  pionowy: "pionowy (pręt / szpilka)",
  poziomy: "poziomy (bednarka w wykopie)",
  otokowy: "otokowy (wokół budynku)",
};

/**
 * Typowe rezystywności gruntów [Ω·m] — WARTOŚCI ORIENTACYJNE, nie normatywne.
 *
 * Podane jako zakres, bo rozrzut w obrębie jednego rodzaju gruntu bywa
 * kilkukrotny i zależy od wilgotności oraz temperatury. `typowa` to wartość
 * środkowa do wstępnego szacunku — nigdy do projektu wykonawczego.
 */
export const REZYSTYWNOSC_GRUNTU: { id: string; nazwa: string; min: number; max: number; typowa: number }[] = [
  { id: "torf", nazwa: "torf, grunt bagienny", min: 5, max: 40, typowa: 20 },
  { id: "glina", nazwa: "glina, ił", min: 20, max: 100, typowa: 50 },
  { id: "uprawny", nazwa: "grunt uprawny, próchnica", min: 50, max: 150, typowa: 100 },
  { id: "piasek_wilgotny", nazwa: "piasek wilgotny", min: 200, max: 500, typowa: 300 },
  { id: "zwir", nazwa: "żwir", min: 300, max: 1000, typowa: 500 },
  { id: "piasek_suchy", nazwa: "piasek suchy", min: 1000, max: 3000, typowa: 1500 },
  { id: "skala", nazwa: "grunt skalisty", min: 2000, max: 10000, typowa: 5000 },
];

export interface UziomWejscie {
  typ: TypUziomu;
  /** Rezystywność gruntu [Ω·m]. */
  rho_ohm_m: number;
  /** Długość uziomu [m] — pręta, bednarki albo obwodu otoku. */
  dlugosc_m: number;
  /** Średnica pręta [m] — tylko uziom pionowy. */
  srednica_m?: number;
  /** Szerokość taśmy [m] — tylko uziom poziomy. */
  szerokosc_m?: number;
  /** Głębokość ułożenia [m] — tylko uziom poziomy. */
  glebokosc_m?: number;
  /** Liczba uziomów połączonych równolegle. */
  liczba?: number;
  /** Współczynnik wykorzystania η (0,6–0,9) — spadek skuteczności przy zbliżeniu uziomów. */
  wspWykorzystania?: number;
  /** Wymagana rezystancja docelowa [Ω] — do oceny i do policzenia potrzebnej długości. */
  wymagana_ohm?: number;
}

export interface UziomWynik {
  /** Rezystancja pojedynczego uziomu [Ω]. */
  R_pojedynczy_ohm: number;
  /** Rezystancja wypadkowa układu [Ω]. */
  R_wypadkowa_ohm: number;
  /** Długość pojedynczego uziomu potrzebna do osiągnięcia wymagania [m]. */
  potrzebnaDlugosc_m: number | null;
}

function walidacja(w: UziomWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.rho_ohm_m > 0)) b.push({ code: "RHO", pole: "rho_ohm_m", message: "Rezystywność gruntu musi być większa od zera." });
  if (!(w.dlugosc_m > 0)) b.push({ code: "DLUGOSC", pole: "dlugosc_m", message: "Długość uziomu musi być większa od zera." });

  if (w.typ === "pionowy") {
    if (!(w.srednica_m && w.srednica_m > 0))
      b.push({ code: "SREDNICA", pole: "srednica_m", message: "Podaj średnicę pręta — bez niej wzór na uziom pionowy nie ma sensu." });
    // Wzór R = ρ/(2πL)·ln(4L/d) zakłada pręt DŁUGI względem średnicy. Przy
    // 4L/d ≤ 1 logarytm schodzi do zera i wynik traci sens fizyczny.
    if (w.srednica_m && w.dlugosc_m > 0 && (4 * w.dlugosc_m) / w.srednica_m <= 1)
      b.push({
        code: "GEOMETRIA_POZA_ZAKRESEM",
        pole: "srednica_m",
        message: "Stosunek długości do średnicy jest zbyt mały — wzór dla uziomu pionowego zakłada pręt smukły. Sprawdź jednostki (średnica w metrach, nie milimetrach).",
      });
  }
  if (w.typ === "poziomy") {
    if (!(w.szerokosc_m && w.szerokosc_m > 0))
      b.push({ code: "SZEROKOSC", pole: "szerokosc_m", message: "Podaj szerokość bednarki." });
    if (!(w.glebokosc_m && w.glebokosc_m > 0))
      b.push({ code: "GLEBOKOSC", pole: "glebokosc_m", message: "Podaj głębokość ułożenia bednarki." });
    if (w.szerokosc_m && w.glebokosc_m && w.dlugosc_m > 0) {
      const arg = (2 * w.dlugosc_m * w.dlugosc_m) / (w.szerokosc_m * w.glebokosc_m);
      if (arg <= 1)
        b.push({
          code: "GEOMETRIA_POZA_ZAKRESEM",
          message: "Geometria wykracza poza zakres wzoru dla uziomu poziomego (logarytm ≤ 0). Sprawdź jednostki — szerokość i głębokość podaje się w metrach.",
        });
    }
  }

  const eta = w.wspWykorzystania;
  if (eta !== undefined && (eta <= 0 || eta > 1))
    b.push({ code: "ETA", pole: "wspWykorzystania", message: "Współczynnik wykorzystania musi mieścić się w przedziale (0; 1]." });
  if ((w.liczba ?? 1) < 1) b.push({ code: "LICZBA", pole: "liczba", message: "Liczba uziomów musi wynosić co najmniej 1." });
  return b;
}

/** Rezystancja pojedynczego uziomu wg geometrii. */
function rezystancjaPojedyncza(w: UziomWejscie): { R: number; krok: Krok } {
  const { rho_ohm_m: rho, dlugosc_m: L } = w;
  if (w.typ === "pionowy") {
    const d = w.srednica_m!;
    const R = (rho / (2 * Math.PI * L)) * Math.log((4 * L) / d);
    return {
      R,
      krok: {
        opis: "Rezystancja uziomu pionowego",
        wzor: "R = ρ / (2π·L) · ln(4L / d)",
        podstawienie: `${formatLiczba(rho, 1)} / (2π·${formatLiczba(L, 2)}) · ln(4·${formatLiczba(L, 2)} / ${formatLiczba(d, 4)})`,
        wynik: `${formatLiczba(R, 2)} Ω`,
      },
    };
  }
  if (w.typ === "poziomy") {
    const b = w.szerokosc_m!;
    const h = w.glebokosc_m!;
    const R = (rho / (Math.PI * L)) * Math.log((2 * L * L) / (b * h));
    return {
      R,
      krok: {
        opis: "Rezystancja uziomu poziomego (bednarka)",
        wzor: "R = ρ / (π·L) · ln(2L² / (b·h))",
        podstawienie: `${formatLiczba(rho, 1)} / (π·${formatLiczba(L, 2)}) · ln(2·${formatLiczba(L, 2)}² / (${formatLiczba(b, 3)}·${formatLiczba(h, 2)}))`,
        wynik: `${formatLiczba(R, 2)} Ω`,
      },
    };
  }
  const R = (2 * rho) / L;
  return {
    R,
    krok: {
      opis: "Rezystancja uziomu otokowego (przybliżenie)",
      wzor: "R ≈ 2ρ / L",
      podstawienie: `2·${formatLiczba(rho, 1)} / ${formatLiczba(L, 2)}`,
      wynik: `${formatLiczba(R, 2)} Ω`,
    },
  };
}

export function obliczUziom(w: UziomWejscie): CalcResult<UziomWynik> {
  const bledy = walidacja(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const n = w.liczba ?? 1;
  // η opisuje wzajemne przesłanianie KILKU uziomów — przy jednym nie ma czego przesłaniać.
  // Formularz trzyma η także wtedy, gdy pole jest ukryte (n = 1), a rezystancja wypadkowa
  // go wtedy nie brała, za to szukanie długości już tak: dla 30 Ω wychodziło 4,7 m
  // zamiast ~3,6 m z tego samego wzoru (audyt 2026-11-04, B5).
  const eta = n > 1 ? (w.wspWykorzystania ?? 1) : 1;
  const { R: R1, krok } = rezystancjaPojedyncza(w);
  const kroki: Krok[] = [krok];

  const Rwyp = n > 1 ? R1 / (n * eta) : R1;
  if (n > 1) {
    kroki.push({
      opis: "Rezystancja wypadkowa układu uziomów",
      wzor: "R_wyp = R / (n · η)",
      podstawienie: `${formatLiczba(R1, 2)} / (${n} · ${formatLiczba(eta, 2)})`,
      wynik: `${formatLiczba(Rwyp, 2)} Ω`,
    });
  }

  // Potrzebna długość dla wymagania — dla otoku wprost ze wzoru, dla pozostałych
  // numerycznie, bo długość siedzi też pod logarytmem.
  let potrzebna: number | null = null;
  if (w.wymagana_ohm && w.wymagana_ohm > 0) {
    if (w.typ === "otokowy") {
      potrzebna = (2 * w.rho_ohm_m) / (w.wymagana_ohm * n * eta);
    } else {
      // Rezystancja maleje monotonicznie z długością — bisekcja w szerokim
      // przedziale wystarczy i jest odporniejsza od rozwiązywania analitycznego.
      let lo = 0.1;
      let hi = 1000;
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const R = rezystancjaPojedyncza({ ...w, dlugosc_m: mid }).R / (n * eta);
        if (R > w.wymagana_ohm) lo = mid;
        else hi = mid;
      }
      potrzebna = hi < 999 ? hi : null;
    }
    if (potrzebna !== null) {
      kroki.push({
        opis: `Długość pojedynczego uziomu potrzebna do osiągnięcia ${formatLiczba(w.wymagana_ohm, 1)} Ω`,
        wzor: w.typ === "otokowy" ? "L = 2ρ / (R_wym · n · η)" : "rozwiązanie numeryczne względem L",
        podstawienie:
          w.typ === "otokowy"
            ? `2·${formatLiczba(w.rho_ohm_m, 1)} / (${formatLiczba(w.wymagana_ohm, 1)} · ${n} · ${formatLiczba(eta, 2)})`
            : `szukamy L, dla którego R_wyp = ${formatLiczba(w.wymagana_ohm, 1)} Ω`,
        wynik: `${formatLiczba(potrzebna, 1)} m`,
      });
    }
  }

  const ocena: Ocena | null =
    w.wymagana_ohm && w.wymagana_ohm > 0
      ? ocenPodLimitem(Rwyp, w.wymagana_ohm, { co: "Rezystancja uziemienia", jednostka: "Ω" })
      : null;

  const zalozenia = [
    "Grunt jednorodny o stałej rezystywności — w rzeczywistości warstwuje się i zmienia z porą roku (zimą i w suszy rezystywność rośnie).",
    "Rezystywność przyjęta z tablicy wartości ORIENTACYJNYCH albo podana ręcznie. Do projektu wykonawczego wymagany jest POMIAR rezystywności gruntu, nie odczyt z listy.",
  ];
  if (n > 1)
    zalozenia.push(
      `Współczynnik wykorzystania η = ${formatLiczba(eta, 2)} — uziomy postawione zbyt blisko siebie „przeszkadzają" sobie nawzajem; przy rozstawie mniejszym niż dwie długości uziomu przyjmij wartość z dolnej części zakresu 0,6–0,9.`
    );
  if (w.typ === "otokowy")
    zalozenia.push("Wzór R ≈ 2ρ/L dla otoku to przybliżenie — dokładny wynik zależy od kształtu obrysu i głębokości ułożenia.");

  return {
    wartosci: { R_pojedynczy_ohm: R1, R_wypadkowa_ohm: Rwyp, potrzebnaDlugosc_m: potrzebna },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-54", czego: "uziemienia i przewody ochronne" },
      { norma: "PN-EN 62305-3", czego: "uziomy instalacji odgromowej" },
    ],
    bledy: [],
  };
}

// --- kryterium układu TT ------------------------------------------------------

/**
 * Warunek ochrony przy dotyku pośrednim w układzie TT: R_A · IΔn ≤ U_L.
 * To NIE jest wartość tablicowa, tylko wprost warunek z PN-HD 60364-4-41 —
 * stąd wolno go policzyć bez sięgania po tablice.
 */
export const NAPIECIE_DOTYKOWE_DOPUSZCZALNE_V = 50;

export function maksRezystancjaTT(idn_A: number): number {
  return idn_A > 0 ? NAPIECIE_DOTYKOWE_DOPUSZCZALNE_V / idn_A : 0;
}
