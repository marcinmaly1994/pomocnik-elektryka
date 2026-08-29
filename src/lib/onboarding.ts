/**
 * Logika onboardingu „Zacznij w 3 krokach" — czysta, bez Reacta i bez store'a.
 *
 * Kluczowa decyzja: ukończenie kroku wynika z FAKTÓW w projekcie (czy jest skala,
 * czy jest nazwane pomieszczenie, czy stoi element), a nie z tego, czy użytkownik
 * kliknął przycisk w karcie. Dzięki temu ktoś, kto pominął onboarding i sam odpalił
 * kalibrację z paska narzędzi, dostaje krok odhaczony automatycznie — bez tego
 * checklist kłamałby w żywe oczy (przypadek brzegowy 2 ze specyfikacji).
 *
 * Drugi mechanizm to LEPKOŚĆ: raz osiągnięty krok zostaje odhaczony, nawet gdy
 * fakt zniknie. Inaczej skasowanie jedynego pomieszczenia miesiąc później
 * wskrzeszałoby onboarding komuś, kto dawno umie obsługiwać aplikację.
 */

export type StepId = "skala" | "pomieszczenia" | "element";
export type StepStatus = "todo" | "active" | "done";

/** Stan zapisywany razem z projektem. Nazwy pól wg specyfikacji. */
export interface OnboardingState {
  krok1Done: boolean;
  krok2Done: boolean;
  krok3Done: boolean;
  /** Użytkownik świadomie pominął onboarding — karta się nie pokazuje. */
  pominiety: boolean;
  /** Czy karta była rozwinięta przy ostatniej wizycie w projekcie. */
  ostatnioOtwarty: boolean;
  /** Skala straciła ważność po podmianie podkładu — patrz `markScaleStale`. */
  skalaNieaktualna: boolean;
  /**
   * Świadome „Pomiń" na EKRANIE STARTOWYM (patrz `showEntryScreen` w DesignTab.tsx)
   * — osobna flaga od `pominiety`. `pominiety` jest zdejmowane przez „Otwórz
   * przewodnik" (przywraca kartę na żądanie), a ekran startowy MA zostać pominięty
   * mimo tego — inaczej samo „Otwórz przewodnik" wskrzeszałoby pełnoekranowy wybór
   * zamiast skromnej karty. Musi żyć w zapisywanym stanie (nie w stanie komponentu),
   * bo przełączenie zakładki i powrót odmontowuje/montuje DesignTab na nowo.
   */
  ekranStartowyPominiety: boolean;
}

export const INITIAL_ONBOARDING: OnboardingState = {
  krok1Done: false,
  krok2Done: false,
  krok3Done: false,
  pominiety: false,
  ostatnioOtwarty: true,
  skalaNieaktualna: false,
  ekranStartowyPominiety: false,
};

/** Co da się sprawdzić w projekcie niezależnie od zapisanych flag. */
export interface OnboardingFacts {
  maSkale: boolean;
  maNazwanePomieszczenie: boolean;
  maElement: boolean;
  maPodklad: boolean;
}

export interface Step {
  id: StepId;
  numer: 1 | 2 | 3;
  tytul: string;
  opis: string;
  cta: string;
  status: StepStatus;
}

/**
 * Uzgadnia zapisany stan z faktami. Flagi są LEPKIE — fakt potrafi je tylko
 * zapalić, nigdy zgasić.
 */
export function reconcile(saved: OnboardingState, facts: OnboardingFacts): OnboardingState {
  const next: OnboardingState = {
    ...saved,
    krok1Done: saved.krok1Done || facts.maSkale,
    krok2Done: saved.krok2Done || facts.maNazwanePomieszczenie,
    krok3Done: saved.krok3Done || facts.maElement,
  };
  // Ponowna kalibracja po podmianie podkładu kasuje ostrzeżenie o nieaktualności.
  if (next.skalaNieaktualna && facts.maSkale && !saved.krok1Done) next.skalaNieaktualna = false;
  return next;
}

export function isComplete(s: OnboardingState): boolean {
  return s.krok1Done && s.krok2Done && s.krok3Done;
}

/** Pierwszy nieukończony krok — ten dostaje status „active". */
export function activeStepId(s: OnboardingState): StepId | null {
  if (!s.krok1Done) return "skala";
  if (!s.krok2Done) return "pomieszczenia";
  if (!s.krok3Done) return "element";
  return null;
}

const STEP_COPY: Record<StepId, { numer: 1 | 2 | 3; tytul: string; opis: string; cta: string }> = {
  skala: {
    numer: 1,
    tytul: "Ustaw skalę",
    opis: "Pokaż, ile metrów ma jeden odcinek na rzucie — bez tego nie policzymy długości przewodów.",
    cta: "Ustaw skalę",
  },
  pomieszczenia: {
    numer: 2,
    tytul: "Zaznacz pomieszczenia",
    opis: "Obrysuj choć jedno pomieszczenie i nazwij je. Łazienka i kuchnia mają własne wymagania.",
    cta: "Obrysuj pomieszczenie",
  },
  element: {
    numer: 3,
    tytul: "Postaw pierwszy element",
    opis: "Wybierz gniazdko albo punkt świetlny z listy i kliknij na rzucie, żeby je umieścić.",
    cta: "Wybierz element",
  },
};

/** Kroki z policzonym statusem — gotowe do wyrenderowania. */
export function stepsFor(s: OnboardingState): Step[] {
  const active = activeStepId(s);
  const done: Record<StepId, boolean> = {
    skala: s.krok1Done,
    pomieszczenia: s.krok2Done,
    element: s.krok3Done,
  };
  return (["skala", "pomieszczenia", "element"] as StepId[]).map((id) => ({
    id,
    ...STEP_COPY[id],
    status: done[id] ? "done" : id === active ? "active" : "todo",
  }));
}

/**
 * Czy pokazać kartę. Ukończony albo pominięty onboarding zostawia tylko dyskretny
 * przycisk „?" — powracający użytkownik ma mieć zero natrętności (przypadek 5).
 */
export function shouldShowCard(s: OnboardingState): boolean {
  if (!s.ostatnioOtwarty) return false;
  return !s.pominiety && !isComplete(s);
}

/** Skrócona wersja dla kogoś, kto onboarding już kiedyś widział (flaga w localStorage). */
export function shouldShowCompact(seenBefore: boolean, s: OnboardingState): boolean {
  return seenBefore && !isComplete(s);
}

// --- walidacja kalibracji ----------------------------------------------------

/** Sensowny zakres odcinka odniesienia. Poniżej 10 cm błąd wskazania myszy
 *  dominuje nad pomiarem; powyżej 100 m to już nie jest rzut domu. */
export const MIN_CALIB_M = 0.1;
export const MAX_CALIB_M = 100;

export type CalibrationCheck = { ok: true; meters: number } | { ok: false; error: string };

/** Sprawdza wpisaną długość odcinka. Przecinek dziesiętny jest tu normą, nie wyjątkiem. */
export function validateCalibrationLength(raw: string): CalibrationCheck {
  const trimmed = String(raw ?? "").trim().replace(",", ".");
  if (trimmed === "") return { ok: false, error: "Podaj długość odcinka w metrach." };
  const meters = Number(trimmed);
  if (!Number.isFinite(meters)) return { ok: false, error: "To nie wygląda na liczbę — wpisz np. 4 albo 3,5." };
  if (meters <= 0) return { ok: false, error: "Długość musi być większa od zera." };
  if (meters < MIN_CALIB_M) return { ok: false, error: `Za krótki odcinek — podaj co najmniej ${fmt(MIN_CALIB_M)} m.` };
  if (meters > MAX_CALIB_M) return { ok: false, error: `Za długi odcinek — maksimum to ${MAX_CALIB_M} m.` };
  return { ok: true, meters };
}

// --- szybka ścieżka: rzut w znanej skali -------------------------------------

/**
 * Format arkusza w milimetrach (szerokość w poziomie). Potrzebny, bo sama skala
 * „1:50" NIE wystarcza do przeliczenia: mówi, ile razy rysunek jest mniejszy od
 * rzeczywistości, ale nie mówi, jak duży jest sam rysunek. Dopiero format arkusza
 * daje wymiar fizyczny, z którego wychodzi realna szerokość rzutu.
 */
export const PAPER_WIDTHS_MM: Record<string, number> = { A4: 297, A3: 420, A2: 594, A1: 841 };
export const SCALE_DENOMINATORS = [50, 100, 200] as const;

/**
 * Przelicza „rzut w skali 1:N na arkuszu F" na metry przypadające na jednostkę planu.
 *
 * Zakłada, że rysunek wypełnia szerokość arkusza — to założenie, nie pomiar, więc
 * wynik pokazujemy użytkownikowi do potwierdzenia zamiast przyjmować po cichu.
 */
export function mpuFromPaperScale(paperWidthMm: number, denominator: number, planWidthUnits: number): number | null {
  if (!(paperWidthMm > 0) || !(denominator > 0) || !(planWidthUnits > 0)) return null;
  const realWidthM = (paperWidthMm / 1000) * denominator;
  return realWidthM / planWidthUnits;
}

/** Realna szerokość rzutu [m] przy danej skali — do pokazania „czy to się zgadza?". */
export function planWidthMeters(metersPerUnit: number | null, planWidthUnits: number): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0) || !(planWidthUnits > 0)) return null;
  return metersPerUnit * planWidthUnits;
}

function fmt(v: number): string {
  return String(v).replace(".", ",");
}
