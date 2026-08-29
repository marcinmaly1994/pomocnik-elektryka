import { describe, expect, it } from "vitest";
import {
  INITIAL_ONBOARDING,
  MAX_CALIB_M,
  PAPER_WIDTHS_MM,
  activeStepId,
  isComplete,
  mpuFromPaperScale,
  planWidthMeters,
  reconcile,
  shouldShowCard,
  shouldShowCompact,
  stepsFor,
  validateCalibrationLength,
  type OnboardingFacts,
  type OnboardingState,
} from "./onboarding";

const NO_FACTS: OnboardingFacts = {
  maSkale: false,
  maNazwanePomieszczenie: false,
  maElement: false,
  maPodklad: false,
};

function state(over: Partial<OnboardingState> = {}): OnboardingState {
  return { ...INITIAL_ONBOARDING, ...over };
}

describe("reconcile — kroki wynikają z faktów, nie z klikania w kartę", () => {
  it("kalibracja odpalona z paska narzędzi odhacza krok 1 sama z siebie", () => {
    // przypadek brzegowy 2: user pominął onboarding i sam ustawił skalę
    const next = reconcile(state({ pominiety: true }), { ...NO_FACTS, maSkale: true });
    expect(next.krok1Done).toBe(true);
  });

  it("nazwane pomieszczenie odhacza krok 2, postawiony element krok 3", () => {
    const next = reconcile(state(), { ...NO_FACTS, maNazwanePomieszczenie: true, maElement: true });
    expect(next.krok2Done).toBe(true);
    expect(next.krok3Done).toBe(true);
  });

  it("flagi są LEPKIE — zniknięcie faktu nie cofa ukończonego kroku", () => {
    // ktoś kasuje jedyne pomieszczenie miesiąc później; onboarding ma nie wracać
    const done = state({ krok1Done: true, krok2Done: true, krok3Done: true });
    const next = reconcile(done, NO_FACTS);
    expect(next).toEqual(done);
  });

  it("nie gubi pozostałych pól stanu", () => {
    const next = reconcile(state({ pominiety: true, ostatnioOtwarty: false }), NO_FACTS);
    expect(next.pominiety).toBe(true);
    expect(next.ostatnioOtwarty).toBe(false);
  });

  it("pominięcie EKRANU STARTOWEGO przeżywa uzgodnienie z faktami tak samo jak pozostałe pola", () => {
    // patrz `showEntryScreen` w DesignTab.tsx: to osobna flaga od `pominiety`,
    // celowo NIE zdejmowana przez „Otwórz przewodnik" — musi więc przetrwać
    // dokładnie tak samo trwale jak reszta stanu, niezależnie od faktów projektu.
    const next = reconcile(state({ ekranStartowyPominiety: true }), { ...NO_FACTS, maSkale: true });
    expect(next.ekranStartowyPominiety).toBe(true);
  });
});

describe("kolejność i statusy kroków", () => {
  it("aktywny jest pierwszy nieukończony", () => {
    expect(activeStepId(state())).toBe("skala");
    expect(activeStepId(state({ krok1Done: true }))).toBe("pomieszczenia");
    expect(activeStepId(state({ krok1Done: true, krok2Done: true }))).toBe("element");
    expect(activeStepId(state({ krok1Done: true, krok2Done: true, krok3Done: true }))).toBeNull();
  });

  it("krok ukończony ma status done nawet gdy leży przed aktywnym", () => {
    const steps = stepsFor(state({ krok1Done: true }));
    expect(steps.map((s) => s.status)).toEqual(["done", "active", "todo"]);
  });

  it("krok ukończony POZA kolejnością nie kradnie statusu aktywnego", () => {
    // user postawił element, zanim ustawił skalę — krok 3 ma być done,
    // ale aktywny zostaje krok 1
    const steps = stepsFor(state({ krok3Done: true }));
    expect(steps.map((s) => s.status)).toEqual(["active", "todo", "done"]);
  });

  it("każdy krok niesie komplet tekstów do wyświetlenia", () => {
    for (const s of stepsFor(state())) {
      expect(s.tytul.length).toBeGreaterThan(0);
      expect(s.opis.length).toBeGreaterThan(0);
      expect(s.cta.length).toBeGreaterThan(0);
    }
  });
});

describe("widoczność karty", () => {
  it("pokazuje się nowemu użytkownikowi", () => {
    expect(shouldShowCard(state())).toBe(true);
  });

  it("znika po ukończeniu wszystkich kroków", () => {
    const done = state({ krok1Done: true, krok2Done: true, krok3Done: true });
    expect(isComplete(done)).toBe(true);
    expect(shouldShowCard(done)).toBe(false);
  });

  it("znika po pominięciu, ale kroki nadal się odhaczają w tle", () => {
    const skipped = reconcile(state({ pominiety: true }), { ...NO_FACTS, maSkale: true });
    expect(shouldShowCard(skipped)).toBe(false);
    expect(skipped.krok1Done).toBe(true);
  });

  it("zwinięta karta się nie pokazuje, dopóki user jej nie otworzy", () => {
    expect(shouldShowCard(state({ ostatnioOtwarty: false }))).toBe(false);
    expect(shouldShowCard(state({ ostatnioOtwarty: true }))).toBe(true);
  });

  it("kto widział onboarding wcześniej, dostaje wersję skróconą", () => {
    expect(shouldShowCompact(true, state())).toBe(true);
    expect(shouldShowCompact(false, state())).toBe(false);
    // ...ale po ukończeniu nie dostaje nic
    expect(shouldShowCompact(true, state({ krok1Done: true, krok2Done: true, krok3Done: true }))).toBe(false);
  });
});

describe("validateCalibrationLength", () => {
  it("przyjmuje liczbę z przecinkiem — to polska norma zapisu", () => {
    expect(validateCalibrationLength("3,5")).toEqual({ ok: true, meters: 3.5 });
    expect(validateCalibrationLength("4")).toEqual({ ok: true, meters: 4 });
    expect(validateCalibrationLength(" 2.25 ")).toEqual({ ok: true, meters: 2.25 });
  });

  it("odrzuca puste, nieliczbowe i niedodatnie", () => {
    for (const bad of ["", "   ", "abc", "0", "-3"]) {
      const r = validateCalibrationLength(bad);
      expect(r.ok, `„${bad}" powinno zostać odrzucone`).toBe(false);
    }
  });

  it("pilnuje sensownego zakresu zamiast zapisywać absurdy", () => {
    expect(validateCalibrationLength("0.05").ok).toBe(false); // 5 cm
    expect(validateCalibrationLength("500").ok).toBe(false); // pół kilometra
    expect(validateCalibrationLength(String(MAX_CALIB_M)).ok).toBe(true);
  });

  it("komunikat błędu mówi, co zrobić, a nie tylko że źle", () => {
    const r = validateCalibrationLength("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/wpisz/i);
  });
});

describe("szybka ścieżka: rzut w znanej skali", () => {
  it("A4 w skali 1:50 daje rzut szerokości 14,85 m", () => {
    // 297 mm × 50 = 14 850 mm = 14,85 m
    const mpu = mpuFromPaperScale(PAPER_WIDTHS_MM.A4, 50, 1000)!;
    expect(planWidthMeters(mpu, 1000)).toBeCloseTo(14.85, 2);
  });

  it("większy arkusz przy tej samej skali to większy rzut", () => {
    const a4 = mpuFromPaperScale(PAPER_WIDTHS_MM.A4, 100, 1000)!;
    const a3 = mpuFromPaperScale(PAPER_WIDTHS_MM.A3, 100, 1000)!;
    expect(a3).toBeGreaterThan(a4);
  });

  it("dwa razy większy mianownik skali to dwa razy większy rzut", () => {
    const s50 = mpuFromPaperScale(PAPER_WIDTHS_MM.A4, 50, 1000)!;
    const s100 = mpuFromPaperScale(PAPER_WIDTHS_MM.A4, 100, 1000)!;
    expect(s100 / s50).toBeCloseTo(2, 6);
  });

  it("bezsensowne wejście daje null, nie NaN wpuszczone do projektu", () => {
    expect(mpuFromPaperScale(0, 50, 1000)).toBeNull();
    expect(mpuFromPaperScale(297, 0, 1000)).toBeNull();
    expect(mpuFromPaperScale(297, 50, 0)).toBeNull();
    expect(planWidthMeters(null, 1000)).toBeNull();
  });
});
