/**
 * Tokeny wyglądu interfejsu — docelowo jedyne źródło kolorów, zaokrągleń i cieni
 * (część komponentów ma jeszcze kolory wpisane na sztywno; przechodzą na tokeny
 * w kolejnych PR-ach redesignu).
 *
 * Czytają z nich: motyw Tailwinda (`tailwind.config.ts`), arkusz `index.css` (przez
 * `theme()`), style inline w komponentach i testy kontrastu. Dlatego moduł TS, a nie
 * zmienne CSS: test i style inline potrzebują wartości, a nie odwołania.
 *
 * NIE dotyczy kolorów DANYCH rysunku (oprawy, obwody, ostrzeżenia na planie), PDF-ów
 * ani legend — to grafika z własnymi progami i własną historią, patrz komentarz przy
 * `copper` w `tailwind.config.ts`.
 */
export const KOLORY = {
  ink: "#16202B",
  blueprint: "#2D5A8C",
  blueprintHover: "#244A73",
  blueprintTlo: "#EAF0F6",
  // Miedź przyciemniona z #C1793F dla AA — historia w tailwind.config.ts.
  copper: "#9A5A27",
  copperHover: "#86501F",
  copperTlo: "#F7EEE6",
  paper: "#EEF1F4",
  surface: "#FFFFFF",
  surface2: "#F7F9FA",
  border: "#DFE4E9",
  borderStrong: "#C7D0D9",
  success: "#2C6B4A",
  successGrafika: "#3B8C63",
  successTlo: "#EBF3EF",
  caution: "#8A5526",
  cautionTlo: "#F9F1EB",
  danger: "#A2352C",
  dangerGrafika: "#C6433A",
  dangerTlo: "#F9ECEB",
} as const;

/** Nazwy klas Tailwinda → wartości. `ok` i `warn` to stare nazwy, zostają jako aliasy,
 *  żeby nie przepisywać wszystkich użyć w jednym kroku (`warn` zawsze znaczył błąd). */
export const KOLORY_TAILWIND = {
  ink: KOLORY.ink,
  blueprint: { DEFAULT: KOLORY.blueprint, hover: KOLORY.blueprintHover, tlo: KOLORY.blueprintTlo },
  copper: { DEFAULT: KOLORY.copper, hover: KOLORY.copperHover, tlo: KOLORY.copperTlo },
  paper: KOLORY.paper,
  surface: KOLORY.surface,
  "surface-2": KOLORY.surface2,
  border: KOLORY.border,
  "border-strong": KOLORY.borderStrong,
  success: { DEFAULT: KOLORY.success, grafika: KOLORY.successGrafika, tlo: KOLORY.successTlo },
  caution: { DEFAULT: KOLORY.caution, tlo: KOLORY.cautionTlo },
  danger: { DEFAULT: KOLORY.danger, grafika: KOLORY.dangerGrafika, tlo: KOLORY.dangerTlo },
  ok: KOLORY.successGrafika,
  warn: KOLORY.dangerGrafika,
} as const;

/** Trzy promienie: pola, przyciski, znaczniki / karty i panele / dialogi i arkusze. */
export const PROMIENIE = { maly: "6px", karta: "10px", duzy: "14px" } as const;

/**
 * Dwa czasy ruchu: szybki (przenikanie treści w miejscu) i zwykły (okna, arkusze,
 * wysuwane panele). Wcześniej 120 / 200 ms wpisane wprost w klasy w kilku plikach —
 * zmiana tempa wymagała szukania liczb po kodzie. Pilnuje tego `klasyUsuniete.test.ts`.
 */
export const CZASY = { szybko: "120ms", zwykle: "200ms" } as const;

/** Dwa poziomy cienia: karta leżąca na tle / coś unoszącego się nad treścią. */
export const CIENIE = {
  xs: "0 1px 2px rgb(22 32 43 / 0.06)",
  pop: "0 8px 24px rgb(22 32 43 / 0.12)",
} as const;
