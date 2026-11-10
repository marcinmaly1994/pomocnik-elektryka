# Redesign PR 4 — kalkulatory: wynik główny i ikony listy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wynik obliczenia jest najważniejszą rzeczą na ekranie kalkulatora — duży, czytelny z odległości ręki, w tym samym miejscu i w tej samej formie w każdym z 19 kalkulatorów — a lista kalkulatorów daje się przeglądać wzrokiem dzięki ikonom.

**Architecture:** Nowy komponent prezentacyjny `src/components/calculators/WynikGlowny.tsx` (lista opisów `<dl>`: etykieta → wartość + jednostka, pod spodem dowolna treść — znaczniki, komunikat) zastępuje 26 ręcznie składanych bloków `pe-result` w `CalculatorsTab.tsx` i czterech plikach kalkulatorów. Komponent zachowuje klasę `pe-result` (stoją na niej testy e2e) i nie liczy niczego — dostaje gotowe wartości, jak `CalcResultView`. Ikony w jednej mapie `src/components/calculators/ikonyKalkulatorow.ts`, używanej przez kafle, wiersze listy i wybór na telefonie.

**Tech Stack:** React 18, Tailwind 3, lucide-react, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-redesign-ewolucja-design.md` — sekcja 6 „Kalkulatory i wyniki”, sekcja 9, „Kontrola jakości”. Poprzednie plany PR 1–3 w `docs/superpowers/plans/2026-11-0*-redesign-*.md`.

## Global Constraints

- Gałąź `redesign-kalkulatory` od `redesign-nawigacja` (#268 → #266 → #239). PR celuje w `redesign-nawigacja`, dopóki niższe nie trafią do `main`. Nigdy nie nazywać gałęzi `dependabot`.
- Worktree `C:/Users/Marcin/Desktop/pomocnik-ts-redesign-4`. Worktree `pomocnik-ts-redesign`, `-2`, `-3` obsługują Auto-fix #239/#266/#268 — nie dotykać. Główny checkout użytkownika — nie dotykać.
- e2e tylko przez nieśledzony `playwright.worktree.config.ts` (porty 5273/5290), port check przed każdym uruchomieniem, pełne podsumowanie (nie `tail -1`), `--grep-invert @chmura` lokalnie. Warianty CI: szerokość −15 px (bez przekraczania progów 640/768) albo `*{letter-spacing:0.3px}` przez `addInitScript`.
- **ZERO zmian w obliczeniach.** Wartości, zaokrąglenia (`formatLiczba(x, n)`), teksty etykiet, jednostki, kolejność wartości i znaczników — bez zmian. Zmienia się wyłącznie prezentacja. Pliki `src/lib/calc/**`, `src/lib/norms/**` nietknięte.
- Klasa `pe-result` i `data-testid` (np. `wynik-doboru`) zostają na korzeniu bloku wyniku — testy e2e szukają po nich (`calculators.spec.ts`, `audyt-p2-*.spec.ts`).
- Werdykt (`PasekWerdyktu` w `CalcResultView`) i wynik główny stoją w DOM PRZED rachunkiem krok po kroku (już tak jest — nie zmieniać kolejności).
- Tokeny, skala tekstu (min. `text-xs`, żadnych `text-[Npx]`), `Badge`, `Alert`, `Button` z PR 1–3. Kontrast tekstu ≥ 4,5:1.
- Komentarze po polsku (dlaczego, nie co); commit kończy się `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Rozstrzygnięcia względem specu

1. **„Ostatnio używane” już istnieje** (`EkranStartowy` + `ostatnieKalkulatory` w `useCalculatorsStore`, z zapisem w trwałym store) — PR 4 dodaje tam tylko ikony, nie buduje sekcji od nowa.
2. **Rozmiar wartości zależy od ich liczby w bloku:** 1–2 wartości → `text-2xl sm:text-3xl` (24 / 30 px), 3–4 wartości → `text-xl` (20 px). Cztery liczby po 30 px nie mieszczą się w kolumnach na telefonie, a blok z czterema równorzędnymi wartościami nie ma jednej „najważniejszej”.
3. **Semantyka `<dl>`** (etykieta `<dt>`, wartość `<dd>`) — czytnik ekranu czyta parę „Przekrój żyły: 2,5 mm²”, zamiast dwóch niezwiązanych linijek tekstu.

---

## Mapa plików

| Plik | Rola |
|---|---|
| Create `src/components/calculators/WynikGlowny.tsx` + `.test.tsx` | blok wyniku głównego |
| Create `src/components/calculators/ikonyKalkulatorow.ts` + `.test.ts` | ikona dla każdego `CalcId` |
| Create `e2e/wynik-glowny.spec.ts` | wynik widoczny i duży we wszystkich kalkulatorach |
| Modify `src/components/calculators/CalculatorsTab.tsx` | 20 bloków `pe-result` → `WynikGlowny` |
| Modify `KalkulatorImpedancji.tsx`, `KalkulatorKompensacji.tsx`, `KalkulatorPeN.tsx`, `KalkulatorSPD.tsx` | 6 bloków → `WynikGlowny` |
| Modify `src/components/calculators/NawigacjaKalkulatorow.tsx` | ikony w `Kafel`, `WierszListy`, `WyborKalkulatoraMobile` |
| Modify `src/index.css` | `.pe-result` dopasowany do komponentu (jeśli potrzeba) |

---

### Task 1: Komponent `WynikGlowny`

**Files:**
- Create: `src/components/calculators/WynikGlowny.tsx`, `src/components/calculators/WynikGlowny.test.tsx`

**Interfaces:**
- Produces:

```ts
export type WartoscWyniku = {
  etykieta: string;
  /** Liczba albo krótki tekst, już sformatowany (`formatLiczba`) — komponent nic nie liczy. */
  wartosc: React.ReactNode;
  /** Jednostka mniejszym krojem obok wartości („mm²”, „A”, „Ω”). Pomiń, gdy jest częścią `wartosc`. */
  jednostka?: string;
  /** `akcent` = miedź (limity, wartości graniczne), domyślnie kolor główny. */
  ton?: "glowny" | "akcent";
};

export function WynikGlowny(props: {
  wartosci: WartoscWyniku[];
  children?: React.ReactNode; // znaczniki, komunikat — pod wartościami
  className?: string;
  "data-testid"?: string;
}): JSX.Element;
```

- [ ] **Step 1: Failujący test**

`src/components/calculators/WynikGlowny.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WynikGlowny } from "./WynikGlowny";

describe("WynikGlowny", () => {
  it("para etykieta → wartość jako lista opisów, z jednostką", () => {
    const { container } = render(
      <WynikGlowny wartosci={[{ etykieta: "Przekrój żyły", wartosc: "2,5", jednostka: "mm²" }]} />
    );
    const dt = container.querySelector("dt")!;
    const dd = container.querySelector("dd")!;
    expect(dt).toHaveTextContent("Przekrój żyły");
    expect(dd).toHaveTextContent("2,5 mm²");
  });

  it("korzeń ma klasę pe-result i przekazuje data-testid (stoją na nich testy e2e)", () => {
    const { container } = render(
      <WynikGlowny data-testid="wynik-doboru" wartosci={[{ etykieta: "a", wartosc: "1" }]} />
    );
    expect(container.firstElementChild).toHaveClass("pe-result");
    expect(screen.getByTestId("wynik-doboru")).toBe(container.firstElementChild);
  });

  it("1–2 wartości są duże (24/30 px), 3–4 średnie (20 px)", () => {
    const { container, rerender } = render(
      <WynikGlowny wartosci={[{ etykieta: "a", wartosc: "1" }, { etykieta: "b", wartosc: "2" }]} />
    );
    for (const dd of container.querySelectorAll("dd")) expect(dd.className).toMatch(/text-2xl.*sm:text-3xl/);
    rerender(
      <WynikGlowny
        wartosci={[
          { etykieta: "a", wartosc: "1" },
          { etykieta: "b", wartosc: "2" },
          { etykieta: "c", wartosc: "3" },
        ]}
      />
    );
    for (const dd of container.querySelectorAll("dd")) expect(dd.className).toContain("text-xl");
  });

  it("ton akcent daje kolor miedzi, domyślny — kolor główny", () => {
    const { container } = render(
      <WynikGlowny
        wartosci={[
          { etykieta: "Zs max", wartosc: "2,73", jednostka: "Ω", ton: "akcent" },
          { etykieta: "Ia", wartosc: "80", jednostka: "A" },
        ]}
      />
    );
    const [a, b] = container.querySelectorAll("dd");
    expect(a.className).toContain("text-copper");
    expect(b.className).toContain("text-blueprint");
  });

  it("treść pod wartościami (znaczniki, komunikat) jest w tym samym bloku", () => {
    render(
      <WynikGlowny data-testid="w" wartosci={[]}>
        <p>nie udało się dobrać</p>
      </WynikGlowny>
    );
    expect(screen.getByTestId("w")).toHaveTextContent("nie udało się dobrać");
  });

  it("bez wartości nie renderuje pustej listy", () => {
    const { container } = render(<WynikGlowny wartosci={[]}>x</WynikGlowny>);
    expect(container.querySelector("dl")).toBeNull();
  });
});
```

Run: `npx vitest run src/components/calculators/WynikGlowny.test.tsx` — Expected: FAIL (brak modułu).

- [ ] **Step 2: Komponent**

`src/components/calculators/WynikGlowny.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Wynik główny kalkulatora — to, po co użytkownik przyszedł, w jednej formie w każdym
 * z 19 kalkulatorów.
 *
 * Do redesignu każdy kalkulator składał blok wyniku ręcznie: podpis 12 px, wartość
 * 18 px w jednej karcie, 16 px w innej, a komunikat „bez oceny warunku” pod spodem
 * bywał WIĘKSZY od samego wyniku. Na budowie, z telefonem w wyciągniętej ręce, liczba
 * ma być pierwszą rzeczą, którą widać.
 *
 * Nic tu nie jest liczone — wartości przychodzą sformatowane, jak w `CalcResultView`.
 * Klasa `pe-result` i `data-testid` zostają na korzeniu: szukają po nich testy e2e.
 * `<dl>`, bo czytnik ekranu ma czytać parę „Przekrój żyły: 2,5 mm²”, nie dwie osobne linie.
 */
export type WartoscWyniku = {
  etykieta: string;
  wartosc: React.ReactNode;
  jednostka?: string;
  ton?: "glowny" | "akcent";
};

export function WynikGlowny({
  wartosci,
  children,
  className,
  "data-testid": testId,
}: {
  wartosci: WartoscWyniku[];
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  // Rozmiar od liczby wartości: jedna albo dwie to „bohater” ekranu, przy trzech-czterech
  // równorzędnych nie ma jednej najważniejszej, a 30 px nie mieści się w kolumnach telefonu.
  const duze = wartosci.length <= 2;
  return (
    <div data-testid={testId} className={cn("pe-result mt-2 p-4", className)}>
      {wartosci.length > 0 && (
        <dl
          className={cn(
            "grid gap-x-4 gap-y-3",
            wartosci.length === 1 ? "grid-cols-1" : "grid-cols-2",
            wartosci.length === 3 && "sm:grid-cols-3",
            wartosci.length >= 4 && "sm:grid-cols-4"
          )}
        >
          {wartosci.map(({ etykieta, wartosc, jednostka, ton }) => (
            <div key={etykieta} className="min-w-0">
              <dt className="text-sm text-slate-500">{etykieta}</dt>
              <dd
                className={cn(
                  "pe-mono mt-0.5 font-semibold leading-tight [overflow-wrap:anywhere]",
                  duze ? "text-2xl sm:text-3xl" : "text-xl",
                  ton === "akcent" ? "text-copper" : "text-blueprint"
                )}
              >
                {wartosc}
                {jednostka && <span className="ml-1 text-base font-normal text-slate-500">{jednostka}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className={cn(wartosci.length > 0 && "mt-3")}>{children}</div>}
    </div>
  );
}
```

Run: test z Step 1 — Expected: PASS. Potem `npm run typecheck && npm run lint`.

- [ ] **Step 3: Commit**

```bash
git add src/components/calculators/WynikGlowny.tsx src/components/calculators/WynikGlowny.test.tsx
git commit -m "WynikGlowny: jeden blok wyniku dla wszystkich kalkulatorów, wartość 24–30 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migracja wyników — `CalculatorsTab.tsx`

**Files:**
- Modify: `src/components/calculators/CalculatorsTab.tsx` (20 bloków `pe-result`, stan 2026-11-09: ~1265, ~1475, ~1515, ~1746, ~1843, ~1965, ~2066, ~2178, ~2239, ~2342, ~2453, ~2538, ~2695, ~2737, ~2804, ~2905, ~3011, ~3151, ~3233, ~3299 — znajdź grepem `pe-result`)
- Create: `e2e/wynik-glowny.spec.ts`

**Interfaces:**
- Consumes: `WynikGlowny`, `WartoscWyniku` z Task 1; `Badge`, `Alert`.

- [ ] **Step 1: Failujący e2e**

`e2e/wynik-glowny.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

/**
 * Wynik główny jest duży i taki sam w każdym kalkulatorze.
 *
 * Przed PR 4 wartość wyniku miała 16–18 px i bywała mniejsza od komunikatu pod nią.
 * Teraz każdy kalkulator, który ma blok wyniku (`.pe-result`) przy wartościach
 * domyślnych, pokazuje go jako listę opisów z wartością co najmniej 20 px — a jeśli
 * wartości są jedna-dwie, co najmniej 24 px. Kalkulatory bez wyniku przy wartościach
 * domyślnych (puste pola) są pomijane jawnie, nie po cichu.
 */
const KALKULATORY = [
  "moc", "obwod", "gGWkladka", "spadek", "dlugosc", "impedancja", "zwarcie", "petla",
  "uziemienieTT", "uziom", "rcd", "peN", "bilansFaz", "kompensacja", "silnik", "spd",
  "pv", "ev", "oswietlenie",
] as const;

for (const szer of [375, 1366]) {
  test(`${szer} px: wynik główny jako lista opisów, wartości ≥ 20 px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: szer, height: 900 });
    const bezWyniku: string[] = [];
    for (const id of KALKULATORY) {
      await page.goto(`/kalkulatory/${id}`);
      await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
      const wynik = page.locator(".pe-result").first();
      if ((await wynik.count()) === 0) {
        bezWyniku.push(id);
        continue;
      }
      const rozmiary = await wynik.locator("dd").evaluateAll((dd) =>
        dd.map((e) => parseFloat(getComputedStyle(e).fontSize))
      );
      expect(rozmiary.length, `${id}: brak <dd> w bloku wyniku`).toBeGreaterThan(0);
      const minimum = rozmiary.length <= 2 ? 24 : 20;
      for (const r of rozmiary) expect(r, `${id}`).toBeGreaterThanOrEqual(minimum);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: poziome przewijanie`).toBe(true);
    }
    // Lista „bez wyniku przy domyślnych” ma być krótka i znana — każda nowa pozycja to sygnał.
    expect(bezWyniku.length, `bez wyniku: ${bezWyniku.join(", ")}`).toBeLessThanOrEqual(4);
  });
}
```

Run (port check najpierw): `npx playwright test e2e/wynik-glowny.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line` — Expected: FAIL (brak `<dd>`). Zapisz w raporcie listę `bezWyniku` z pierwszego przebiegu; jeśli jest dłuższa niż 4, zgłoś to (NEEDS_CONTEXT) zamiast podnosić próg.

- [ ] **Step 2: Migracja — reguły**

Każdy blok `<div className="… pe-result …">` → `<WynikGlowny …>`:

| było | jest |
|---|---|
| `<div className="text-xs text-slate-500 mb-1">Etykieta</div><div className="pe-mono text-lg text-blueprint">{x} mm²</div>` | wpis `{ etykieta: "Etykieta", wartosc: x, jednostka: "mm²" }` — jednostkę wydziel, gdy stoi na końcu jako stały tekst |
| wartość w `text-copper` | `ton: "akcent"` |
| wartość złożona (np. `{charakterystyka}{In} {bieguny}`, `{typ}, In {x} A`) | `wartosc` = ten sam JSX/tekst, bez `jednostka` |
| `grid grid-cols-2 …` z kilkoma parami | jeden `WynikGlowny` z kilkoma wpisami (kolejność ta sama) |
| wiersze znaczników (`<div className="mt-2 flex gap-2 flex-wrap"><Badge…/></div>`) | `children` — bez zmian w treści i kolejności |
| `data-testid` na bloku | `data-testid` na `WynikGlowny` |
| gałąź „brak wyniku” w tym samym bloku (np. `nie udało się dobrać`) | `<WynikGlowny wartosci={[]}>…komunikat…</WynikGlowny>` — komunikat jako `Alert variant="caution" role="note"`, jeśli dziś jest zwykłym tekstem w ramce; treść bez zmian |
| `mt-2 p-3` na bloku | usuń — są w komponencie (`mt-2 p-4`) |

Wartość, która dziś jest „—” przy braku danych: zostaje „—” (bez jednostki). Wszystkie `formatLiczba(x, n)` przenoszą się 1:1 — nie zmieniaj liczby miejsc po przecinku.

- [ ] **Step 3: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/wynik-glowny.spec.ts e2e/calculators.spec.ts e2e/kalkulatory-telefon.spec.ts e2e/audyt-p2-obliczenia.spec.ts e2e/audyt-p2-wyniki.spec.ts e2e/audyt-p2-walidacja.spec.ts e2e/warunki-doboru.spec.ts e2e/dobor-telefon.spec.ts e2e/kalkulatory-monitor.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: `wynik-glowny` nadal FAIL tylko dla kalkulatorów z osobnych plików (Task 3) — wypisz je; reszta PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculators/CalculatorsTab.tsx e2e/wynik-glowny.spec.ts
git commit -m "Kalkulatory: wynik główny przez WynikGlowny w CalculatorsTab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migracja wyników — osobne pliki kalkulatorów

**Files:**
- Modify: `src/components/calculators/KalkulatorImpedancji.tsx` (~96, ~152), `KalkulatorKompensacji.tsx` (~92), `KalkulatorPeN.tsx` (~86, ~120), `KalkulatorSPD.tsx` (~77)

**Interfaces:**
- Consumes: `WynikGlowny` z Task 1; reguły migracji z Task 2 (powtórzone niżej).

- [ ] **Step 1: Migracja** — te same reguły co w Task 2 Step 2:
  etykieta `text-xs text-slate-500` + wartość `pe-mono text-lg text-blueprint` → wpis `{ etykieta, wartosc, jednostka? }`; `text-copper` → `ton: "akcent"`; znaczniki → `children`; `data-testid` przenosi się; `mt-2 p-3` usuń; `formatLiczba` 1:1; brak wyniku → `wartosci={[]}` z komunikatem w `children`.
- [ ] **Step 2: Testy** — `npx vitest run && npm run typecheck && npm run lint`; Playwright jak w Task 2 Step 3 — teraz `wynik-glowny.spec.ts` PASS w całości (oba rozmiary okna). Dodatkowo `grep -rn "pe-result" src --include=*.tsx` → trafienia tylko w `WynikGlowny.tsx` (i ewentualnie w komentarzach).
- [ ] **Step 3: Commit**

```bash
git add src/components/calculators
git commit -m "Kalkulatory: wynik główny także w impedancji, kompensacji, PE/N i SPD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ikony na liście kalkulatorów

**Files:**
- Create: `src/components/calculators/ikonyKalkulatorow.ts`, `src/components/calculators/ikonyKalkulatorow.test.ts`
- Modify: `src/components/calculators/NawigacjaKalkulatorow.tsx` (`Kafel` ~118, `WierszListy` ~94, `WyborKalkulatoraMobile` ~217, nagłówek „Ostatnio używane” ~303)

**Interfaces:**
- Produces: `export const IKONY_KALKULATOROW: Record<CalcId, LucideIcon>` i `export function ikonaKalkulatora(id: CalcId): LucideIcon`.

- [ ] **Step 1: Failujący test**

`src/components/calculators/ikonyKalkulatorow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { IKONY_KALKULATOROW } from "./ikonyKalkulatorow";

/** Każdy kalkulator ma ikonę i żadne dwa nie mają tej samej — ikona ma pomagać
 *  odróżniać pozycje na liście, a dwie jednakowe robią dokładnie odwrotnie. */
describe("ikony kalkulatorów", () => {
  const IDS = [
    "moc", "obwod", "gGWkladka", "spadek", "dlugosc", "impedancja", "zwarcie", "petla",
    "uziemienieTT", "uziom", "rcd", "peN", "bilansFaz", "kompensacja", "silnik", "spd",
    "pv", "ev", "oswietlenie",
  ];

  it("każdy kalkulator ma ikonę", () => {
    for (const id of IDS) expect(IKONY_KALKULATOROW[id as keyof typeof IKONY_KALKULATOROW], id).toBeTruthy();
  });

  it("ikony się nie powtarzają", () => {
    const ikony = IDS.map((id) => IKONY_KALKULATOROW[id as keyof typeof IKONY_KALKULATOROW]);
    expect(new Set(ikony).size).toBe(ikony.length);
  });
});
```

Jeśli `CalcId` w `src/store/useCalculatorsStore.ts` zawiera więcej identyfikatorów niż te 19 (np. dawne adresy), mapa i tak musi pokryć cały typ (`Record<CalcId, …>` wymusi to przy `typecheck`); test sprawdza 19 widocznych na liście.

- [ ] **Step 2: Mapa**

`src/components/calculators/ikonyKalkulatorow.ts`:

```ts
import {
  Activity, Anchor, Battery, Cable, Cog, Earth, Gauge, Lightbulb, PlugZap, RotateCw,
  Ruler, Scale, Shield, ShieldAlert, ShieldCheck, Split, Sun, Waves, Zap, type LucideIcon,
} from "lucide-react";
import type { CalcId } from "@/store/useCalculatorsStore";

/**
 * Ikona każdego kalkulatora — jedna mapa dla kafli, wierszy listy i wyboru na telefonie.
 *
 * Dziewiętnaście pozycji samym tekstem czytało się jak spis treści: żeby znaleźć
 * „Uziom”, trzeba było przeczytać wszystko po kolei. Ikona nie zastępuje nazwy (stoi
 * obok i jest `aria-hidden`), tylko pozwala wrócić wzrokiem tam, gdzie się już było.
 */
export const IKONY_KALKULATOROW: Record<CalcId, LucideIcon> = {
  moc: Gauge,
  obwod: Cable,
  gGWkladka: ShieldCheck,
  spadek: Activity,
  dlugosc: Ruler,
  impedancja: Waves,
  zwarcie: Zap,
  petla: RotateCw,
  uziemienieTT: Earth,
  uziom: Anchor,
  rcd: ShieldAlert,
  peN: Split,
  bilansFaz: Scale,
  kompensacja: Battery,
  silnik: Cog,
  spd: Shield,
  pv: Sun,
  ev: PlugZap,
  oswietlenie: Lightbulb,
  // Dawne adresy scalone w „Dobór obwodu” (przekierowują do jego trybów — patrz
  // `STARE_ADRESY` w CalculatorsTab.tsx) — ta sama ikona, bo to ten sam kalkulator.
  przekroj: Cable,
  zabezpieczenie: Cable,
  wlz: Cable,
  pelnyDobor: Cable,
};

export function ikonaKalkulatora(id: CalcId): LucideIcon {
  return IKONY_KALKULATOROW[id];
}
```

Wszystkie nazwy sprawdzone w zainstalowanym `lucide-react` (2026-11-09). `CalcId` ma 23 wartości: 19 widocznych na liście + 4 dawne adresy „Doboru obwodu” — test unikalności obejmuje tylko 19 widocznych.

- [ ] **Step 3: Ikony w liście**

- `Kafel`: ikona 20 px po lewej, w kwadracie 36 × 36 px (`rounded-md bg-blueprint-tlo text-blueprint`, aktywny: `bg-blueprint text-white`), `aria-hidden`; tekst w `min-w-0` obok (`flex items-start gap-3`).
- `WierszListy`: ikona 16 px przed nazwą (`text-slate-400`, aktywny `text-blueprint`), `aria-hidden`; opis aktywnego dalej pod nazwą, wyrównany do tekstu, nie do ikony.
- `WyborKalkulatoraMobile`: ikona przy nazwie bieżącego kalkulatora na przycisku „Zmień kalkulator” i przy pozycjach w rozwijanej liście (jeśli renderuje `WierszListy`, dostaje to za darmo).
- Zamień stałe hex w tych komponentach (`#2D5A8C`, `#16202B`, `#DCE2E8`) na klasy tokenów (`text-blueprint`, `text-ink`, `border-border`); `shadow-[inset_2px_0_0_#2D5A8C]` może zostać (hex bez alfy).
- Nazwy dostępne przycisków bez zmian (ikony `aria-hidden`).

- [ ] **Step 4: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/calculators.spec.ts e2e/kalkulatory-telefon.spec.ts e2e/kalkulatory-monitor.spec.ts e2e/routing.spec.ts e2e/cele-dotykowe.spec.ts e2e/uklad-szerokosci.spec.ts e2e/fokus-widoczny.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura` — plus wariant `kalkulatory-telefon` przy 360 px (kopia tymczasowa, 375−15).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calculators
git commit -m "Lista kalkulatorów z ikonami — kafle, wiersze i wybór na telefonie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kontrola jakości

- [ ] **Step 1:** `npm run typecheck && npm run lint && npx vitest run && npm run build` — zielone.
- [ ] **Step 2:** Pełne e2e: `npx playwright test --config=playwright.worktree.config.ts --reporter=line --grep-invert @chmura`, potem `--grep @chmura --workers=1`. Pełne podsumowanie; 0 failed (flake dopiero po samodzielnym powtórzeniu).
- [ ] **Step 3:** Zrzuty: „przed” z `redesign-nawigacja` (robi kontroler przed Task 1), „po” teraz. Dodatkowo tymczasowy spec robiący zrzut KAŻDEGO z 19 kalkulatorów przy 375 i 1366 px (przed i po) — porównaj blok wyniku: wartość większa, etykieta nad wartością, znaczniki pod spodem, nic ucięte, brak nachodzenia na pole obok (przy „Dobór obwodu” od `xl` wynik stoi w kolumnie obok pól).
- [ ] **Step 4:** Konsola: 0 błędów na 19 kalkulatorach przy 375 i 1366 px (tymczasowy spec).
- [ ] **Step 5:** Wariant CI: `wynik-glowny.spec.ts` z `letter-spacing: 0.3px` i przy 360 px — PASS.
- [ ] **Step 6:** Push i PR po decyzji użytkownika — baza `main`, jeśli #239/#266/#268 są scalone; inaczej `redesign-nawigacja`.
