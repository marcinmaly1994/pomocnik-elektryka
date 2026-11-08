# Redesign PR 3 — nawigacja i telefon

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nawigacja, która na telefonie nie ucina niczego i trzyma najważniejsze akcje pod kciukiem: menu zamiast przewijanych zakładek, wszystkie cztery etapy widoczne naraz, stały pasek „Cofnij / Dalej” zamiast pływających pigułek — plus domknięcie rzeczy odłożonych z PR 2.

**Architecture:** Nowe komponenty `src/components/nawigacja/PasekKroku.tsx` (dolny pasek kroku) i `src/components/nawigacja/MenuTelefonu.tsx` (arkusz z prawej, Radix Dialog). `App.tsx` traci pigułki (`klasySchowanejPigulki`, `useChowanieNaPrzewijaniu`, rezerwę stopki) i przewijany pasek zakładek poniżej `md`. Kafle etapów dostają wariant zwarty poniżej `sm`. Globalny pierścień fokusu w warstwie `base`.

**Tech Stack:** React 18, Tailwind 3, Radix Dialog, lucide-react, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-redesign-ewolucja-design.md` — sekcja 5 „Nawigacja i telefon”, sekcja 9 „Dostępność”, „Kontrola jakości”. Poprzednie plany: `2026-11-04-redesign-pr1-tokeny.md` (#239), `2026-11-08-redesign-pr2-komponenty.md` (#266) — tam lista rzeczy odłożonych do PR 3.

## Global Constraints

- Gałąź `redesign-nawigacja` od `redesign-komponenty` (#266, który stoi na #239). PR celuje w `redesign-komponenty`, dopóki #266 nie trafi do `main`. Nigdy nie nazywać gałęzi `dependabot`.
- Worktree `C:/Users/Marcin/Desktop/pomocnik-ts-redesign-3`. Worktree `pomocnik-ts-redesign` i `-2` obsługują Auto-fix #239 i #266 — nie dotykać. Główny checkout użytkownika — nie dotykać.
- e2e tylko przez nieśledzony `playwright.worktree.config.ts` (porty 5273/5290), port check przed każdym uruchomieniem, pełne podsumowanie (nie `tail -1`), `--grep-invert @chmura` dla zestawów lokalnych. Układ ciasny na Linuksie w CI: przy każdym teście szerokości sprawdź też wariant −15 px (patrz pamięć „CI Linux: ciasne układy”).
- NAZWY DOSTĘPNE bez zmian: „Kalkulatory”, „Protokoły pomiarowe”, „Dokumentacja”, „Pomoc”, „Nowy projekt”, „Zaloguj się”, kafle „Instalacja” / „Rozdzielnica” / „Schemat” / „Kosztorys” (exact), „Cofnij: X”, „Dalej: Y”. Na nich stoją dziesiątki testów e2e i czytniki ekranu.
- Bez zmian w logice obliczeń, rysunku, PDF-ach, treściach tekstów. Kalkulatory i Protokoły zostają narzędziami OBOK przepływu 01→04 (decyzja produktowa, pamięć „Kalkulatory i Protokoły niezależne od projektu”).
- Tokeny, skala tekstu (min. `text-xs`), `Button`, `Badge`, `Alert` z PR 1–2; żadnych `text-[Npx]`, żadnych nowych hex w UI.
- Cele dotykowe ≥ 24 px, akcje główne na telefonie ≥ 44 px, pola na telefonie ≥ 16 px.
- Komentarze po polsku (dlaczego, nie co); commit kończy się `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Rozstrzygnięcia względem specu

1. **Menu telefonu poniżej `md` (768 px)**, nie `sm` — spec mówi „< md”; między 640 a 767 px nagłówek dziś zawija się na 2–3 rzędy.
2. **Etapy na telefonie: cztery równe kolumny (numer + tytuł)**, bez plakietki i strzałek, poniżej `sm` (640 px); od `sm` do `md` kafle jak dziś bez podtytułu. Tytuł może się wizualnie skrócić wielokropkiem przy 360 px („Rozdzieln…”) — tekst w DOM jest pełny, więc nazwa dostępna się nie zmienia. Siatka 2 × 2 kosztowałaby ~36 px wysokości, której pilnuje `edytor-telefon-zwarty`.
3. **Pasek kroku nie chowa się przy przewijaniu** (pigułki się chowały): jest w przepływie (`sticky`), nie leży na treści w rogu okna, a stała pozycja jest czytelniejsza w rękawicy.
4. **Odstęp strony na telefonie `p-4`** (było `p-6`) — 16 px więcej na treść przy 360 px.

---

## Mapa plików

| Plik | Rola |
|---|---|
| Create `src/components/nawigacja/PasekKroku.tsx` + `.test.tsx` | dolny pasek „Cofnij / Dalej” |
| Create `src/components/nawigacja/MenuTelefonu.tsx` + `.test.tsx` | arkusz menu poniżej `md` |
| Create `e2e/pasek-kroku.spec.ts` | pasek kroku na telefonie i monitorze |
| Delete `e2e/pigulki-przewijanie.spec.ts`, `src/hooks/useChowanieNaPrzewijaniu.ts` + `.test.ts` | pigułki znikają |
| Modify `src/App.tsx` | nagłówek, kafle, pigułki → pasek, stopka |
| Modify `src/components/ui/dialog.tsx` | wariant arkusza, nazwa przycisku zamknięcia |
| Modify `e2e/_flow.ts` | `przejdzDoNarzedzia(page, nazwa)` |
| Modify `e2e/naglowek-telefon.spec.ts` + 7 plików klikających zakładki na telefonie | menu zamiast paska zakładek |
| Modify `src/index.css` | globalny `:focus-visible` |
| Modify 12 pól bez `.pe-input` (lista w Task 1) | 16 px na telefonie |
| Modify ramki ostrzeżeń/informacji (lista w Task 2) | `Alert` |
| Modify `src/components/onboarding/CoPowstanie.tsx` | siatka 2 × 2 na telefonie |

---

### Task 1: Fokus i pola — domknięcie dostępności z PR 2

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/design/PoleWymiarowProstokata.tsx` (~70, ~81), `src/components/design/DesignTab.tsx` (~2478, ~2609, ~2771, ~2809), `src/components/design/FloorBar.tsx` (~144, ~183, ~207), `src/App.tsx` (~383, nazwa projektu), `src/components/.../HistoriaWersji.tsx` (~92), `src/components/protocols/ProtocolsTab.tsx` (~102, textarea), `src/components/ui/UdostepnijLinkiem.tsx` (~94) — numery linii ze stanu 2026-11-08; znajdź grepem `<input` / `<textarea` bez `pe-input`
- Create: `e2e/fokus-widoczny.spec.ts`
- Modify: `e2e/pola-16px-telefon.spec.ts`

**Interfaces:**
- Produces: każdy element z fokusem z klawiatury ma ten sam pierścień (2 px `blueprint`, offset 2 px); każde pole tekstowe w aplikacji ma `.pe-input` albo jawnie `text-base md:text-sm`.

- [ ] **Step 1: Failujący e2e fokusu**

`e2e/fokus-widoczny.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

/**
 * Fokus z klawiatury widać na KAŻDYM elemencie, i wygląda wszędzie tak samo.
 *
 * Po PR 2 przyciski i pola miały pierścień z tokenów, ale przełączniki trybu,
 * przycisk „i”, `<summary>` i kafle etapów zostały przy domyślnym obrysie
 * przeglądarki — innym w Chrome, innym w Firefoksie, na ciemnym tle niewidocznym.
 */
test("Tab po kalkulatorze: każdy zatrzymany element ma pierścień w kolorze głównym", async ({ page }) => {
  await page.goto("/kalkulatory/obwod?tryb=przekroj");
  await expect(page.getByRole("heading", { name: "Dobór obwodu" })).toBeVisible();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const bezPierscienia: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const stan = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const opis = `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}”`;
      const obrys = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && s.outlineColor === "rgb(45, 90, 140)";
      const pierscien = /rgb\(45, 90, 140\)/.test(s.boxShadow);
      return { opis, ok: obrys || pierscien };
    });
    if (stan && !stan.ok) bezPierscienia.push(stan.opis);
  }
  expect(bezPierscienia).toEqual([]);
});
```

Run (port check najpierw): `npx playwright test e2e/fokus-widoczny.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line`
Expected: FAIL z listą (m.in. przełączniki trybu, przycisk „i”, `summary`).

- [ ] **Step 2: Globalny pierścień**

W `src/index.css`, w nowym bloku `@layer base` (po `@tailwind base`):

```css
@layer base {
  /* Jeden wskaźnik fokusu dla całej aplikacji (WCAG 2.4.7 / 2.4.11): 2 px w kolorze
     głównym, 3:1 i więcej na każdym tle interfejsu. Tylko z klawiatury
     (`:focus-visible`) — klik myszą nie zostawia obwódki. Komponenty z własnym
     pierścieniem (Button: `ring-2`) nadpisują go `outline-none`, więc nic się nie dubluje. */
  :focus-visible {
    outline: 2px solid theme('colors.blueprint.DEFAULT');
    outline-offset: 2px;
  }
}
```

Usuń w komponentach ręczne `focus:outline-none` / `outline-none` bez zastępczego pierścienia (grep: `outline-none` w `src/**/*.tsx`, poza `Button` i elementami z `focus-visible:ring`).

Run: test z Step 1 — Expected: PASS.

- [ ] **Step 3: Pola bez `.pe-input`**

Dla każdego pola z listy: jeśli wygląda jak pole formularza (ramka, tło) — dodaj `pe-input` i usuń dublujące klasy (`rounded-*`, `border*`, `bg-white`, `px-*`, `py-*`, rozmiar tekstu); jeśli to pole „w tekście” (edycja nazwy projektu w miejscu, pole w pasku kondygnacji o stałej wysokości) — zostaw wygląd, dopisz `text-base md:text-sm` (albo `text-base md:text-xs`, jeśli było `text-xs`). Pole tylko do odczytu (link udostępniania) — to samo.

Rozszerz `e2e/pola-16px-telefon.spec.ts` o: edytor przykładu „mieszkanie” z otwartym narzędziem ściany (pole grubości) i paskiem kondygnacji, oraz okno historii wersji, jeśli da się je otworzyć bez konta (inaczej pomiń i opisz w raporcie).

- [ ] **Step 4: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/fokus-widoczny.spec.ts e2e/pola-16px-telefon.spec.ts e2e/edytor-telefon-zwarty.spec.ts e2e/floors.spec.ts e2e/wymiary-prostokata.spec.ts e2e/wall-drawing.spec.ts e2e/openings.spec.ts e2e/dostepnosc-struktura.spec.ts e2e/cele-dotykowe.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src e2e/fokus-widoczny.spec.ts e2e/pola-16px-telefon.spec.ts
git commit -m "Fokus wszędzie ten sam, pola w edytorze i oknach 16 px na telefonie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pozostałe ramki komunikatów przez `Alert`

**Files:**
- Modify: miejsca z ręcznie kolorowanym tłem ostrzeżenia/informacji: `grep -rnE "#C1793F1[0-9A-Fa-f]|#2D5A8C1[0-9A-Fa-f]|#3B8C631[0-9A-Fa-f]" src --include=*.tsx` (stan 2026-11-08: ProjectsModal ~109, CostsTab ~559, PdfPreview ~171, ProtocolsTab ~449, DesignTab ~3092/~3231/~3253/~3270, KompletDialog ~129, PasekPrzykladu ~31) — z wyłączeniem rysunku (`DesignCanvas`, `ElementGlyph*`, `PanelRender`, `SchemaTab` rysunek)
- Modify: `src/components/onboarding/PasekPrzykladu.tsx`

**Interfaces:**
- Consumes: `Alert` (`@/components/ui/alert`: `variant` info/success/caution/danger, `title?`, `role` wywołującego wygrywa), tokeny `*-tlo`.

- [ ] **Step 1: Strażnik**

W `src/lib/klasyUsuniete.test.ts` dodaj osobny test (nie wpis w `USUNIETE` — to wartości, nie klasy):

```ts
  it("tła komunikatów biorą kolor z tokenów, nie z hex z kanałem alfa", () => {
    const RYSUNEK = /DesignCanvas|ElementGlyph|PanelRender|SchemaTab|pdf/i;
    const wzor = /#(C1793F|2D5A8C|3B8C63|C6433A)1[0-9A-Fa-f]\b/;
    const trafienia = zrodla.filter((p) => !RYSUNEK.test(p) && wzor.test(readFileSync(p, "utf8")));
    expect(trafienia).toEqual([]);
  });
```

Run: `npx vitest run src/lib/klasyUsuniete.test.ts` — Expected: FAIL z listą plików.

- [ ] **Step 2: Migracja**

| miejsce | jest |
|---|---|
| ramka z tekstem ostrzeżenia (miedziane tło) | `<Alert variant="caution">` |
| ramka informacyjna (niebieskie tło), w tym `PasekPrzykladu` | `<Alert variant="info">` — `PasekPrzykladu` zachowuje `role="status"`, układ tekstu w kolumnie (`min-w-[12rem] flex-1 basis-0`) i przycisk „Zacznij własny projekt” |
| ramka sukcesu | `<Alert variant="success">` |
| komunikat, który zmienia się w trakcie pisania (liczony na żywo) | dodaj `role="note"` |
| element, który NIE jest komunikatem (wiersz, plakietka, podświetlenie) | tylko klasy `bg-*-tlo text-*` |

Treść, `data-testid`, kolejność i przyciski w środku bez zmian. Własna ikona w środku → usuń (Alert ma swoją).

- [ ] **Step 3: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/projekt-przykladowy.spec.ts e2e/przyklad-dom.spec.ts e2e/tablet-uklad.spec.ts e2e/komplet.spec.ts e2e/kosztorys-podsumowanie.spec.ts e2e/protokoly-uklad.spec.ts e2e/projekty-lokalne.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura` — plus wariant −15 px dla `tablet-uklad` (kopia tymczasowa z `width: 753`), bo pasek przykładu stoi nad rzutem.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "Ostrzeżenia i informacje przez Alert — koniec z tłami z hex w interfejsie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dolny pasek kroku zamiast pigułek

**Files:**
- Create: `src/components/nawigacja/PasekKroku.tsx`, `src/components/nawigacja/PasekKroku.test.tsx`, `e2e/pasek-kroku.spec.ts`
- Modify: `src/App.tsx` (usunięcie pigułek ~1060–1135, `klasySchowanejPigulki` ~345, `pigulkiSchowane` ~470, import `NAWIGACJA_ODSTEP_PX`, rezerwa stopki `rezerwaNaNawigacje` ~1345/~1388–1411)
- Delete: `e2e/pigulki-przewijanie.spec.ts`, `src/hooks/useChowanieNaPrzewijaniu.ts`, `src/hooks/useChowanieNaPrzewijaniu.test.ts` (jeśli nic innego ich nie używa — sprawdź grepem), `NAWIGACJA_ODSTEP_PX` z `src/lib/design.ts` (jeśli nieużywane)

**Interfaces:**
- Produces: `PasekKroku({ poprzedni?: { id: AppTab; tytul: string }, nastepny?: { id: AppTab; tytul: string }, onPick: (id: AppTab) => void, onPrefetch?: (id: AppTab) => void })`. Renderuje `<nav aria-label="Kroki projektu">` z przyciskami „Cofnij: {tytul}” i „Dalej: {tytul}”; nic, gdy oba puste.

- [ ] **Step 1: Failujący test komponentu**

`src/components/nawigacja/PasekKroku.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasekKroku } from "./PasekKroku";

describe("PasekKroku", () => {
  it("prowadzi wstecz i dalej, nazwy jak dawne pigułki", () => {
    const onPick = vi.fn();
    render(
      <PasekKroku
        poprzedni={{ id: "projekt", tytul: "Instalacja" }}
        nastepny={{ id: "schemat", tytul: "Schemat" }}
        onPick={onPick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cofnij: Instalacja" }));
    fireEvent.click(screen.getByRole("button", { name: "Dalej: Schemat" }));
    expect(onPick.mock.calls).toEqual([["projekt"], ["schemat"]]);
  });

  it("jest nawigacją z nazwą (landmark dla czytnika)", () => {
    render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Kroki projektu" })).toBeInTheDocument();
  });

  it("na ostatnim kroku jest tylko „Cofnij”, „Dalej” to akcja główna", () => {
    const { rerender } = render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Dalej:/ })).toBeNull();
    rerender(<PasekKroku nastepny={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Dalej: Schemat" }).className).toContain("bg-copper");
  });

  it("pobiera kod następnej zakładki zawczasu — po najechaniu i po fokusie", () => {
    const onPrefetch = vi.fn();
    render(<PasekKroku nastepny={{ id: "kosztorys", tytul: "Kosztorys" }} onPick={vi.fn()} onPrefetch={onPrefetch} />);
    const dalej = screen.getByRole("button", { name: "Dalej: Kosztorys" });
    fireEvent.pointerEnter(dalej);
    fireEvent.focus(dalej);
    expect(onPrefetch).toHaveBeenCalledWith("kosztorys");
  });

  it("bez kroków nie renderuje niczego", () => {
    const { container } = render(<PasekKroku onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `npx vitest run src/components/nawigacja/PasekKroku.test.tsx` — Expected: FAIL (brak modułu).

- [ ] **Step 2: Komponent**

`src/components/nawigacja/PasekKroku.tsx`:

```tsx
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppTab } from "@/lib/routing";

type Krok = { id: AppTab; tytul: string };

/**
 * Dolny pasek kroku: „← Cofnij: X” i „Dalej: Y →” na Rozdzielnicy, Schemacie i Kosztorysie.
 *
 * Zastępuje pływające pigułki z rogów okna. Te leżały NA treści (szyna DIN, wiersz
 * kosztorysu, zastrzeżenie w stopce), chowały się przy przewijaniu i nie istniały
 * poniżej 768 px — czyli tam, gdzie kciuk najbardziej ich potrzebuje. Pasek stoi
 * w przepływie strony i przykleja się do dołu (`sticky`), więc niczego nie zasłania
 * na stałe, a na końcu strony ląduje NAD stopką. Ten sam wzorzec co pasek stanu
 * Instalacji z „Dalej: Rozdzielnica”.
 *
 * Nazwy przycisków są dokładnie tymi z pigułek — stoją na nich testy e2e.
 */
export function PasekKroku({
  poprzedni,
  nastepny,
  onPick,
  onPrefetch,
}: {
  poprzedni?: Krok;
  nastepny?: Krok;
  onPick: (id: AppTab) => void;
  onPrefetch?: (id: AppTab) => void;
}) {
  if (!poprzedni && !nastepny) return null;
  const pobierz = (id: AppTab) => () => onPrefetch?.(id);
  return (
    <nav
      aria-label="Kroki projektu"
      className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 shadow-pop backdrop-blur-sm sm:-mx-6 sm:px-6 md:mx-0 md:rounded-card md:border md:px-4"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {poprzedni ? (
        <Button
          variant="secondary"
          className="max-md:min-h-11"
          onClick={() => onPick(poprzedni.id)}
          onPointerEnter={pobierz(poprzedni.id)}
          onFocus={pobierz(poprzedni.id)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Cofnij: {poprzedni.tytul}
        </Button>
      ) : (
        <span />
      )}
      {nastepny && (
        <Button
          variant="primary"
          onClick={() => onPick(nastepny.id)}
          onPointerEnter={pobierz(nastepny.id)}
          onFocus={pobierz(nastepny.id)}
        >
          Dalej: {nastepny.tytul}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
```

Uwaga do `-mx-4 sm:-mx-6`: pasek na telefonie sięga krawędzi ekranu (odejmuje odstęp strony z Task 5 `p-4 sm:p-6`). Jeśli Task 5 jeszcze nie zmienił odstępu (`p-6` wszędzie), użyj `-mx-6` — i zostaw komentarz, że Task 5 to wyrówna.

Run: `npx vitest run src/components/nawigacja/PasekKroku.test.tsx` — Expected: PASS.

- [ ] **Step 3: Podłączenie w `App.tsx`**

- Usuń oba bloki pigułek (`fixed left-5` / `fixed right-5`), funkcję `klasySchowanejPigulki`, `const pigulkiSchowane = useChowanieNaPrzewijaniu(tab)`, import `useChowanieNaPrzewijaniu` i `NAWIGACJA_ODSTEP_PX`.
- W `<main>`, ZA `</ErrorBoundary>`:

```tsx
      {/* Pasek kroku tylko na 02–04: na Instalacji tę rolę ma pasek stanu pod rysunkiem
          (z progiem pustego projektu), a Kalkulatory i Protokoły nie są krokami. */}
      {(() => {
        const idx = KOLEJNOSC_KROKOW.findIndex((k) => k.id === tab);
        if (idx < 1) return null;
        return (
          <PasekKroku
            poprzedni={KOLEJNOSC_KROKOW[idx - 1]}
            nastepny={KOLEJNOSC_KROKOW[idx + 1]}
            onPick={setTab}
            onPrefetch={pobierzZawczasu}
          />
        );
      })()}
```

- Przenieś do komponentu zachowanie pigułek, które warto zachować: jeśli stary blok „Dalej” miał warunek (np. komentarz o progu pustego rzutu — „Świadomie NIE gasimy pigułki…”), zachowaj ten sam warunek przy `nastepny`. Przeczytaj oba stare bloki w całości przed usunięciem i opisz w raporcie każdy przeniesiony warunek.
- `SiteFooter`: usuń prop `rezerwaNaNawigacje` i klasę `md:pb-16` (stopka nie musi już robić miejsca pigułkom).
- Usuń `useChowanieNaPrzewijaniu.ts` + test i `NAWIGACJA_ODSTEP_PX`, jeśli grep nie znajdzie innych użyć.

- [ ] **Step 4: e2e**

Usuń `e2e/pigulki-przewijanie.spec.ts`. Utwórz `e2e/pasek-kroku.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Pasek „Cofnij / Dalej” na krokach 02–04 — na telefonie i na monitorze.
 *
 * Zastąpił pływające pigułki: te nie istniały poniżej 768 px, a na monitorze leżały
 * na treści. Pasek ma być w kadrze przy każdym przewinięciu, na końcu strony stać
 * NAD stopką, a jego przyciski — na telefonie co najmniej 44 px wysokości.
 */
async function naKroku(page: Page, kafel: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: kafel, exact: true }).click();
}

for (const okno of [
  { width: 360, height: 780 },
  { width: 1440, height: 900 },
]) {
  test.describe(`${okno.width} px`, () => {
    test.use({ viewport: okno });

    test("Rozdzielnica: oba kierunki, pasek w kadrze po przewinięciu do połowy", async ({ page }) => {
      await naKroku(page, "Rozdzielnica");
      const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
      await expect(pasek.getByRole("button", { name: "Cofnij: Instalacja" })).toBeVisible();
      await expect(pasek.getByRole("button", { name: "Dalej: Schemat" })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      const r = (await pasek.boundingBox())!;
      expect(r.y + r.height).toBeLessThanOrEqual(okno.height + 1);
      expect(r.y).toBeGreaterThan(okno.height / 2);
    });

    test("Kosztorys: tylko „Cofnij”, na końcu strony pasek stoi nad stopką", async ({ page }) => {
      await naKroku(page, "Kosztorys");
      const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
      await expect(pasek.getByRole("button", { name: "Cofnij: Schemat" })).toBeVisible();
      await expect(pasek.getByRole("button", { name: /^Dalej:/ })).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const p = (await pasek.boundingBox())!;
      const stopka = (await page.locator("footer").boundingBox())!;
      expect(p.y + p.height).toBeLessThanOrEqual(stopka.y + 1);
    });

    test("klik prowadzi do sąsiedniego kroku", async ({ page }) => {
      await naKroku(page, "Schemat");
      await page.getByRole("navigation", { name: "Kroki projektu" }).getByRole("button", { name: "Dalej: Kosztorys" }).click();
      await expect(page.getByRole("heading", { name: /Kosztorys instalacji elektrycznej/ })).toBeVisible();
    });
  });
}

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test("przyciski paska mają co najmniej 44 px wysokości", async ({ page }) => {
    await naKroku(page, "Rozdzielnica");
    for (const nazwa of ["Cofnij: Instalacja", "Dalej: Schemat"]) {
      const b = (await page.getByRole("button", { name: nazwa }).boundingBox())!;
      expect(b.height, nazwa).toBeGreaterThanOrEqual(44);
    }
  });
});
```

- [ ] **Step 5: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/pasek-kroku.spec.ts e2e/stopka-zastrzezenie.spec.ts e2e/panel-undo-i-nawigacja.spec.ts e2e/projekt-przykladowy.spec.ts e2e/edytor-miesci-sie-w-oknie.spec.ts e2e/prefetch-zakladek.spec.ts e2e/rozdzielnica-telefon.spec.ts e2e/schemat-telefon.spec.ts e2e/kosztorys-telefon.spec.ts e2e/cele-dotykowe.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS. Porażka typu „element intercepts pointer events” (pasek zasłania klikany element na dole ekranu) → popraw układ (np. `scroll-padding-bottom` na `html` równy wysokości paska, z komentarzem), nie test.

- [ ] **Step 6: Commit**

```bash
git add src e2e/pasek-kroku.spec.ts
git rm e2e/pigulki-przewijanie.spec.ts
git commit -m "Dolny pasek „Cofnij / Dalej” na krokach 02–04 zamiast pływających pigułek

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Jeśli usunięto hook i stałą — `git rm` także ich plików.)

---

### Task 4: Nagłówek na telefonie — menu zamiast przewijanych zakładek

**Files:**
- Create: `src/components/nawigacja/MenuTelefonu.tsx`, `src/components/nawigacja/MenuTelefonu.test.tsx`
- Modify: `src/components/ui/dialog.tsx` (prop `wariant?: "okno" | "arkusz"`, `aria-label="Zamknij"` na przycisku zamknięcia)
- Modify: `src/App.tsx` (nagłówek ~664–857)
- Modify: `e2e/_flow.ts`, `e2e/naglowek-telefon.spec.ts`, oraz pliki klikające zakładki nagłówka na telefonie: `calculators.spec.ts`, `kalkulatory-telefon.spec.ts`, `dostepnosc-struktura.spec.ts`, `tablet-cele-dotyku.spec.ts`, `protokoly-telefon.spec.ts`, `pola-16px-telefon.spec.ts`, `kopia-zapasowa.spec.ts` (lista z 2026-11-08 — sprawdź grepem po zmianie: każdy test < 768 px klikający „Kalkulatory”, „Protokoły pomiarowe”, „Dokumentacja”, „Pomoc”, „Nowy projekt”)

**Interfaces:**
- Produces: `MenuTelefonu({ children })` — przycisk „Menu” (ikona `Menu`, `aria-label="Menu"`, 44 × 44 px) otwierający arkusz z prawej z `children` w kolumnie; zamyka się po kliknięciu dowolnego przycisku w środku (`onClickCapture` na kontenerze). `DialogContent` z `wariant="arkusz"`: `fixed inset-y-0 right-0 w-[min(20rem,85vw)] rounded-l-xl` zamiast wyśrodkowanego okna.
- Produces (e2e): `przejdzDoNarzedzia(page, nazwa: "Kalkulatory" | "Protokoły pomiarowe" | "Dokumentacja" | "Pomoc" | "Nowy projekt")` — gdy widać przycisk „Menu”, otwiera go i klika pozycję; inaczej klika przycisk w nagłówku.

- [ ] **Step 1: Failujące testy komponentu**

`src/components/nawigacja/MenuTelefonu.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuTelefonu } from "./MenuTelefonu";

describe("MenuTelefonu", () => {
  it("przycisk „Menu” otwiera arkusz z pozycjami, wybór pozycji go zamyka", async () => {
    const klik = vi.fn();
    render(
      <MenuTelefonu>
        <button onClick={klik}>Kalkulatory</button>
      </MenuTelefonu>
    );
    expect(screen.queryByRole("button", { name: "Kalkulatory" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("dialog", { name: "Menu" });
    fireEvent.click(screen.getByRole("button", { name: "Kalkulatory" }));
    expect(klik).toHaveBeenCalled();
    // Radix zamyka okno przez stan i animację wyjścia — sprawdzamy po ustaleniu się DOM.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("arkusz ma przycisk zamknięcia z nazwą", async () => {
    render(<MenuTelefonu><button>Pomoc</button></MenuTelefonu>);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("button", { name: "Zamknij" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/nawigacja/MenuTelefonu.test.tsx` — Expected: FAIL.

- [ ] **Step 2: `dialog.tsx` — wariant arkusza i nazwa zamknięcia**

W `DialogContent` dodaj prop `wariant?: "okno" | "arkusz"` (domyślnie `"okno"` — obecne klasy bez zmian). Dla `"arkusz"`:

```ts
"fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto rounded-l-xl border-l border-border bg-surface p-5 shadow-pop " +
  "data-[state=open]:animate-[pe-arkusz-wjazd_200ms_ease-out] motion-reduce:animate-none"
```

z `@keyframes pe-arkusz-wjazd { from { transform: translateX(100%); } to { transform: none; } }` w `src/index.css` (w bloku z innymi `@keyframes`, wyłączane w istniejącym `@media (prefers-reduced-motion: reduce)`). Przycisk zamknięcia (`DialogPrimitive.Close` z ikoną X) dostaje `aria-label="Zamknij"` w obu wariantach — dziś nie ma nazwy dostępnej.

- [ ] **Step 3: `MenuTelefonu`**

```tsx
import { useState } from "react";
import { Menu } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Menu nagłówka na telefonie (poniżej 768 px): Kalkulatory, Protokoły, Dokumentacja,
 * Pomoc i Nowy projekt w arkuszu z prawej, zamiast paska przewijanego w bok.
 *
 * Pasek przewijany ucinał etykiety w pół słowa („Protokoły pomiarow”), a o tym, że
 * jest dalej coś jeszcze, mówiło tylko wygaszenie krawędzi. W arkuszu każda pozycja
 * jest pełna, ma 44 px wysokości i stoi pod kciukiem. Wybór pozycji zamyka arkusz —
 * nawigacja ma przenieść, nie zostawić użytkownika w menu.
 */
export function MenuTelefonu({ children }: { children: React.ReactNode }) {
  const [otwarte, setOtwarte] = useState(false);
  return (
    <Dialog open={otwarte} onOpenChange={setOtwarte}>
      <DialogTrigger asChild>
        <Button variant="subtle" size="icon" aria-label="Menu" className="h-11 w-11 md:hidden">
          <Menu size={20} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu" wariant="arkusz">
        <div
          className="flex flex-col gap-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-start [&>button]:text-base"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("button")) setOtwarte(false);
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Uwaga: `NewProjectButton` otwiera własne okno potwierdzenia — sprawdź, że zamknięcie arkusza nie zamyka go razem z nim (jeśli tak: dla tej pozycji zamknij arkusz w `onOpenChange` okna potwierdzenia albo przenieś potwierdzenie poza arkusz; opisz wybór w raporcie).

Run: test z Step 1 — Expected: PASS.

- [ ] **Step 4: Nagłówek w `App.tsx`**

- Poniżej `md`: w nagłówku zostają logo (bez zmian), grupa konta („Zaloguj się” albo avatar z menu konta + `CloudSaveIndicator`) i `MenuTelefonu`. Przewijany `pasek-zakladek` jest `hidden md:contents` (od `md` dokładnie jak dziś).
- `MenuTelefonu` dostaje jako dzieci TE SAME elementy co pasek zakładek: `ToolTab` „Kalkulatory”, `ToolTab` „Protokoły pomiarowe”, „Dokumentacja”, „Pomoc”, chip stanu zapisu (bez `hidden lg:flex` — w menu zawsze widoczny), `NewProjectButton`. Wydziel je do jednej funkcji renderującej (`function PozycjeNaglowka(...)`) wywołanej w obu miejscach, żeby nie dublować JSX; nazwy dostępne identyczne.
- Pozycja aktywna (`ToolTab` z `active`) zachowuje wyróżnienie w menu.
- Usuń `useWygaszenieKrawedzi` z paska zakładek, jeśli na `md+` już nie jest potrzebne (pasek od `md` zawija się, nie przewija); pasek etapów (`pasek-etapow`) zostaje przy nim, jeśli nadal przewija się w zakresie `sm`–`md`.

- [ ] **Step 5: e2e — helper i testy nagłówka**

`e2e/_flow.ts`:

```ts
/**
 * Przejście do narzędzia z nagłówka — na telefonie przez menu, na większym ekranie wprost.
 *
 * Poniżej 768 px Kalkulatory, Protokoły, Dokumentacja, Pomoc i Nowy projekt są
 * w arkuszu „Menu” (redesign PR 3). Testy, które jadą na obu szerokościach, wołają
 * to jedno wejście zamiast sprawdzać szerokość same.
 */
export async function przejdzDoNarzedzia(
  page: Page,
  nazwa: "Kalkulatory" | "Protokoły pomiarowe" | "Dokumentacja" | "Pomoc" | "Nowy projekt"
): Promise<void> {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: nazwa, exact: true }).click();
  } else {
    await page.getByRole("banner").getByRole("button", { name: nazwa, exact: true }).click();
  }
}
```

`e2e/naglowek-telefon.spec.ts`: zostaje test 1 („Zaloguj się” w kadrze) i 3 (brak poziomego przewijania). Test 2 („zakładki przewijają się poziomo”) i 4 (wygaszenie krawędzi paska zakładek) zastąp:
- „wszystkie narzędzia są w menu, z pełnymi nazwami” — otwórz „Menu”, sprawdź 5 przycisków po nazwie exact, każdy ma szerokość ≥ 200 px i wysokość ≥ 44 px;
- „wybór w menu przenosi i zamyka arkusz” — „Kalkulatory” → nagłówek „Kalkulatory elektryczne” widoczny, dialog „Menu” zniknął;
- „nagłówek telefonu to jeden rząd” — wysokość `banner` ≤ 64 px przy 375 px.

W pozostałych plikach z listy zamień kliknięcia zakładek nagłówka na `przejdzDoNarzedzia(page, …)` — TYLKO w testach poniżej 768 px; testy na monitorze zostają bez zmian.

- [ ] **Step 6: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/naglowek-telefon.spec.ts e2e/calculators.spec.ts e2e/kalkulatory-telefon.spec.ts e2e/dostepnosc-struktura.spec.ts e2e/tablet-cele-dotyku.spec.ts e2e/protokoly-telefon.spec.ts e2e/pola-16px-telefon.spec.ts e2e/kopia-zapasowa.spec.ts e2e/cele-dotykowe.spec.ts e2e/account-menu.spec.ts e2e/shell-ui.spec.ts e2e/project-lifecycle.spec.ts e2e/edytor-telefon-zwarty.spec.ts e2e/uklad-szerokosci.spec.ts e2e/routing.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src e2e
git commit -m "Telefon: menu nagłówka w arkuszu zamiast zakładek przewijanych w bok

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Etapy na telefonie, odstęp strony, stopka, ekran startowy

**Files:**
- Modify: `src/App.tsx` (`FlowCard` ~217, `FlowArrow` ~310, pasek etapów ~880, korzeń strony `p-6`, `ProjectNameField` ~360, `SiteFooter` ~1387)
- Modify: `src/components/onboarding/CoPowstanie.tsx`
- Create: `e2e/etapy-telefon.spec.ts`

**Interfaces:**
- Consumes: tokeny (`copper`, `paper`, `success-grafika`), `cn`.

- [ ] **Step 1: Failujący e2e**

`e2e/etapy-telefon.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Cztery etapy widać na telefonie NARAZ, bez przewijania paska w bok.
 *
 * Do PR 3 pasek etapów przewijał się poziomo: przy 375 px widać było 01 i kawałek
 * 02, a etapy 03–04 tylko po przesunięciu palcem. Teraz cztery równe kolumny.
 */
for (const szer of [360, 375, 430]) {
  test(`${szer} px: wszystkie cztery etapy w kadrze, aktywny wyróżniony`, async ({ page }) => {
    await page.setViewportSize({ width: szer, height: 812 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    for (const nazwa of ["Instalacja", "Rozdzielnica", "Schemat", "Kosztorys"]) {
      const k = (await page.getByRole("button", { name: nazwa, exact: true }).boundingBox())!;
      expect(k.x, nazwa).toBeGreaterThanOrEqual(0);
      expect(k.x + k.width, nazwa).toBeLessThanOrEqual(szer);
      expect(k.height, nazwa).toBeGreaterThanOrEqual(44);
    }
    const pasek = page.getByTestId("pasek-etapow");
    expect(await pasek.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.getByRole("button", { name: "Instalacja", exact: true })).toHaveAttribute("aria-current", "step");
  });
}
```

Run: Expected FAIL (przewijanie, brak `aria-current`).

- [ ] **Step 2: Kafle**

- Kontener `pasek-etapow`: poniżej `sm` `grid grid-cols-4 gap-1.5`, od `sm` obecne `flex … overflow-x-auto`.
- `FlowArrow`: `hidden sm:block`.
- `FlowCard` poniżej `sm`: kolumna — numer (h-6 w-6) nad tytułem, tytuł `text-xs font-semibold truncate` (pełny tekst w DOM, `title` przycisku bez zmian), plakietka `hidden sm:inline-flex`, przycisk `w-full min-h-11 flex-col justify-center`, karta `px-1.5 py-1.5`. Stan „gotowy” poniżej `sm` niesie kropka 6 px w kolorze `success-grafika` przy numerze (`aria-hidden`), skoro plakietki nie ma.
- Kolory kafla z tokenów zamiast hex (`border-copper bg-copper-tlo` dla aktywnego, `border-border bg-surface` dla reszty; numer aktywny `bg-copper text-white`, reszta `bg-paper text-slate-400`).
- Przycisk aktywnego etapu dostaje `aria-current="step"`.
- Pod siatką (poniżej `sm`) pasek postępu: `<div aria-hidden="true" className="col-span-4 h-0.5 rounded-full bg-paper"><div className="h-full rounded-full bg-copper" style={{ width: \`${((idx + 1) / 4) * 100}%\` }} /></div>` — `idx` aktywnego etapu; na Kalkulatorach/Protokołach (żaden etap aktywny) pasek postępu nie renderuje się.

- [ ] **Step 3: Odstęp strony i nazwa projektu**

- Korzeń strony: `p-6` → `p-4 sm:p-6` (komentarz: 16 px treści więcej przy 360 px). Popraw `PasekKroku` (`-mx-4 sm:-mx-6`), jeśli Task 3 użył `-mx-6`.
- `ProjectNameField`: nazwa w jednej linii z wielokropkiem (`min-w-0 truncate`, kontener `min-w-0 flex-1`), pełna nazwa w `title`.

- [ ] **Step 4: Stopka i ekran startowy**

- `SiteFooter`: `<Logo className="mb-1.5 h-5 w-auto" />` → `h-8` (napis w logo ≥ 16 px wysokości; zmierz w raporcie wysokość tekstu w SVG po zmianie).
- `CoPowstanie.tsx`: poniżej `sm` siatka 2 × 2 (`grid grid-cols-2 gap-3 justify-items-center`), strzałki między elementami `hidden sm:block`; od `sm` obecny rząd. Usuń `overflow-x-auto` poniżej `sm`.

- [ ] **Step 5: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/etapy-telefon.spec.ts e2e/kafle-etapow.spec.ts e2e/edytor-telefon-zwarty.spec.ts e2e/naglowek-telefon.spec.ts e2e/onboarding.spec.ts e2e/uklad-szerokosci.spec.ts e2e/cele-dotykowe.spec.ts e2e/stopka-zastrzezenie.spec.ts e2e/metadane.spec.ts e2e/project-lifecycle.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura` — plus kopia tymczasowa `etapy-telefon` z szerokością 345 (360 − 15, wariant CI).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src e2e/etapy-telefon.spec.ts
git commit -m "Telefon: cztery etapy naraz, węższy odstęp strony, czytelne logo w stopce, „Co z tego powstanie” 2 × 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kontrola jakości

- [ ] **Step 1:** `npm run typecheck && npm run lint && npx vitest run && npm run build` — zielone.
- [ ] **Step 2:** Pełne e2e: `npx playwright test --config=playwright.worktree.config.ts --reporter=line --grep-invert @chmura`, potem `--grep @chmura --workers=1` osobno. Pełne podsumowanie; 0 failed.
- [ ] **Step 3:** Zrzuty: `ZRZUTY=<…>/przed` z `redesign-komponenty` (zrobione przez kontrolera przed Task 1) i `ZRZUTY=<…>/po` teraz (`e2e/uklad-szerokosci.spec.ts`). Porównaj 360/390/430/768/1366 dla start, instalacja, rozdzielnica, kosztorys, kalkulatory, protokoly. Szukaj: uciętych tytułów etapów poza „Rozdzielnica” przy 360, paska kroku zasłaniającego treść, zawijającego się nagłówka.
- [ ] **Step 4:** Konsola (tymczasowy spec, 8 widoków przy 375 i 1366 px) — 0 błędów.
- [ ] **Step 5:** Wariant CI: tymczasowe kopie `pasek-kroku`, `etapy-telefon`, `naglowek-telefon`, `edytor-telefon-zwarty` z szerokościami −15 px — PASS.
- [ ] **Step 6:** Push i PR po decyzji użytkownika — baza `main`, jeśli #239 i #266 są scalone; inaczej `redesign-komponenty`.
