# Redesign PR 1 — tokeny kolorów, typografii, zaokrągleń i cieni

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jedno źródło prawdy dla kolorów, rozmiarów tekstu, zaokrągleń i cieni, i migracja całej aplikacji na nie — bez zmiany logiki, modułów ani danych.

**Architecture:** Tokeny w module TS `src/lib/tokeny.ts` (stałe hex), z którego czytają `tailwind.config.ts`, style inline w komponentach i testy kontrastu. Skala tekstu to standardowa skala Tailwinda (`xs`…`3xl`); dowolne `text-[Npx]` są mapowane na nią i zakazane testem. Zaokrąglenia i cienie przedefiniowane w motywie, więc większość klas w plikach zostaje bez zmian.

**Tech Stack:** React 18, Tailwind 3, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-redesign-ewolucja-design.md` (sekcje 1–3, „Kontrola jakości”). PR 2–5 dostaną osobne plany po zmergowaniu tego.

## Global Constraints

- Gałąź: `redesign-ewolucja` (od `main`). Nigdy nie nazywać gałęzi `dependabot`.
- Bez zmian w: logice obliczeń (`src/lib/calc/**`, `src/lib/norms/**`), kolorach rysunku (Konva, `ElementGlyph*`, `PanelRender`), PDF-ach (`src/lib/pdf*`, `docHeader`), treściach tekstów.
- Minimalny rozmiar tekstu interfejsu: 12 px (`text-xs`). Napisy rysowane na płótnie Konva/SVG są poza tą regułą.
- Kontrast: tekst ≥ 4,5:1 na `#FFFFFF`, `#EEF1F4`, `#ECECED`; grafika ≥ 3:1.
- Zaokrąglenia tylko 6 / 10 / 14 px (+ `full`). Cienie tylko dwa poziomy: `xs` i `pop`.
- Wynik e2e czytać z PEŁNEGO podsumowania (linia „failed” stoi nad „passed”), nie z `tail -1`.
- Komentarze w kodzie po polsku, w stylu repo (dlaczego, nie co).
- Commit kończy się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Doprecyzowanie względem specu (zatwierdzić przy przeglądzie planu)

1. **Skala tekstu = standardowa skala Tailwinda**, nie przedefiniowane `sm`/`base`.
   Spec chciał `text-sm` = 13 px i `text-base` = 14 px, co zmniejszyłoby tekst w ~160
   istniejących miejscach (przyciski, pola). Standardowa skala daje te same role bez
   zmniejszania czegokolwiek: `xs` 12 (podpis/minimum), `sm` 14 (interfejs), `base` 16
   (pola na telefonie, tekst czytany), `lg` 18 (tytuł karty), `xl` 20 / `2xl` 24
   (tytuł strony), `3xl` 30 (wartość wyniku).
2. **Tokeny kolorów w `src/lib/tokeny.ts` zamiast zmiennych CSS.** Istniejący test
   `kontrastTekstu.test.ts` czyta hex z motywu, a style inline (`WERDYKT_STYL`) potrzebują
   wartości w TS. Moduł TS jest jednym źródłem dla obu; `index.css` czyta go przez
   `theme('colors…')`.

---

## Mapa plików

| Plik | Rola |
|---|---|
| Create `src/lib/tokeny.ts` | stałe kolorów, zaokrągleń, cieni |
| Create `src/lib/tokeny.test.ts` | kontrast nowych par semantycznych, aliasy |
| Create `src/lib/skalaTekstu.test.ts` | zakaz `text-[Npx]` w `src/**/*.tsx` |
| Create `e2e/uklad-szerokosci.spec.ts` | brak poziomego przewijania na 7 szerokościach + opcjonalne zrzuty |
| Modify `tailwind.config.ts` | kolory/zaokrąglenia/cienie z `tokeny.ts` |
| Modify `src/lib/kontrastTekstu.test.ts` | bez zmian logiki; ma dalej przechodzić |
| Modify `src/index.css` | hex → `theme()`, `rounded-[5px]` → `rounded`, `pe-chip` 10.5 → 12 px |
| Modify `src/components/ui/button.tsx` | hover hex → tokeny |
| Modify `src/components/calculators/CalcResultView.tsx` | `WERDYKT_STYL` i tła błędów z tokenów |
| Modify 37 plików `.tsx` z `text-[Npx]` | migracja na skalę (lista w Task 4) |

---

### Task 1: Test szerokości i zrzuty „przed”

Najpierw siatka bezpieczeństwa: test, który pilnuje braku poziomego przewijania strony, i zrzuty stanu wyjściowego do porównania.

**Files:**
- Create: `e2e/uklad-szerokosci.spec.ts`

**Interfaces:**
- Produces: spec uruchamiany przez `npx playwright test e2e/uklad-szerokosci.spec.ts --project=dev`; zmienna środowiskowa `ZRZUTY=<katalog>` włącza zapis zrzutów `<katalog>/<szerokość>-<widok>.png`.

- [ ] **Step 1: Napisz test**

```ts
import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Żaden widok nie przewija się w poziomie na żadnej z siedmiu szerokości ze specu
 * redesignu — od najmniejszego telefonu po monitor Full HD.
 *
 * Przy okazji, gdy ustawiona jest zmienna ZRZUTY=<katalog>, zapisuje zrzut każdego
 * widoku: to materiał „przed/po” do opisu PR-ów redesignu, a nie asercja.
 * Bez zmiennej test tylko sprawdza.
 */
const SZEROKOSCI = [360, 390, 430, 768, 1024, 1366, 1920] as const;
const ZRZUTY = process.env.ZRZUTY;

type Widok = { nazwa: string; wejdz: (page: Page) => Promise<void> };

const kafel = (page: Page, tytul: string) => page.getByRole("button", { name: tytul, exact: true }).first();

const WIDOKI: Widok[] = [
  { nazwa: "start", wejdz: async () => {} },
  { nazwa: "instalacja", wejdz: (p) => wczytajPrzyklad(p, "mieszkanie") },
  { nazwa: "rozdzielnica", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Rozdzielnica").click(); } },
  { nazwa: "schemat", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Schemat").click(); } },
  { nazwa: "kosztorys", wejdz: async (p) => { await wczytajPrzyklad(p, "mieszkanie"); await kafel(p, "Kosztorys").click(); } },
  { nazwa: "kalkulatory", wejdz: (p) => p.goto("/kalkulatory").then(() => undefined) },
  { nazwa: "dobor-obwodu", wejdz: (p) => p.goto("/kalkulatory/przekroj").then(() => undefined) },
  { nazwa: "protokoly", wejdz: (p) => p.goto("/protokoly").then(() => undefined) },
];

for (const szer of SZEROKOSCI) {
  test.describe(`${szer} px`, () => {
    test.use({ viewport: { width: szer, height: szer < 768 ? 844 : 900 } });

    for (const widok of WIDOKI) {
      test(`${widok.nazwa}: bez poziomego przewijania`, async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await widok.wejdz(page);
        await page.waitForLoadState("networkidle");

        const { scroll, okno } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          okno: window.innerWidth,
        }));
        expect(scroll, `szerokość dokumentu na ${szer} px`).toBeLessThanOrEqual(okno);

        if (ZRZUTY) await page.screenshot({ path: `${ZRZUTY}/${szer}-${widok.nazwa}.png`, fullPage: true });
      });
    }
  });
}
```

- [ ] **Step 2: Uruchom na stanie wyjściowym i zapisz zrzuty „przed”**

Run (Git Bash): `ZRZUTY="$TEMP/redesign/przed" npx playwright test e2e/uklad-szerokosci.spec.ts --project=dev --reporter=line`
Expected: 56 testów. Jeśli któryś pada — to istniejący błąd; zanotuj szerokość i widok w opisie PR (naprawa w Task 4 lub osobno), NIE osłabiaj asercji.

- [ ] **Step 3: Commit**

```bash
git add e2e/uklad-szerokosci.spec.ts
git commit -m "e2e: żaden widok nie przewija się w poziomie na 7 szerokościach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Moduł tokenów kolorów i motyw Tailwinda

**Files:**
- Create: `src/lib/tokeny.ts`, `src/lib/tokeny.test.ts`
- Modify: `tailwind.config.ts` (blok `colors`)

**Interfaces:**
- Produces: `export const KOLORY` (obiekt poniżej) i `export const KOLORY_TAILWIND` (mapa dla motywu). Klasy Tailwinda: `blueprint`, `blueprint-hover`, `blueprint-tlo`, `copper`, `copper-hover`, `copper-tlo`, `paper`, `surface`, `surface-2`, `ink`, `border`, `border-strong`, `success`, `success-grafika`, `success-tlo`, `caution`, `caution-tlo`, `danger`, `danger-grafika`, `danger-tlo`, aliasy `ok`, `warn`, oraz `slate.400/500` (bez zmian).

- [ ] **Step 1: Napisz failujący test**

`src/lib/tokeny.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { KOLORY } from "./tokeny";
import config from "../../tailwind.config";

function luminancja(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const kontrast = (a: string, b: string) => {
  const [x, y] = [luminancja(a), luminancja(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Każda para „tekst stanu na tle stanu” i każdy kolor tekstu na tłach aplikacji
 * musi spełniać AA. Tokeny są jedynym źródłem kolorów interfejsu, więc tu pilnujemy,
 * żeby nikt nie rozjaśnił ich „dla wyglądu”.
 */
describe("tokeny kolorów", () => {
  const TLA_APLIKACJI = [KOLORY.surface, KOLORY.paper, KOLORY.surface2];

  for (const [nazwa, tekst] of Object.entries({
    ink: KOLORY.ink,
    blueprint: KOLORY.blueprint,
    copper: KOLORY.copper,
    success: KOLORY.success,
    caution: KOLORY.caution,
    danger: KOLORY.danger,
  })) {
    for (const tlo of TLA_APLIKACJI) {
      it(`${nazwa} na ${tlo} ≥ 4,5:1`, () => expect(kontrast(tekst, tlo)).toBeGreaterThanOrEqual(4.5));
    }
  }

  for (const stan of ["success", "caution", "danger"] as const) {
    it(`${stan} na własnym tle ≥ 4,5:1`, () => {
      expect(kontrast(KOLORY[stan], KOLORY[`${stan}Tlo`])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("biały tekst na przyciskach głównych (copper i jego hover) ≥ 4,5:1", () => {
    expect(kontrast("#FFFFFF", KOLORY.copper)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast("#FFFFFF", KOLORY.copperHover)).toBeGreaterThanOrEqual(4.5);
  });

  it("grafika stanów (ikony, paski) ≥ 3:1 na bieli", () => {
    expect(kontrast(KOLORY.successGrafika, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(kontrast(KOLORY.dangerGrafika, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("motyw Tailwinda bierze kolory z tokenów, a stare nazwy są aliasami", () => {
    const c = config.theme?.extend?.colors as Record<string, unknown>;
    expect((c.copper as { DEFAULT: string }).DEFAULT).toBe(KOLORY.copper);
    expect(c.ok).toBe(KOLORY.successGrafika);
    expect(c.warn).toBe(KOLORY.dangerGrafika);
    expect(c["surface-2"]).toBe(KOLORY.surface2);
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/lib/tokeny.test.ts`
Expected: FAIL, „Failed to resolve import "./tokeny"”.

- [ ] **Step 3: Napisz moduł**

`src/lib/tokeny.ts`:

```ts
/**
 * Tokeny wyglądu interfejsu — JEDYNE źródło kolorów, zaokrągleń i cieni.
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
```

Uwaga: `copper` i `blueprint` są teraz obiektami z `DEFAULT`, więc istniejący `src/lib/kontrastTekstu.test.ts` (linia z `config.theme?.extend?.colors as { copper: string }`) czyta `copper` jako string — zmień tam na:

```ts
  const copper = (config.theme?.extend?.colors as { copper: { DEFAULT: string } }).copper.DEFAULT;
```

- [ ] **Step 4: Podłącz motyw**

W `tailwind.config.ts` dodaj `import { KOLORY_TAILWIND } from "./src/lib/tokeny";` i zastąp wpisy `ink`, `blueprint`, `copper`, `paper`, `ok`, `warn`, `border` w `colors` rozwinięciem `...KOLORY_TAILWIND`. Wpis `slate` i wszystkie komentarze (o slate i o miedzi) zostają nad nim bez zmian.

```ts
      colors: {
        // (komentarz o slate bez zmian)
        slate: { 400: "#5B6A80", 500: "#4F5D73" },
        // (komentarz o miedzi bez zmian — wartości są teraz w src/lib/tokeny.ts)
        ...KOLORY_TAILWIND,
      },
```

- [ ] **Step 5: Uruchom testy**

Run: `npx vitest run src/lib/tokeny.test.ts src/lib/kontrastTekstu.test.ts && npm run typecheck`
Expected: PASS. Jeśli para nie przechodzi progu — przyciemnij TEKST tokenu (nie tło) i zapisz nową wartość w obu miejscach testu i modułu.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tokeny.ts src/lib/tokeny.test.ts src/lib/kontrastTekstu.test.ts tailwind.config.ts
git commit -m "Tokeny kolorów: jedno źródło dla motywu, stylów inline i testów kontrastu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Zaokrąglenia i cienie w motywie

Przedefiniowanie w motywie zamiast przepisywania 180 klas: `rounded`/`rounded-sm`/`rounded-md` = 6 px, `rounded-lg`/`rounded-card` = 10 px, `rounded-xl` = 14 px; `shadow-sm` = `xs`, `shadow-md/lg/xl` = `pop`.

**Files:**
- Modify: `src/lib/tokeny.ts`, `src/lib/tokeny.test.ts`, `tailwind.config.ts` (`borderRadius`, `boxShadow`), `src/index.css` (`.pe-input`)

**Interfaces:**
- Produces: `export const PROMIENIE`, `export const CIENIE` w `tokeny.ts`; klasy `shadow-xs`, `shadow-pop`.

- [ ] **Step 1: Dopisz failujący test** (na końcu `tokeny.test.ts`)

```ts
import { PROMIENIE, CIENIE } from "./tokeny";

describe("tokeny kształtu", () => {
  const ext = config.theme?.extend as {
    borderRadius: Record<string, string>;
    boxShadow: Record<string, string>;
  };

  it("w motywie są tylko trzy promienie: 6, 10 i 14 px", () => {
    const wartosci = new Set(Object.entries(ext.borderRadius).filter(([k]) => k !== "full").map(([, v]) => v));
    expect([...wartosci].sort()).toEqual([PROMIENIE.maly, PROMIENIE.karta, PROMIENIE.duzy].sort());
  });

  it("w motywie są tylko dwa cienie", () => {
    expect(new Set(Object.values(ext.boxShadow))).toEqual(new Set([CIENIE.xs, CIENIE.pop]));
  });
});
```

(Import `PROMIENIE, CIENIE` przenieś do istniejącej linii importu z `./tokeny`.)

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/lib/tokeny.test.ts`
Expected: FAIL — brak eksportu `PROMIENIE`.

- [ ] **Step 3: Dopisz tokeny i motyw**

W `tokeny.ts`:

```ts
/** Trzy promienie: pola, przyciski, znaczniki / karty i panele / dialogi i arkusze. */
export const PROMIENIE = { maly: "6px", karta: "10px", duzy: "14px" } as const;

/** Dwa poziomy cienia: karta leżąca na tle / coś unoszącego się nad treścią. */
export const CIENIE = {
  xs: "0 1px 2px rgb(22 32 43 / 0.06)",
  pop: "0 8px 24px rgb(22 32 43 / 0.12)",
} as const;
```

W `tailwind.config.ts` (import rozszerz o `PROMIENIE, CIENIE`):

```ts
      borderRadius: {
        DEFAULT: PROMIENIE.maly,
        sm: PROMIENIE.maly,
        md: PROMIENIE.maly,
        lg: PROMIENIE.karta,
        card: PROMIENIE.karta,
        xl: PROMIENIE.duzy,
      },
      boxShadow: {
        xs: CIENIE.xs,
        sm: CIENIE.xs,
        DEFAULT: CIENIE.xs,
        pop: CIENIE.pop,
        md: CIENIE.pop,
        lg: CIENIE.pop,
        xl: CIENIE.pop,
      },
```

W `src/index.css` w `.pe-input` zamień `rounded-[5px]` na `rounded`.

- [ ] **Step 4: Sprawdź, że nie ma innych dowolnych promieni**

Run: `grep -rnE "rounded-\[|rounded-(2xl|3xl)" src --include=*.tsx --include=*.css`
Expected: brak wyników. Każde trafienie zamień na `rounded` / `rounded-card` / `rounded-xl` wg roli.

- [ ] **Step 5: Testy**

Run: `npx vitest run src/lib/tokeny.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tokeny.ts src/lib/tokeny.test.ts tailwind.config.ts src/index.css
git commit -m "Zaokrąglenia 6/10/14 px i dwa poziomy cienia w motywie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Skala tekstu — zakaz `text-[Npx]` i migracja

**Files:**
- Create: `src/lib/skalaTekstu.test.ts`
- Modify: 37 plików z `text-[Npx]` (lista: `grep -rlE "text-\[[0-9.]+px\]" src --include=*.tsx`), `src/index.css` (`.pe-chip`)

**Interfaces:**
- Consumes: nic.
- Produces: reguła „w `src/**/*.tsx` nie ma `text-[<liczba>px]`”, pilnowana testem.

- [ ] **Step 1: Napisz failujący test**

`src/lib/skalaTekstu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Rozmiary tekstu tylko ze skali Tailwinda (xs 12 … 3xl 30), nigdy `text-[11px]`.
 *
 * Przed redesignem było 17 rozmiarów (8,5–23 px) i ok. 120 miejsc z tekstem 10–11 px —
 * nieczytelnym na budowie i w samochodzie. Minimum interfejsu to `text-xs` (12 px).
 * Napisy rysowane na płótnie (Konva, SVG z `fontSize`) tej reguły nie dotyczą —
 * to grafika techniczna i nie używa klas.
 */
function plikiTsx(katalog: string): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    return statSync(p).isDirectory() ? plikiTsx(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("skala tekstu", () => {
  it("żaden komponent nie używa dowolnego rozmiaru text-[Npx]", () => {
    const naruszenia = plikiTsx("src").flatMap((plik) =>
      (readFileSync(plik, "utf8").match(/text-\[\d+(\.\d+)?px\]/g) ?? []).map((m) => `${plik}: ${m}`)
    );
    expect(naruszenia).toEqual([]);
  });

  it("arkusz nie ustawia tekstu poniżej 12 px", () => {
    const css = readFileSync("src/index.css", "utf8");
    const male = [...css.matchAll(/font-size:\s*(\d+(\.\d+)?)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
    expect(male).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/lib/skalaTekstu.test.ts`
Expected: FAIL z listą ~178 naruszeń i `[10.5]` w arkuszu.

- [ ] **Step 3: Migracja mechaniczna**

Mapa (rola, nie najbliższy piksel — w górę, bo minimum to 12 px):

| było | jest |
|---|---|
| `text-[8.5px]` `text-[9px]` `text-[10px]` `text-[10.5px]` `text-[11px]` `text-[11.5px]` `text-[12px]` | `text-xs` |
| `text-[12.5px]` `text-[13px]` `text-[14px]` | `text-sm` |
| `text-[15px]` | `text-base` |
| `text-[17px]` | `text-lg` |
| `text-[23px]` | `text-2xl` |

Run (Git Bash, z katalogu repo):

```bash
grep -rlE "text-\[[0-9.]+px\]" src --include=*.tsx | xargs sed -i -E \
  -e 's/text-\[(8\.5|9|10|10\.5|11|11\.5|12)px\]/text-xs/g' \
  -e 's/text-\[(12\.5|13|14)px\]/text-sm/g' \
  -e 's/text-\[15px\]/text-base/g' \
  -e 's/text-\[17px\]/text-lg/g' \
  -e 's/text-\[23px\]/text-2xl/g'
```

W `src/index.css` w `.pe-chip` zmień `font-size: 10.5px;` na `font-size: 12px;` i `padding: 2px 7px;` na `padding: 2px 8px;`.

- [ ] **Step 4: Usuń zdublowane klasy rozmiaru**

Migracja mogła zostawić dwa rozmiary w jednym `className` (np. `text-xs text-[11px]` → `text-xs text-xs`, albo `text-sm sm:text-[13px]` → `text-sm sm:text-sm`).

Run: `grep -rnE "(text-(xs|sm|base|lg|2xl))[^\"\`]*\b\1\b" src --include=*.tsx`
Expected: każde trafienie popraw ręcznie, zostawiając jeden rozmiar (przy prefiksach responsywnych usuń prefiksowaną kopię, jeśli jest identyczna).

- [ ] **Step 5: Testy jednostkowe, typy, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS (w tym `skalaTekstu.test.ts`).

- [ ] **Step 6: Commit migracji**

```bash
git add -A src
git commit -m "Skala tekstu: koniec z text-[Npx], minimum interfejsu 12 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Układ po powiększeniu tekstu — e2e**

Tekst 10–11 px urósł do 12 px; ciasne miejsca (kafle etapów 01–04, pasek edytora, nagłówek na telefonie, rozdzielnica) mogą się nie zmieścić.

Run: `npx playwright test e2e/uklad-szerokosci.spec.ts e2e/kafle-etapow.spec.ts e2e/naglowek-telefon.spec.ts e2e/edytor-miesci-sie-w-oknie.spec.ts e2e/edytor-waski-ekran.spec.ts e2e/edytor-telefon-zwarty.spec.ts e2e/niskie-okno.spec.ts e2e/tablet-uklad.spec.ts e2e/rozdzielnica-uklad.spec.ts e2e/protokoly-uklad.spec.ts e2e/cele-dotykowe.spec.ts --project=dev --reporter=line`
Expected: wszystkie PASS. Dla każdego FAIL: obejrzyj zrzut z `test-results/`, popraw UKŁAD (zawijanie `min-w-0`/`truncate`, mniejszy odstęp, ukrycie podtytułu poniżej progu) — nie wracaj do rozmiaru poniżej 12 px. Każda poprawka z komentarzem „dlaczego” i osobnym commitem:

```bash
git commit -am "<widok>: mieści się po podniesieniu minimum tekstu do 12 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hex w arkuszu i komponentach → tokeny

**Files:**
- Modify: `src/index.css`, `src/components/ui/button.tsx`, `src/components/calculators/CalcResultView.tsx`

**Interfaces:**
- Consumes: `KOLORY` z `src/lib/tokeny.ts`; klasy `copper-hover`, `danger`, `danger-tlo`, `success-tlo` itd. z Task 2.

- [ ] **Step 1: Arkusz**

W `src/index.css` zamień wartości hex na `theme()` (Tailwind rozwija je przy budowie):

| miejsce | było | jest |
|---|---|---|
| `.pe-btn-copper:hover` | `#86501f` | `theme('colors.copper.hover')` |
| `.pe-input:focus` outline | `#2d5a8c33` | `rgb(45 90 140 / 0.2)` (bez zmian koloru; `theme()` nie robi alfy w Tailwind 3) |
| `.pe-tag-blue` | `#2d5a8c…` | `theme('colors.blueprint.tlo')` tło, `theme('colors.blueprint.DEFAULT')` tekst, `theme('colors.border-strong')` ramka |
| `.pe-tag-copper` | `#c1793f0f / #8a5526` | `theme('colors.copper.tlo')`, `theme('colors.caution.DEFAULT')`, `theme('colors.border-strong')` |
| `.pe-tag-green` | `#3b8c630f / #2c6b4a` | `theme('colors.success.tlo')`, `theme('colors.success.DEFAULT')`, `theme('colors.border-strong')` |
| `.pe-result` border-top | `#2d5a8c` | `theme('colors.blueprint.DEFAULT')` |
| `.pe-scroll` thumb | `#c7d0d9` | `theme('colors.border-strong')` |

`.pe-wskazane` i `@keyframes pe-puls` (`#c1793f`) zostają — to miedź rysunku/onboardingu, świadomie jaśniejsza (komentarz w `tailwind.config.ts`).

- [ ] **Step 2: Przycisk**

W `src/components/ui/button.tsx`: `hover:bg-[#A9652F]` → `hover:bg-copper-hover`, `hover:bg-[#A2352C]` → `hover:bg-danger`, `bg-warn` → `bg-danger-grafika`.

- [ ] **Step 3: Werdykt i błędy kalkulatora**

W `src/components/calculators/CalcResultView.tsx` dodaj `import { KOLORY } from "@/lib/tokeny";` i zamień:

```ts
const WERDYKT_STYL = {
  spelniony: { bg: KOLORY.successTlo, fg: KOLORY.success, Icon: Check, etykieta: "Warunek spełniony" },
  graniczny: { bg: KOLORY.cautionTlo, fg: KOLORY.caution, Icon: TriangleAlert, etykieta: "Wynik graniczny" },
  niespelniony: { bg: KOLORY.dangerTlo, fg: KOLORY.danger, Icon: AlertTriangle, etykieta: "Warunek niespełniony" },
  nieoceniany: { bg: KOLORY.paper, fg: "#475569", Icon: Info, etykieta: "Bez oceny warunku" },
} as const;
```

(`#475569` = Tailwind slate-600, nieprzedefiniowany w motywie — zostaje.) Komentarz nad stałą o nieprzezroczystych tłach zostaje. Tło błędu walidacji `style={{ background: "#C6433A14", color: "#A2352C" }}` → `className="… bg-danger-tlo text-danger"` (usuń `style`). Znacznik źródła `style={{ background: "#EEF1F4", color: "#475569" }}` → `className="pe-chip bg-paper text-slate-600"`.

- [ ] **Step 4: Sprawdź pozostałe hex w tych trzech plikach**

Run: `grep -nE "#[0-9A-Fa-f]{6}" src/index.css src/components/ui/button.tsx src/components/calculators/CalcResultView.tsx`
Expected: tylko `.pe-wskazane`/`pe-puls` (`#c1793f`) i `#475569`.

- [ ] **Step 5: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint && npx playwright test e2e/calculators.spec.ts e2e/warunki-doboru.spec.ts --project=dev --reporter=line`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/components/ui/button.tsx src/components/calculators/CalcResultView.tsx
git commit -m "Arkusz, przycisk i werdykt kalkulatora biorą kolory z tokenów

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kontrola jakości i PR

**Files:** brak zmian w kodzie (chyba że kontrola coś znajdzie — wtedy osobny commit z opisem).

- [ ] **Step 1: Pełne sprawdzenie**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: wszystko zielone.

- [ ] **Step 2: Pełne e2e**

Run: `npx playwright test --reporter=line` (w tle, ~5–15 min)
Expected: przeczytaj CAŁE podsumowanie: 0 failed. Flake uznaj dopiero po ponownym uruchomieniu samego pliku i przejściu.

- [ ] **Step 3: Zrzuty „po” i porównanie**

Run: `ZRZUTY="$TEMP/redesign/po" npx playwright test e2e/uklad-szerokosci.spec.ts --project=dev --reporter=line`
Obejrzyj pary `przed/<plik>` ↔ `po/<plik>` dla 390, 1366 i 1920 px: start, instalacja, rozdzielnica, kosztorys, dobor-obwodu. Szukaj: tekstu uciętego w pół słowa, nachodzenia, przesuniętych przycisków. Każde znalezisko → poprawka + commit (jak w Task 4 Step 7).

- [ ] **Step 4: Konsola**

W przeglądarce (`preview_start` „pomocnik-ts-dev”) przejdź przez 8 widoków z Task 1; `read_console_messages` z `onlyErrors: true` — oczekiwane 0 błędów.

- [ ] **Step 5: Push i PR**

```bash
git push -u origin redesign-ewolucja
gh pr create --base main --title "Redesign 1/5: tokeny kolorów, skala tekstu, zaokrąglenia i cienie" --body-file <plik z opisem>
```

Opis PR: co się zmieniło (4 punkty), doprecyzowania względem specu (skala Tailwinda, tokeny w TS), wyniki kontroli (typecheck/lint/vitest/e2e z liczbami), 3 pary zrzutów przed/po (390 i 1366 px), stopka `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
