# Redesign PR 5 — kosztorys, tabele i ruch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W kosztorysie od razu widać, co jest liczone, a co wpisane ręcznie, a suma brutto jest stale pod ręką; tabele w całej aplikacji wyglądają tak samo; wczytywanie i okna mają spokojny, spójny ruch — z wyłączeniem przy `prefers-reduced-motion`.

**Architecture:** (1) W `CostsTab.tsx` pola ilości i wartości pozycji dostają dwa wyraźne stany: LICZONE (przerywana ramka, czytelny tekst podpowiedzi) i WPISANE (pełna miedziana ramka — jak dziś), z jedną legendą nad tabelą. (2) `PasekKroku` dostaje gniazdo na środku (`div#pasek-kroku-srodek`), do którego `CostsTab` wstawia przez `createPortal` sumę brutto — jeden przyklejony pasek zamiast dwóch. (3) Klasa `.pe-table` w `src/index.css` dla czterech tabel (Kosztorys, „Dobór obwodów” w Rozdzielnicy, Protokoły, zestawienie ilości). (4) Szkielet wczytywania zakładki, wejście okien dialogowych i przenikanie karty kalkulatora — wszystko pod `motion-safe:`.

**Tech Stack:** React 18 (`createPortal`), Tailwind 3, Radix Dialog, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-redesign-ewolucja-design.md` — sekcja 7 „Kosztorys i tabele”, sekcja 8 „Ruch”, „Kontrola jakości”. Poprzednie plany PR 1–4 w `docs/superpowers/plans/`.

## Global Constraints

- Gałąź `redesign-kosztorys` od `redesign-kalkulatory` (#269 → #268 → #266 → #239). PR celuje w `redesign-kalkulatory`, dopóki niższe nie trafią do `main`. Nigdy nie nazywać gałęzi `dependabot`.
- Worktree `C:/Users/Marcin/Desktop/pomocnik-ts-redesign-5`. Worktree `pomocnik-ts-redesign`, `-2`, `-3`, `-4` obsługują Auto-fix #239/#266/#268/#269 — nie dotykać. Główny checkout użytkownika — nie dotykać.
- e2e tylko przez nieśledzony `playwright.worktree.config.ts` (porty 5273/5290), port check przed każdym uruchomieniem, pełne podsumowanie (nie `tail -1`), `--grep-invert @chmura` lokalnie. Warianty CI: szerokość −15 px (bez przekraczania progów 640/768) albo `*{letter-spacing:0.3px}` przez `addInitScript`.
- **ZERO zmian w obliczeniach kosztorysu** (`src/lib/costs.ts`, `podsumowanie`, VAT, ryczałty, CSV, PDF). Teksty pozycji, etykiety, kolejność kolumn i nazwy dostępne pól (`Ilość: …`, `Cena jednostkowa: …`, `Wartość pozycji: …`, `Przywróć …`) bez zmian — na nich stoją testy e2e.
- Tekst „RAZEM brutto” występuje dziś na stronie w podsumowaniu u góry i w stopce tabeli; testy (`kosztorys-vat.spec.ts`, `kosztorys-wartosc-pozycji.spec.ts`, `kosztorys-podsumowanie.spec.ts`) szukają go w konkretnych miejscach. Pasek sumy NIE może zawierać tekstu „RAZEM brutto” — używa „Suma brutto”.
- Tokeny, skala tekstu (min. `text-xs`, żadnych `text-[Npx]`), `Badge`, `Alert`, `Button`; żadnych nowych hex z kanałem alfa (strażnik `klasyUsuniete.test.ts`). Kontrast tekstu ≥ 4,5:1, ramki kontrolek ≥ 3:1.
- Każda animacja tylko pod `motion-safe:` (albo w regule `@media (prefers-reduced-motion: no-preference)`), czasy 120 / 200 ms, `ease-out`.
- Komentarze po polsku (dlaczego, nie co); commit kończy się `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Rozstrzygnięcia względem specu

1. **Wartość pozycji zostaje polem**, nie zwykłym tekstem: od wcześniejszego PR da się w nią wpisać ryczałt (realne oferty podają pozycje ryczałtem). Spec chciał „wyliczane = tekst”, żeby nie mylić stanów — ten cel osiąga rozróżnienie ramek: przerywana = liczone (podpowiedź), pełna miedziana = wpisane ręcznie.
2. **Zamiast znacznika „z rzutu” przy każdej ilości** — ta sama przerywana ramka i jedna legenda nad tabelą. 30 znaczników w karcie na telefonie zabrałoby miejsce liczbom, które dopiero co przestały się ucinać (`kosztorys-telefon`).
3. **Suma w pasku kroku, nie w osobnym pasku** — na Kosztorysie stoi już przyklejony pasek „Cofnij: Schemat” z wolną prawą stroną; drugi przyklejony pasek zabrałby kolejne ~60 px ekranu telefonu.
4. **`.pe-table` ujednolica kolory, ramki, wcięcia i wyrównanie liczb — nie rozmiar tekstu.** Tabela doboru obwodów w Rozdzielnicy ma 9 kolumn i świadomie `text-xs`; podniesienie jej do 14 px rozbiłoby układ, którego pilnują testy telefonu.

---

## Mapa plików

| Plik | Rola |
|---|---|
| Modify `src/components/costs/CostsTab.tsx` | stany pól, legenda, portal sumy, `.pe-table` |
| Modify `src/components/nawigacja/PasekKroku.tsx` + `.test.tsx` | gniazdo `#pasek-kroku-srodek` |
| Create `e2e/kosztorys-stany-pol.spec.ts`, `e2e/kosztorys-suma-w-pasku.spec.ts` | nowe zachowania |
| Modify `src/index.css` | `.pe-table`, `@keyframes` wejścia okna i przenikania, szkielet |
| Modify `src/components/panel/PanelTab.tsx`, `src/components/protocols/ProtocolsTab.tsx`, `src/components/design/QuantitiesPanel.tsx` | `.pe-table` |
| Modify `src/components/ui/dialog.tsx` | wejście okna (wariant „okno”) |
| Modify `src/App.tsx` (`TabLoading`) | szkielet zamiast „Wczytywanie…” |
| Modify `src/components/calculators/CalculatorsTab.tsx` | przenikanie przy zmianie kalkulatora |
| Create `e2e/ruch-ograniczony.spec.ts` | `prefers-reduced-motion` wyłącza wszystkie nowe animacje |

---

### Task 1: Kosztorys — liczone czy wpisane

**Files:**
- Modify: `src/components/costs/CostsTab.tsx` (pola ilości ~437–449, wartości ~489–502, legenda nad tabelą ~383)
- Create: `e2e/kosztorys-stany-pol.spec.ts`

**Interfaces:**
- Produces: pola mają atrybut `data-stan="liczone" | "wpisane"` (dla testów i stylów); klasy `border-dashed` / `border-solid border-copper`.

- [ ] **Step 1: Failujący e2e**

`e2e/kosztorys-stany-pol.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * W kosztorysie widać, co policzyła aplikacja, a co wpisał użytkownik.
 *
 * Audyt redesignu: ilość z rzutu wyglądała jak wyłączone pole (szara podpowiedź),
 * a wartość — jak pole do wypełnienia, choć była wyliczona. Teraz: przerywana ramka
 * i czytelny tekst = wartość liczona (można ją nadpisać), pełna miedziana ramka =
 * wpisana ręcznie. Legenda nad tabelą mówi to słowami.
 */
test("pole liczone ma przerywaną ramkę i czytelny tekst, wpisane — pełną", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  await expect(page.getByText(/przerywana ramka/i)).toBeVisible();

  const ilosc = page.getByLabel(/^Ilość: Gniazdko 230V podwójne/);
  await expect(ilosc).toHaveAttribute("data-stan", "liczone");
  const styl = await ilosc.evaluate((e) => {
    const s = getComputedStyle(e);
    const p = getComputedStyle(e, "::placeholder");
    return { ramka: s.borderTopStyle, podpowiedz: p.color };
  });
  expect(styl.ramka).toBe("dashed");
  // Podpowiedź w kolorze tekstu (ink #16202B), nie wyszarzona.
  expect(styl.podpowiedz).toBe("rgb(22, 32, 43)");

  await ilosc.fill("9");
  await expect(ilosc).toHaveAttribute("data-stan", "wpisane");
  expect(await ilosc.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("solid");

  const wartosc = page.getByLabel(/^Wartość pozycji: Gniazdko 230V podwójne/);
  await expect(wartosc).toHaveAttribute("data-stan", "liczone");
});
```

Run (port check najpierw): `npx playwright test e2e/kosztorys-stany-pol.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line` — Expected: FAIL.

- [ ] **Step 2: Implementacja**

- Ilość i wartość pozycji: `data-stan={nadpisane ? "wpisane" : "liczone"}` (ilość: `r.qtyOverridden`, wartość: `r.overridden`).
- Stan „liczone”: klasy `border-dashed border-slate-400 placeholder:text-ink placeholder:opacity-100` (Firefox domyślnie przyciemnia podpowiedź — `opacity-100` to wyłącza).
- Stan „wpisane”: dzisiejszy styl inline (`color: #8A5526`, `borderColor: #C1793F`, `fontWeight: 600`) zastąp klasami `border-solid border-copper font-semibold text-caution` (bez inline `style`).
- Cena jednostkowa zawsze wpisywana → bez zmian (zwykłe pole).
- Legenda nad tabelą (jedna linia, `text-xs text-slate-500`, z dwiema małymi próbkami ramek `aria-hidden`): „Przerywana ramka — wartość policzona przez aplikację (wpisz, żeby ją zmienić). Pełna miedziana — wpisana ręcznie.”
- Dlaczego `border-slate-400` (#5B6A80, ~5,4:1 na bieli), a nie `border-border-strong` (#C7D0D9, ~1,6:1): ramka jest jedynym nośnikiem stanu pola, więc musi spełniać WCAG 1.4.11 (3:1) — zapisz to w komentarzu przy klasie.

- [ ] **Step 3: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/kosztorys-stany-pol.spec.ts e2e/kosztorys-telefon.spec.ts e2e/kosztorys-wartosc-pozycji.spec.ts e2e/kosztorys-vat.spec.ts e2e/kosztorys-podsumowanie.spec.ts e2e/kosztorys-z-rozdzielnicy.spec.ts e2e/zapas-montazowy.spec.ts e2e/niskopradowka-metraz.spec.ts e2e/pola-16px-telefon.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS (w tym `kosztorys-telefon` — przerywana ramka nie zmienia szerokości pól).

- [ ] **Step 4: Commit**

```bash
git add src/components/costs/CostsTab.tsx e2e/kosztorys-stany-pol.spec.ts
git commit -m "Kosztorys: przerywana ramka = wartość liczona, pełna miedziana = wpisana ręcznie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Suma brutto w pasku kroku

**Files:**
- Modify: `src/components/nawigacja/PasekKroku.tsx`, `src/components/nawigacja/PasekKroku.test.tsx`
- Modify: `src/components/costs/CostsTab.tsx`
- Create: `e2e/kosztorys-suma-w-pasku.spec.ts`

**Interfaces:**
- Produces: `PasekKroku` renderuje między przyciskami `<div id="pasek-kroku-srodek" className="min-w-0 flex-1" />` (zawsze, także gdy pusty). `CostsTab` wstawia tam `createPortal(<SumaWPasku brutto={gross} />, slot)` — `slot` z `document.getElementById` w `useEffect` po zamontowaniu (pasek renderuje się w `App` po zakładce; jeśli slotu nie ma, nic się nie dzieje).

- [ ] **Step 1: Failujący test komponentu**

W `src/components/nawigacja/PasekKroku.test.tsx` dopisz:

```tsx
  it("ma gniazdo na środku dla treści zakładki (np. sumy kosztorysu)", () => {
    const { container } = render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    const slot = container.querySelector("#pasek-kroku-srodek");
    expect(slot).not.toBeNull();
    expect(slot!.parentElement!.tagName).toBe("NAV");
  });
```

- [ ] **Step 2: Failujący e2e**

`e2e/kosztorys-suma-w-pasku.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Suma brutto kosztorysu jest stale widoczna w przyklejonym pasku kroku.
 *
 * Kosztorys ma ~30 pozycji; przy poprawianiu cen w połowie listy suma była albo
 * 1500 px wyżej (podsumowanie u góry), albo niżej (stopka tabeli). Pasek „Cofnij:
 * Schemat” i tak stoi na dole ekranu, a na Kosztorysie ma wolną prawą stronę.
 * Napis „Suma brutto”, nie „RAZEM brutto” — tamten szukają testy w podsumowaniu i stopce.
 */
for (const okno of [
  { width: 375, height: 812 },
  { width: 1366, height: 900 },
]) {
  test(`${okno.width} px: suma w pasku zgadza się z podsumowaniem i nadąża za zmianą ceny`, async ({ page }) => {
    await page.setViewportSize(okno);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

    const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
    const suma = pasek.getByTestId("suma-w-pasku");
    await expect(suma).toContainText("Suma brutto");

    const kwota = async (t: string) => Number(t.replace(/[^\d,]/g, "").replace(",", "."));
    const zPodsumowania = await kwota(await page.getByTestId("podsumowanie-brutto").innerText());
    expect(await kwota(await suma.innerText())).toBeCloseTo(zPodsumowania, 2);

    // W połowie listy suma nadal w kadrze.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    const r = (await suma.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(okno.height);

    const przed = await kwota(await suma.innerText());
    const cena = page.getByLabel(/^Cena jednostkowa: Gniazdko 230V podwójne/);
    await cena.fill(String(Number(await cena.inputValue()) + 10));
    await expect.poll(async () => kwota(await suma.innerText())).toBeGreaterThan(przed);
  });
}
```

`data-testid="podsumowanie-brutto"` dodaj w Step 3 na element z kwotą brutto w podsumowaniu u góry kosztorysu (bez zmiany jego tekstu).

Run — Expected: FAIL (brak gniazda / sumy).

- [ ] **Step 3: Implementacja**

`PasekKroku.tsx` — między przyciskiem „Cofnij” (albo pustym `<span />`) a „Dalej”:

```tsx
      {/* Gniazdo na treść zakładki (dziś: suma brutto kosztorysu, wstawiana portalem
          z CostsTab). Jeden przyklejony pasek zamiast dwóch — drugi zabrałby kolejne
          ~60 px ekranu telefonu. Pusty div nie zajmuje miejsca poza `flex-1`. */}
      <div id="pasek-kroku-srodek" className="flex min-w-0 flex-1 justify-end" />
```

(`ml-auto` z „Dalej” można zostawić — przy pustym gnieździe nic się nie zmienia.)

`CostsTab.tsx`:

```tsx
import { createPortal } from "react-dom";
// …
function SumaWPasku({ brutto }: { brutto: number }) {
  return (
    <div data-testid="suma-w-pasku" className="text-right leading-tight" aria-live="polite">
      <div className="text-xs text-slate-500">Suma brutto</div>
      <div className="pe-mono text-base font-semibold text-ink sm:text-lg">{formatLiczba(brutto, 2)} zł</div>
    </div>
  );
}
// w komponencie:
const [slotSumy, setSlotSumy] = useState<HTMLElement | null>(null);
useEffect(() => setSlotSumy(document.getElementById("pasek-kroku-srodek")), []);
// w JSX (gdziekolwiek):
{slotSumy && createPortal(<SumaWPasku brutto={gross} />, slotSumy)}
```

`aria-live="polite"`: zmiana ceny ogłasza nową sumę spokojnie, bez przerywania (jedna liczba, nie lista). Jeśli `gross` w kodzie nazywa się inaczej — użyj tej samej wartości co „RAZEM brutto” w stopce.

- [ ] **Step 4: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/kosztorys-suma-w-pasku.spec.ts e2e/pasek-kroku.spec.ts e2e/kosztorys-*.spec.ts e2e/stopka-zastrzezenie.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura` — plus kopia tymczasowa `kosztorys-suma-w-pasku` przy 360 px (pasek nadal w jednym rzędzie: „← Schemat” i suma obok siebie).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nawigacja src/components/costs/CostsTab.tsx e2e/kosztorys-suma-w-pasku.spec.ts
git commit -m "Kosztorys: suma brutto stale widoczna w pasku kroku

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wspólny wygląd tabel — `.pe-table`

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/costs/CostsTab.tsx` (~383), `src/components/panel/PanelTab.tsx` (~929), `src/components/protocols/ProtocolsTab.tsx` (~535), `src/components/design/QuantitiesPanel.tsx` (~72, ~91)

**Interfaces:**
- Produces: klasa `.pe-table` (komponentowa warstwa CSS).

- [ ] **Step 1: Klasa**

W `src/index.css` (`@layer components`):

```css
  /* Wspólny wygląd tabel: nagłówek na tle surface-2, linie w kolorze ramek, liczby
     z prawej i w kroju o równej szerokości cyfr (kolumny kwot czytają się w pionie).
     ROZMIAR tekstu zostaje przy tabeli — dziewięciokolumnowa tabela doboru obwodów
     ma świadomie 12 px. Klasy działają też w układzie „karty” na telefonie (`block`):
     wtedy nagłówek jest ukryty, a linie oddzielają karty. */
  .pe-table thead th {
    @apply bg-surface-2 font-semibold text-slate-500;
  }
  .pe-table th,
  .pe-table td {
    @apply border-b border-border;
  }
  .pe-table tbody tr:last-child td {
    @apply border-b-0;
  }
  .pe-table .pe-liczba {
    @apply pe-mono text-right tabular-nums;
  }
```

(Jeśli `@apply pe-mono` nie działa w Tailwind 3 dla klasy komponentowej, powtórz jej deklaracje albo dopisz `pe-mono` przy komórkach w JSX.)

- [ ] **Step 2: Zastosowanie**

Dla każdej z pięciu tabel: dopisz `pe-table` do `<table>`; usuń z `<th>` / `<td>` / `<tr>` ręczne kolory tła nagłówka, kolory tekstu nagłówka i inline `borderColor` (np. `style={{ borderColor: "#EEF1F4" }}` w wierszach kosztorysu) — przejmuje je klasa; komórki z kwotami / liczbami dostają `pe-liczba` (jeśli już mają `pe-mono text-right`, zamień na `pe-liczba`). Układ (`block md:table`, `grid` kart na telefonie, szerokości kolumn, `p-3`, rozmiar tekstu) BEZ zmian. Treść i kolejność komórek bez zmian.

- [ ] **Step 3: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/kosztorys-*.spec.ts e2e/rozdzielnica-uklad.spec.ts e2e/rozdzielnica-telefon.spec.ts e2e/panel-sizing.spec.ts e2e/protokoly-uklad.spec.ts e2e/protokoly-telefon.spec.ts e2e/zestawienie.spec.ts e2e/uklad-szerokosci.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "Tabele: wspólny wygląd nagłówków, linii i kolumn liczbowych (.pe-table)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ruch — szkielet wczytywania, wejście okien, przenikanie karty

**Files:**
- Modify: `src/App.tsx` (`TabLoading` ~122), `src/components/ui/dialog.tsx` (wariant „okno”), `src/components/calculators/CalculatorsTab.tsx` (karta aktywnego kalkulatora), `src/index.css` (`@keyframes`)
- Create: `e2e/ruch-ograniczony.spec.ts`

**Interfaces:**
- Produces: `@keyframes pe-okno-wejscie` (opacity 0→1, `scale(.98)`→1, 200 ms), `@keyframes pe-przenikanie` (opacity 0→1, 120 ms); klasa `pe-szkielet` (pulsujące tło `bg-paper`, `motion-safe:animate-pulse`).

- [ ] **Step 1: Failujący e2e**

`e2e/ruch-ograniczony.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

/**
 * Przy `prefers-reduced-motion: reduce` żadna z animacji redesignu nie rusza:
 * wejście okna, przenikanie karty kalkulatora, szkielet wczytywania. Bez ruchu, ale
 * z tą samą treścią — kto prosi o spokój, ma dostać ten sam interfejs, nie uboższy.
 */
test.describe("ograniczony ruch", () => {
  test.use({ colorScheme: "light", reducedMotion: "reduce" });

  test("okno dialogowe i karta kalkulatora bez animacji", async ({ page }) => {
    await page.goto("/kalkulatory/spadek");
    await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
    const karta = page.locator("[data-karta-kalkulatora]").first();
    expect(await karta.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");

    await page.getByRole("button", { name: "Pomoc" }).first().click();
    const okno = page.getByRole("dialog").first();
    await expect(okno).toBeVisible();
    expect(await okno.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  });
});

test("bez ograniczenia: okno wchodzi animacją pe-okno-wejscie", async ({ page }) => {
  await page.goto("/kalkulatory/spadek");
  await page.getByRole("button", { name: "Pomoc" }).first().click();
  const okno = page.getByRole("dialog").first();
  await expect(okno).toBeVisible();
  expect(await okno.evaluate((e) => getComputedStyle(e).animationName)).toContain("pe-okno-wejscie");
});
```

(Przycisk „Pomoc” na 1280 px jest w nagłówku — domyślny viewport projektu `dev`.)

Run — Expected: FAIL.

- [ ] **Step 2: Implementacja**

- `src/index.css`: `@keyframes pe-okno-wejscie { from { opacity: 0; transform: translate(-50%, -48%) scale(.98); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }` — uwzględnij to, że wariant „okno” jest pozycjonowany `-translate-x-1/2 -translate-y-1/2` (animacja nie może zgubić przesunięcia). `@keyframes pe-przenikanie { from { opacity: 0; } to { opacity: 1; } }`.
- `dialog.tsx` (wariant „okno”): `motion-safe:data-[state=open]:animate-[pe-okno-wejscie_200ms_ease-out]`; tło (`Overlay`): `motion-safe:data-[state=open]:animate-[pe-przenikanie_200ms_ease-out]`.
- `CalculatorsTab.tsx`: karta aktywnego kalkulatora dostaje `data-karta-kalkulatora`, `key={activeCalc}` (przemontowanie przy zmianie → animacja od nowa) i `motion-safe:animate-[pe-przenikanie_120ms_ease-out]`. Sprawdź, że `key` nie gubi stanu pól (stan jest w store, nie w komponencie — potwierdź przed zmianą; jeśli jakiś kalkulator trzyma stan lokalnie, nałóż animację na wrapper bez `key` i odpal ją przez zmianę klasy).
- `TabLoading` (App.tsx): zamiast kręciołka i „Wczytywanie…” — szkielet układu: nagłówek (h-6 w-1/3), dwie linie tekstu (h-4), karta (h-40), wszystko `pe-szkielet rounded-card`, w kontenerze `role="status" aria-label="Wczytywanie"` (czytnik nadal słyszy, że coś się ładuje). `pe-szkielet` = `bg-paper motion-safe:animate-pulse`.
- Usuń `@media (prefers-reduced-motion)`-owe wyjątki, które przestały być potrzebne, jeśli nowe animacje są już pod `motion-safe:`; zostaw istniejące reguły onboardingu bez zmian.

- [ ] **Step 3: Testy**

Run: `npx vitest run && npm run typecheck && npm run lint`
Run: `npx playwright test e2e/ruch-ograniczony.spec.ts e2e/calculators.spec.ts e2e/kalkulatory-telefon.spec.ts e2e/naglowek-telefon.spec.ts e2e/komplet.spec.ts e2e/prefetch-zakladek.spec.ts e2e/awaria-zakladki.spec.ts e2e/fokus-widoczny.spec.ts e2e/wynik-glowny.spec.ts --config=playwright.worktree.config.ts --project=dev --reporter=line --grep-invert @chmura`
Expected: PASS. Testy, które klikają w okno tuż po otwarciu, mogą trafić w animację — jeśli coś pada przez `scale`, popraw test oczekiwaniem na stan (`toBeVisible` + `toHaveCSS("opacity", "1")`), nie wyłączając animacji.

- [ ] **Step 4: Commit**

```bash
git add src e2e/ruch-ograniczony.spec.ts
git commit -m "Ruch: szkielet wczytywania, wejście okien i przenikanie karty — tylko przy motion-safe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kontrola jakości

- [ ] **Step 1:** `npm run typecheck && npm run lint && npx vitest run && npm run build` — zielone.
- [ ] **Step 2:** Pełne e2e: `npx playwright test --config=playwright.worktree.config.ts --reporter=line --grep-invert @chmura`, potem `--grep @chmura --workers=1`. Pełne podsumowanie; 0 failed.
- [ ] **Step 3:** Zrzuty: „przed” z `redesign-kalkulatory` (robi kontroler przed Task 1), „po” teraz — `uklad-szerokosci` + tymczasowy spec z Kosztorysem przykładu „mieszkanie” przy 375 i 1366 px (góra strony i połowa listy, z paskiem sumy), Rozdzielnica (tabela doboru) i Protokoły (tabela pomiarów). Porównaj: ramki pól, legenda, suma w pasku, nagłówki tabel, brak uciętych liczb.
- [ ] **Step 4:** Konsola: tymczasowy spec — 8 widoków przy 375 i 1366 px — 0 błędów.
- [ ] **Step 5:** Wariant CI: `kosztorys-telefon`, `kosztorys-suma-w-pasku` i `kosztorys-stany-pol` z `letter-spacing: 0.3px` oraz przy 360 px — PASS.
- [ ] **Step 6:** Push i PR po decyzji użytkownika — baza `main`, jeśli niższe PR-y są scalone; inaczej `redesign-kalkulatory`.
