# Redesign PR 2 — komponenty: Button, pola, Badge, Card, Alert

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeden komplet komponentów interfejsu ze wszystkimi stanami, zamiast trzech stylów przycisków, dwóch rodzajów znaczników i ręcznie malowanych ramek komunikatów — bez zmiany logiki, treści ani kolejności elementów.

**Architecture:** Komponenty w `src/components/ui/` (`button.tsx` rozszerzony; nowe `badge.tsx`, `alert.tsx`), wszystkie na tokenach z PR 1 (`src/lib/tokeny.ts`, klasy `copper`, `blueprint`, `danger`, `success`, `caution`, `surface-2`, `border-strong`, cienie `xs`/`pop`). Klasy CSS `.pe-btn-*`, `.pe-chip`, `.pe-tag-*` znikają z arkusza, a testy-strażnicy pilnują, żeby nie wróciły. `Field` i natywne `<select>` dostają wspólny wygląd przez klasy `pe-input`/`pe-select`.

**Tech Stack:** React 18, Tailwind 3, class-variance-authority, lucide-react, Vitest + @testing-library/react (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-redesign-ewolucja-design.md` — sekcja 4 „Komponenty”, sekcja 9 „Dostępność”, „Kontrola jakości”. Poprzedni plan: `docs/superpowers/plans/2026-11-04-redesign-pr1-tokeny.md` (PR #239).

## Global Constraints

- Gałąź `redesign-komponenty`, założona od `redesign-ewolucja` (PR #239). PR celuje w `main` dopiero po scaleniu #239; do tego czasu baza PR to `redesign-ewolucja`. Nigdy nie nazywać gałęzi `dependabot`.
- Praca w osobnym worktree `C:/Users/Marcin/Desktop/pomocnik-ts-redesign-2` — użytkownik pracuje równolegle w głównym checkoucie, a worktree `pomocnik-ts-redesign` obsługuje Auto-fix dla #239.
- e2e tylko przez nieśledzony `playwright.worktree.config.ts` (porty 5273/5290); przed uruchomieniem `netstat -ano | grep -E ":(5273|5290) .*LISTEN"` musi być pusty. Wynik czytać z PEŁNEGO podsumowania, nie z `tail -1`. Testy `@chmura` wymagają żywego Supabase — przy błędach sieciowych raportować osobno.
- Bez zmian w: logice obliczeń, kolorach i symbolach rysunku (Konva, `ElementGlyph*`, `PanelRender`), PDF-ach, treściach tekstów, nazwach dostępnych przycisków (e2e szukają po `getByRole(..., { name })`).
- Skala tekstu: tylko klasy Tailwinda `text-xs`…`text-3xl`, minimum 12 px; żadnych `text-[Npx]` (strażnik `src/lib/skalaTekstu.test.ts`). Zaokrąglenia 6/10/14 px, cienie `xs`/`pop`.
- Kontrast: tekst ≥ 4,5:1, grafika i pierścień fokusu ≥ 3:1.
- Cele dotykowe ≥ 24 px (`e2e/cele-dotykowe.spec.ts`); akcje główne poniżej `md` ≥ 44 px wysokości.
- Pola formularzy poniżej `md` mają 16 px (`e2e/kalkulatory-telefon.spec.ts`, `e2e/protokoly-telefon.spec.ts` to sprawdzają).
- Komentarze po polsku (dlaczego, nie co). Commit kończy się `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Rozstrzygnięcia względem specu

1. **Podpowiedź pola zostaje przyciskiem „i”** (`HintButton`), nie tekstem pod polem. Działa na dotyku, ma `aria-label` i `aria-expanded`; przeniesienie ~kilkudziesięciu podpowiedzi pod pola wydłużyłoby kalkulatory o ekran. Pole nie dostaje propsa błędu — żaden kalkulator dziś go nie potrzebuje (błędy walidacji idą przez `CalcResultView`).
2. **Rozmiary przycisku:** `sm` 32 px, `md` 40 px, `lg` 48 px, `icon` 32 × 32 px; wariant `primary` poniżej `md` ma `min-h-11` (44 px).
3. **Tekst komunikatu (`Alert`) = `text-sm` (14 px)** — sekcja 6 specu mówi o 14 px; „text-base” w sekcji 4 pochodzi ze starej, odrzuconej skali.

---

## Mapa plików

| Plik | Rola |
|---|---|
| Modify `src/components/ui/button.tsx` | warianty, rozmiary, stany, `loading` |
| Create `src/components/ui/button.test.tsx` | zachowanie `Button` |
| Create `src/components/ui/badge.tsx`, `badge.test.tsx` | znacznik w miejsce `pe-chip` + `pe-tag-*` |
| Create `src/components/ui/alert.tsx`, `alert.test.tsx` | komunikat info / success / caution / danger |
| Create `src/lib/klasyUsuniete.test.ts` | strażnik: `pe-btn-*`, `pe-chip`, `pe-tag-*` nie wracają |
| Modify `src/components/calculators/Field.tsx` + Create `Field.test.tsx` | jednostka w polu, 16 px na telefonie |
| Modify `src/components/calculators/Card.tsx` | karta: cień `xs`, tytuł `text-lg` |
| Modify `src/index.css` | `.pe-card`, `.pe-input`, nowa `.pe-select`; usunięcie `.pe-btn-*`, `.pe-chip`, `.pe-tag-*` |
| Modify 15 plików z `pe-btn-*` (Task 2), 9 z `pe-chip` (Task 4), 9 z `#C6433A14`/`#C6433A12` (Task 5), 9 z `<select>` (Task 3) | migracja |

---

### Task 1: Komponent `Button` — warianty, rozmiary, stany

**Files:**
- Modify: `src/components/ui/button.tsx`
- Create: `src/components/ui/button.test.tsx`

**Interfaces:**
- Produces: `Button` (props jak dotąd + `loading?: boolean`), `buttonVariants` (eksport dla `asChild`/linków). Warianty: `primary`, `secondary`, `subtle`, `danger`, `link`; aliasy `copper`→`primary`, `ghost`→`secondary`, `destructive`→`danger`. Rozmiary: `sm`, `md`, `lg`, `icon`. Domyślnie `variant="secondary"`, `size="md"`.

- [ ] **Step 1: Napisz failujący test**

`src/components/ui/button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("stare nazwy wariantów dają te same klasy co nowe (aliasy, nie osobne style)", () => {
    expect(buttonVariants({ variant: "copper" })).toBe(buttonVariants({ variant: "primary" }));
    expect(buttonVariants({ variant: "ghost" })).toBe(buttonVariants({ variant: "secondary" }));
    expect(buttonVariants({ variant: "destructive" })).toBe(buttonVariants({ variant: "danger" }));
  });

  it("rozmiary mają wysokości 32 / 40 / 48 px", () => {
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "md" })).toContain("h-10");
    expect(buttonVariants({ size: "lg" })).toContain("h-12");
    expect(buttonVariants({ size: "icon" })).toContain("h-8 w-8");
  });

  it("link nie dostaje wysokości ani wcięć przycisku, nawet z rozmiarem", () => {
    render(
      <Button variant="link" size="md">
        Regulamin
      </Button>
    );
    const klasy = screen.getByRole("button", { name: "Regulamin" }).className;
    expect(klasy).toContain("h-auto");
    expect(klasy).not.toContain("h-10");
  });

  it("akcja główna na telefonie ma co najmniej 44 px", () => {
    expect(buttonVariants({ variant: "primary" })).toContain("max-md:min-h-11");
  });

  it("każdy wariant ma widoczny pierścień fokusu z klawiatury", () => {
    for (const variant of ["primary", "secondary", "subtle", "danger", "link"] as const) {
      expect(buttonVariants({ variant })).toContain("focus-visible:ring-2");
    }
  });

  it("w trakcie ładowania: zablokowany, aria-busy, nazwa dostępna bez zmian", () => {
    const klik = vi.fn();
    render(
      <Button loading onClick={klik}>
        Zapisz
      </Button>
    );
    const przycisk = screen.getByRole("button", { name: "Zapisz" });
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute("aria-busy", "true");
    fireEvent.click(przycisk);
    expect(klik).not.toHaveBeenCalled();
  });

  it("bez ładowania nie ma aria-busy", () => {
    render(<Button>Zapisz</Button>);
    expect(screen.getByRole("button", { name: "Zapisz" })).not.toHaveAttribute("aria-busy");
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL (brak wariantu `primary`, brak `loading`).

- [ ] **Step 3: Implementacja**

`src/components/ui/button.tsx` (całość; zachowaj istniejący komentarz o `.pe-btn-*` w zaktualizowanej formie):

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Jeden przycisk dla całej aplikacji — od redesignu (PR 2) także w miejsce klas
 * `.pe-btn-copper` / `.pe-btn-ghost`, które zniknęły z arkusza.
 *
 * Stare nazwy wariantów (`copper`, `ghost`, `destructive`) zostają jako ALIASY tych
 * samych klas: ~50 wywołań w kodzie nie musi się zmieniać razem z tym plikiem.
 * Akcja główna (`primary`) ma na telefonie min. 44 px wysokości — kciuk w rękawicy
 * na budowie to inny cel niż kursor myszy.
 */
const WARIANTY = {
  primary: "bg-copper text-white hover:bg-copper-hover max-md:min-h-11",
  secondary: "bg-surface border border-border text-ink hover:border-blueprint hover:text-blueprint",
  subtle: "bg-transparent text-slate-600 hover:bg-paper hover:text-ink",
  danger: "bg-danger-grafika text-white hover:bg-danger",
  link: "bg-transparent text-blueprint underline-offset-2 hover:underline",
} as const;

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[.98] " +
    "disabled:pointer-events-none disabled:opacity-40 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint focus-visible:ring-offset-2 " +
    "motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        ...WARIANTY,
        copper: WARIANTY.primary,
        ghost: WARIANTY.secondary,
        destructive: WARIANTY.danger,
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-5 text-base",
        icon: "h-8 w-8",
      },
    },
    // Link nie ma wysokości ani wcięć przycisku. Jako wariant złożony, bo klasy rozmiaru
    // stoją w wyniku PO klasach wariantu i `tailwind-merge` zostawiłby `h-10 px-4`.
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Akcja w toku: przycisk zablokowany, kręciołek NA treści (szerokość się nie zmienia). */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span className="invisible inline-flex items-center gap-1.5">{children}</span>
            <Loader2 aria-hidden="true" className="absolute h-4 w-4 animate-spin motion-reduce:animate-none" />
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
```

Uwaga: przy `asChild` z `loading` Slot wymaga jednego dziecka — `loading` używać tylko bez `asChild` (dopisz to do komentarza propsa).

- [ ] **Step 4: Testy i typy**

Run: `npx vitest run src/components/ui/button.test.tsx && npm run typecheck && npm run lint`
Expected: PASS. Jeśli `typecheck` zgłasza użycia `size="..."` spoza nowego zestawu — popraw wywołanie, nie rozszerzaj wariantów.

- [ ] **Step 5: Układ po zmianie wysokości**

`sm` urósł z 28 na 32 px, `md` z 36 na 40 px, `icon` bez zmian (32). Run (port check najpierw):
`npx playwright test e2e/uklad-szerokosci.spec.ts e2e/cele-dotykowe.spec.ts e2e/tablet-cele-dotyku.spec.ts e2e/edytor-miesci-sie-w-oknie.spec.ts e2e/niskie-okno.spec.ts e2e/edytor-telefon-zwarty.spec.ts e2e/naglowek-telefon.spec.ts e2e/shell-ui.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: PASS. Każdą porażkę naprawiaj UKŁADEM (odstępy, zawijanie), z komentarzem „dlaczego” i osobnym commitem — nie zmniejszaj przycisków poniżej skali.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "Button: warianty primary/secondary/subtle/danger/link, rozmiary 32/40/48 px, stan ładowania

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migracja `.pe-btn-copper` / `.pe-btn-ghost` na `Button`

**Files:**
- Create: `src/lib/klasyUsuniete.test.ts`
- Modify: 15 plików (lista: `grep -rlE "pe-btn-(copper|ghost)" src --include=*.tsx`) — DesignTab (17), ProtocolsTab (7), ScaleCalibrationTool (4), CalculatorsTab (3), CostsTab (3), ProjectsModal, EditElementModal, PanelNarzedzia, OnboardingChecklist (po 2), KartaElementu, PoleWymiarowProstokata, RoomPanel, CoachMark, PanelTab, PdfPreview (po 1); `src/index.css`

**Interfaces:**
- Consumes: `Button` z Task 1 (`variant`, `size`, `loading`).
- Produces: brak klas `pe-btn-*` w `src/**/*.tsx` i `src/index.css`.

- [ ] **Step 1: Napisz failujący strażnik**

`src/lib/klasyUsuniete.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Klasy, które redesign zastąpił komponentami — nie mogą wrócić.
 *
 * Raz już `.pe-btn-copper` zniknęła z arkusza, a osiem surowych <button> dalej jej
 * używało i renderowało się jako goły tekst (patrz e2e/shell-ui.spec.ts). Od PR 2
 * przyciski idą WYŁĄCZNIE przez `Button`, znaczniki przez `Badge` — więc stara klasa
 * w kodzie to zawsze błąd: albo martwa, albo omija komponent.
 */
const USUNIETE: Record<string, RegExp> = {
  "pe-btn-*": /\bpe-btn-(copper|ghost)\b/,
};

function pliki(katalog: string, rozszerzenia: string[]): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) return pliki(p, rozszerzenia);
    return rozszerzenia.some((r) => p.endsWith(r)) ? [p] : [];
  });
}

describe("usunięte klasy interfejsu", () => {
  const zrodla = pliki("src", [".tsx", ".css"]).filter((p) => !p.endsWith("klasyUsuniete.test.ts"));

  it("przeszukuje faktyczne źródła (test nie przechodzi na pustym zbiorze)", () => {
    expect(zrodla.length).toBeGreaterThan(50);
  });

  for (const [nazwa, wzor] of Object.entries(USUNIETE)) {
    it(`nikt nie używa ${nazwa}`, () => {
      const trafienia = zrodla.filter((p) => wzor.test(readFileSync(p, "utf8")));
      expect(trafienia).toEqual([]);
    });
  }
});
```

(Plik jest celowo rozszerzalny — Task 4 dopisze `pe-chip` i `pe-tag-*` do `USUNIETE`.)

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/lib/klasyUsuniete.test.ts`
Expected: FAIL z listą 15 plików + `src/index.css`.

- [ ] **Step 3: Migracja — reguły**

Dla każdego `<button className="pe-btn-… …">`:

| było | jest |
|---|---|
| `pe-btn-copper` | `<Button variant="primary" …>` |
| `pe-btn-ghost` | `<Button variant="secondary" …>` |
| `px-2.5 py-1` / `py-1.5` + `text-xs` | `size="sm"` (usuń padding i rozmiar tekstu z `className`) |
| `px-3 py-2` / `px-3.5 py-2` + `text-sm` lub bez rozmiaru | `size="md"` |
| `flex items-center gap-1` / `gap-1.5` | usuń — `Button` ma `inline-flex items-center gap-1.5` |
| marginesy, `w-full`, `justify-*`, `shrink-0`, `ml-auto`, pozycjonowanie | zostają w `className` |
| `disabled:*`, `transition-*`, `rounded-*`, `font-medium` | usuń — są w komponencie |

Wszystkie pozostałe props (`onClick`, `disabled`, `title`, `aria-*`, `data-testid`, `type`, `ref`) przenoszą się 1:1. Dodaj import `import { Button } from "@/components/ui/button";` tam, gdzie go nie ma. Treść przycisku (tekst, ikony) bez zmian. Jeśli `<button>` ma `type` nieustawiony wewnątrz `<form>`, zachowaj obecne zachowanie (domyślny `submit`) — nie dopisuj `type`.

Gdy przycisk ma wysokość narzuconą przez otoczenie (np. pasek narzędzi z `h-7`), użyj `size="sm"` i zapisz w raporcie miejsce, w którym wysokość wzrosła z 28 na 32 px.

- [ ] **Step 4: Usuń klasy z arkusza**

W `src/index.css` usuń bloki `.pe-btn-ghost`, `.pe-btn-ghost:hover`, `.pe-btn-ghost:disabled`, `.pe-btn-copper`, `.pe-btn-copper:hover…`, `.pe-btn-copper:disabled` razem z komentarzem o „ośmiu surowych <button>” (historia zostaje w `klasyUsuniete.test.ts` i `shell-ui.spec.ts`).

- [ ] **Step 5: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS, w tym `klasyUsuniete.test.ts`.

Run (port check najpierw): `npx playwright test e2e/shell-ui.spec.ts e2e/uklad-szerokosci.spec.ts e2e/cele-dotykowe.spec.ts e2e/edytor-miesci-sie-w-oknie.spec.ts e2e/niskie-okno.spec.ts e2e/protokoly-uklad.spec.ts e2e/protokoly-telefon.spec.ts e2e/zakladki-protokolow.spec.ts e2e/project-lifecycle.spec.ts e2e/projekty-lokalne.spec.ts e2e/onboarding.spec.ts e2e/zestawienie.spec.ts e2e/kosztorys-podsumowanie.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: PASS; porażki układu naprawiać jak w Task 1 Step 5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/klasyUsuniete.test.ts src/index.css src/components
git commit -m "Przyciski: koniec z .pe-btn-*, wszystkie akcje przez komponent Button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pola formularzy — jednostka w polu, `pe-select`, 16 px na telefonie

**Files:**
- Modify: `src/components/calculators/Field.tsx`, `src/index.css` (`.pe-input`, nowa `.pe-select`)
- Create: `src/components/calculators/Field.test.tsx`
- Modify: pliki z natywnym `<select>` (lista: `grep -rl "<select" src --include=*.tsx`) — dopisanie `pe-select`

**Interfaces:**
- Consumes: tokeny (`border`, `blueprint`, `surface`).
- Produces: `Field` (props bez zmian); klasa `.pe-select` (natywny select z własną strzałką). Klasa `.pe-input` zostaje.

- [ ] **Step 1: Napisz failujący test**

`src/components/calculators/Field.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";

describe("Field", () => {
  it("pole ma nazwę z etykiety, a jednostkę w opisie (czytnik czyta „Moc odbiornika, W”)", () => {
    render(<Field label="Moc odbiornika" value={2000} onChange={vi.fn()} unit="W" />);
    const pole = screen.getByRole("spinbutton", { name: "Moc odbiornika" });
    expect(pole).toHaveAccessibleDescription("W");
  });

  it("jednostka stoi W ramce pola, nie obok niej", () => {
    render(<Field label="Długość" value={15} onChange={vi.fn()} unit="m" />);
    const pole = screen.getByRole("spinbutton", { name: "Długość" });
    const jednostka = screen.getByText("m");
    expect(pole.parentElement).toBe(jednostka.parentElement);
    expect(pole.className).toMatch(/\bpr-/);
  });

  it("pole bez jednostki nie ma opisu ani dodatkowego wcięcia", () => {
    render(<Field label="cos φ" value={1} onChange={vi.fn()} />);
    const pole = screen.getByRole("spinbutton", { name: "cos φ" });
    expect(pole).not.toHaveAttribute("aria-describedby");
  });

  it("na telefonie pole ma 16 px (iOS nie powiększa strony), od md 14 px", () => {
    render(<Field label="Długość" value={15} onChange={vi.fn()} unit="m" />);
    const klasy = screen.getByRole("spinbutton", { name: "Długość" }).className;
    expect(klasy).toContain("text-base");
    expect(klasy).toContain("md:text-sm");
  });

  it("lista wyboru dostaje wspólną klasę pe-select", () => {
    render(
      <Field
        label="Zasilanie"
        value="1"
        onChange={vi.fn()}
        options={[
          { value: "1", label: "1-fazowe" },
          { value: "3", label: "3-fazowe" },
        ]}
      />
    );
    expect(screen.getByRole("combobox", { name: "Zasilanie" }).className).toContain("pe-select");
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/components/calculators/Field.test.tsx`
Expected: FAIL (jednostka poza ramką, brak `aria-describedby`, `text-sm` zamiast `text-base md:text-sm`).

- [ ] **Step 3: Implementacja `Field`**

Zastąp blok `<div className="flex items-center gap-2"> … </div>` w `Field` (komentarz o `htmlFor/id` zostaje bez zmian):

```tsx
  const id = useId();
  const idJednostki = `${id}-jednostka`;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        <label htmlFor={id}>{label}</label>
        {hint && <HintButton hint={hint} />}
      </div>
      {options ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-input pe-select w-full text-base md:text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        // Jednostka W ramce pola: „15 m” czyta się jak jedna wartość, a wąski telefon nie
        // traci 56 px na osobną kolumnę z jednostką. Dla czytnika ekranu jednostka jest
        // OPISEM pola (aria-describedby), nie częścią nazwy — nazwa zostaje z etykiety.
        <div className="relative">
          <input
            id={id}
            type={type}
            step={step || "any"}
            value={value}
            onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
            aria-describedby={unit ? idJednostki : undefined}
            className={`pe-input pe-mono w-full text-base md:text-sm ${unit ? "pr-12" : ""}`}
          />
          {unit && (
            <span
              id={idJednostki}
              className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-slate-500"
            >
              {unit}
            </span>
          )}
        </div>
      )}
    </div>
  );
```

- [ ] **Step 4: Arkusz — `pe-input`, `pe-select`**

W `src/index.css` zastąp `.pe-input:focus { … }` i dopisz `.pe-select`:

```css
  /* Fokus z klawiatury i z dotyku ten sam: pełny pierścień w kolorze głównym (≥ 3:1
     na bieli — wymóg WCAG 2.2 dla wskaźnika fokusu), zamiast 20-procentowej poświaty. */
  .pe-input:focus-visible,
  .pe-input:focus {
    outline: 2px solid theme('colors.blueprint.DEFAULT');
    outline-offset: 1px;
    @apply border-blueprint;
  }
  /* Natywny <select> zostaje natywny (na telefonie systemowa lista jest najwygodniejsza),
     ale wygląda jak reszta pól: własna strzałka zamiast systemowej, która w każdej
     przeglądarce stoi gdzie indziej i ma inny kształt. */
  .pe-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%234F5D73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    padding-right: 2rem;
  }
```

- [ ] **Step 5: `pe-select` na pozostałych `<select>`**

Dla każdego natywnego `<select>` z listy (`grep -rn "<select" src --include=*.tsx`, poza `Field.tsx`): dopisz `pe-select` do `className`; jeśli nie ma `pe-input`, dopisz też `pe-input` i usuń ręczne `rounded-*`, `border*`, `bg-white`, `px-*` (są w `pe-input`). Rozmiar tekstu: `text-base md:text-sm` (zamień istniejące `text-xs`/`text-sm`). Wysokości narzucone (`h-8`) zostają.

- [ ] **Step 6: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run (port check najpierw): `npx playwright test e2e/kalkulatory-telefon.spec.ts e2e/protokoly-telefon.spec.ts e2e/calculators.spec.ts e2e/warunki-doboru.spec.ts e2e/dobor-telefon.spec.ts e2e/kosztorys-telefon.spec.ts e2e/rozdzielnica-telefon.spec.ts e2e/uklad-szerokosci.spec.ts e2e/audyt-p2-walidacja.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/calculators/Field.tsx src/components/calculators/Field.test.tsx src/index.css src/components
git commit -m "Pola: jednostka w ramce pola, wspólny wygląd list wyboru, 16 px na telefonie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Komponent `Badge` w miejsce `pe-chip` + `pe-tag-*`

**Files:**
- Create: `src/components/ui/badge.tsx`, `src/components/ui/badge.test.tsx`
- Modify: `src/lib/klasyUsuniete.test.ts` (dopisanie wzorców), `src/index.css` (usunięcie `.pe-chip`, `.pe-tag-*`)
- Modify: 9 plików z `pe-chip` — CalculatorsTab (53), KalkulatorImpedancji (7), KalkulatorKompensacji (4), KalkulatorPeN (4), KalkulatorSPD (3), App, CalcResultView, Card, ProtocolsTab (po 1)

**Interfaces:**
- Consumes: tokeny z PR 1.
- Produces: `Badge({ variant?: "neutral" | "info" | "success" | "caution" | "danger" | "accent", className?, children, ...HTMLAttributes<HTMLSpanElement> })`, eksport `badgeVariants`.

- [ ] **Step 1: Napisz failujący test**

`src/components/ui/badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "./badge";
import { KOLORY } from "@/lib/tokeny";
import { kontrast } from "@/test/kontrast";

describe("Badge", () => {
  it("renderuje treść jako <span> i przekazuje atrybuty", () => {
    render(
      <Badge variant="info" title="przekrój">
        2,5 mm²
      </Badge>
    );
    const z = screen.getByText("2,5 mm²");
    expect(z.tagName).toBe("SPAN");
    expect(z).toHaveAttribute("title", "przekrój");
  });

  it("domyślny wariant to neutralny", () => {
    expect(badgeVariants({})).toBe(badgeVariants({ variant: "neutral" }));
  });

  it("minimum 12 px i zaokrąglenie ze skali", () => {
    expect(badgeVariants({})).toContain("text-xs");
    expect(badgeVariants({})).toContain("rounded");
  });

  // Pary tekst/tło dokładnie takie, jakich używa komponent — odłożone z PR 1 (.pe-tag).
  it.each([
    ["info", KOLORY.blueprint, KOLORY.blueprintTlo],
    ["accent", KOLORY.caution, KOLORY.copperTlo],
    ["success", KOLORY.success, KOLORY.successTlo],
    ["caution", KOLORY.caution, KOLORY.cautionTlo],
    ["danger", KOLORY.danger, KOLORY.dangerTlo],
  ])("wariant %s ma kontrast ≥ 4,5:1", (_n, tekst, tlo) => {
    expect(kontrast(tekst, tlo)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/components/ui/badge.test.tsx`
Expected: FAIL — brak `./badge`.

- [ ] **Step 3: Implementacja**

`src/components/ui/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Znacznik: krótka wartość albo stan przy wyniku („2,5 mm²”, „czeka”, „gotowy”).
 *
 * Zastępuje parę klas `.pe-chip` + `.pe-tag-blue/-green/-copper` z arkusza. Warianty
 * nazwane ZNACZENIEM, nie kolorem: `info` (niebieski), `success` (zielony), `accent`
 * (miedziany — dawny `pe-tag-copper`, wyróżnienie bez oceny), `caution`, `danger`.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold leading-4",
  {
    variants: {
      variant: {
        neutral: "border-border bg-paper text-slate-600",
        info: "border-border-strong bg-blueprint-tlo text-blueprint",
        success: "border-border-strong bg-success-tlo text-success",
        accent: "border-border-strong bg-copper-tlo text-caution",
        caution: "border-border-strong bg-caution-tlo text-caution",
        danger: "border-border-strong bg-danger-tlo text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

- [ ] **Step 4: Rozszerz strażnika**

W `src/lib/klasyUsuniete.test.ts` dopisz do `USUNIETE`:

```ts
  "pe-chip": /\bpe-chip\b/,
  "pe-tag-*": /\bpe-tag-(blue|green|copper)\b/,
```

Run: `npx vitest run src/lib/klasyUsuniete.test.ts` — Expected: FAIL z listą 9 plików + `index.css`.

- [ ] **Step 5: Migracja**

| było | jest |
|---|---|
| `<span className="pe-chip pe-tag-blue">…</span>` | `<Badge variant="info">…</Badge>` |
| `<span className="pe-chip pe-tag-green">…</span>` | `<Badge variant="success">…</Badge>` |
| `<span className="pe-chip pe-tag-copper">…</span>` | `<Badge variant="accent">…</Badge>` |
| `<span className="pe-chip">…</span>` | `<Badge>…</Badge>` |
| `<span className="pe-chip bg-paper text-slate-600">` (CalcResultView) | `<Badge>` |
| `pe-chip` z dodatkowymi klasami układu (`ml-auto`, `shrink-0`, `mt-1`) | `<Badge variant=… className="ml-auto">` |
| `pe-chip` ze `style={{ background, color }}` | wariant najbliższy znaczeniem; jeśli kolor jest kolorem DANYCH (faza L1/L2/L3, typ obwodu) — zostaw `style`, a `Badge` bez wariantu dostaje go przez `style` |
| `pe-chip` na elemencie innym niż `<span>` (np. `<button>`) | zostaw element, zastąp klasy `className={badgeVariants({ variant })}` |

Dodaj importy `Badge`/`badgeVariants`. Treść znaczników bez zmian.

W `src/index.css` usuń `.pe-chip` i `.pe-tag-blue`, `.pe-tag-copper`, `.pe-tag-green`.

- [ ] **Step 6: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run (port check najpierw): `npx playwright test e2e/calculators.spec.ts e2e/kalkulatory-telefon.spec.ts e2e/kalkulatory-monitor.spec.ts e2e/kafle-etapow.spec.ts e2e/warunki-doboru.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/badge.test.tsx src/lib/klasyUsuniete.test.ts src/index.css src/components src/App.tsx
git commit -m "Znaczniki: komponent Badge w miejsce .pe-chip i .pe-tag-*

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `Card` i `Alert`

**Files:**
- Modify: `src/index.css` (`.pe-card`), `src/components/calculators/Card.tsx`
- Create: `src/components/ui/alert.tsx`, `src/components/ui/alert.test.tsx`
- Modify: `src/components/calculators/CalcResultView.tsx` (błędy walidacji) oraz miejsca z tłem błędu na sztywno: `grep -rnE "#C6433A1[0-9A-F]" src --include=*.tsx` (CalculatorsTab ×5, DesignTab ×2, PlanCheckPanel, PanelTab ×2, KompletDialog — stan na 2026-11-08, sprawdź grepem)

**Interfaces:**
- Consumes: tokeny, `cn`.
- Produces: `Alert({ variant?: "info" | "success" | "caution" | "danger", title?: React.ReactNode, children, className?, ...HTMLAttributes<HTMLDivElement> })`. `role="alert"` dla `danger`, `role="status"` dla pozostałych — chyba że wywołujący poda własne `role`.

- [ ] **Step 1: Napisz failujący test**

`src/components/ui/alert.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "./alert";

describe("Alert", () => {
  it("błąd ogłasza się od razu (role=alert)", () => {
    render(<Alert variant="danger">Moc musi być dodatnia</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Moc musi być dodatnia");
  });

  it("pozostałe warianty to status, nie przerywają czytnika", () => {
    render(<Alert variant="caution">Wynik graniczny</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Wynik graniczny");
  });

  it("własna rola i data-testid wywołującego wygrywają", () => {
    render(
      <Alert variant="danger" role="note" data-testid="bledy-bilansu">
        x
      </Alert>
    );
    expect(screen.getByTestId("bledy-bilansu")).toHaveAttribute("role", "note");
  });

  it("tytuł jest pogrubiony nad treścią, tekst 14 px, ikona ukryta przed czytnikiem", () => {
    const { container } = render(
      <Alert variant="info" title="Uwaga">
        Treść
      </Alert>
    );
    expect(screen.getByText("Uwaga").className).toContain("font-semibold");
    expect(container.firstElementChild!.className).toContain("text-sm");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `npx vitest run src/components/ui/alert.test.tsx` — Expected: FAIL, brak `./alert`.

- [ ] **Step 3: Implementacja**

`src/components/ui/alert.tsx`:

```tsx
import * as React from "react";
import { AlertTriangle, Check, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Komunikat w treści strony — błąd danych, ostrzeżenie, informacja.
 *
 * Tła NIEPRZEZROCZYSTE z tokenów (`*-tlo`), nie kolory z kanałem alfa: komunikat bywa
 * w przyklejonych panelach, a półprzezroczyste tło przepuszczało przewijaną treść.
 * Błąd ma `role="alert"` (czytnik przerywa i czyta od razu), reszta `role="status"`.
 */
const STYL: Record<NonNullable<AlertProps["variant"]>, { klasy: string; Ikona: LucideIcon }> = {
  info: { klasy: "bg-blueprint-tlo text-blueprint", Ikona: Info },
  success: { klasy: "bg-success-tlo text-success", Ikona: Check },
  caution: { klasy: "bg-caution-tlo text-caution", Ikona: TriangleAlert },
  danger: { klasy: "bg-danger-tlo text-danger", Ikona: AlertTriangle },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "info" | "success" | "caution" | "danger";
  title?: React.ReactNode;
}

export function Alert({ variant = "info", title, className, children, role, ...props }: AlertProps) {
  const { klasy, Ikona } = STYL[variant];
  return (
    <div
      role={role ?? (variant === "danger" ? "alert" : "status")}
      className={cn("flex gap-2 rounded-md p-3 text-sm leading-relaxed", klasy, className)}
      {...props}
    >
      <Ikona aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Karta**

W `src/index.css`: `.pe-card { @apply rounded-card border border-border bg-surface shadow-xs; }`.
W `src/components/calculators/Card.tsx`: tytuł `<h3 className="pe-display text-lg">` (było `text-base`), ikona `size={18}`, znacznik `tag` przez `<Badge variant="info">` (jeśli Task 4 już go nie przepiął).

- [ ] **Step 5: Migracja komunikatów**

- `CalcResultView.tsx`: każdy błąd walidacji (`wynik.bledy.map`) → `<Alert variant="danger" key={b.code}>{b.message}</Alert>`; kontener `mt-2 space-y-1.5` zostaje.
- Każde miejsce z `style={{ background: "#C6433A1x", color: … }}` → `<Alert variant="danger" …>` z zachowaniem `data-testid`, `role` i treści. Jeśli element ma własną ikonę w środku — usuń ją (Alert ma swoją). Jeśli to nie jest komunikat, tylko np. podświetlony wiersz tabeli — zamień wyłącznie `style` na klasy `bg-danger-tlo text-danger` i opisz w raporcie.

Po migracji: `grep -rnE "#C6433A1[0-9A-F]" src --include=*.tsx` — Expected: brak wyników.

- [ ] **Step 6: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run (port check najpierw): `npx playwright test e2e/calculators.spec.ts e2e/audyt-p2-walidacja.spec.ts e2e/plan-check.spec.ts e2e/komplet.spec.ts e2e/rozdzielnica-uklad.spec.ts e2e/instalacja-uwagi.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/alert.tsx src/components/ui/alert.test.tsx src/index.css src/components
git commit -m "Komunikaty przez komponent Alert, karty z cieniem i tytułem 18 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kontrola jakości

**Files:** brak zmian w kodzie, chyba że kontrola coś znajdzie (wtedy osobny commit z opisem).

- [ ] **Step 1:** `npm run typecheck && npm run lint && npx vitest run && npm run build` — wszystko zielone.
- [ ] **Step 2:** Pełne e2e: `npx playwright test --config=playwright.worktree.config.ts --reporter=line` (oba projekty). Przeczytaj CAŁE podsumowanie; 0 failed poza `@chmura` z przyczyn sieciowych.
- [ ] **Step 3:** Zrzuty: `ZRZUTY=<katalog>/przed` uruchomione na `redesign-ewolucja` (przed Task 1) i `ZRZUTY=<katalog>/po` teraz, `e2e/uklad-szerokosci.spec.ts`. Porównaj pary 390/1366/1920 px dla: start, instalacja, rozdzielnica, kosztorys, dobor-obwodu, protokoly. Szukaj: przycisków o innej wysokości wybijających się z rzędu, uciętych znaczników, jednostek nachodzących na wartości w polach.
- [ ] **Step 4:** Konsola: tymczasowy spec (niecommitowany) na 8 widokach przy 1366 px zbiera `console.error` i `pageerror` — oczekiwane 0.
- [ ] **Step 5:** Klawiatura: na „Dobór obwodu” przejdź Tabem przez przełącznik trybu, pola i przyciski — każdy element z fokusem ma widoczny pierścień (zrzut 2–3 stanów do raportu).
- [ ] **Step 6:** Push i PR — dopiero po decyzji użytkownika (baza `main`, jeśli #239 jest scalony; inaczej `redesign-ewolucja`). Opis: zmiany per komponent, widoczne różnice (wyższe przyciski 32/40 px, jednostki w polach, znaczniki z ramką), wyniki kontroli, stopka `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
