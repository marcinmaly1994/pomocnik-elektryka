# Drugi projekt przykładowy — dom 136 m² — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dołożyć drugi projekt przykładowy — dom 136 m² na dwóch kondygnacjach z podrozdzielnicą na piętrze — wybierany w okienku obok dotychczasowego mieszkania.

**Architecture:** Rejestr przykładów w `src/lib/demo/`: statyczne metadane dla okna wyboru plus budowniczy za dynamicznym `import()`, żeby żaden przykład nie obciążał paczki dopóki go nikt nie wybierze. Testy przykładu przechodzą z „jedna funkcja" na pętlę po rejestrze, więc dom jest pilnowany przez wszystko, czego nauczyło nas mieszkanie.

**Tech Stack:** TypeScript, React 18, Zustand, Konva, Radix Dialog, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-drugi-przyklad-dom-design.md`

## Global Constraints

- **Komentarze po polsku**, w stylu pliku, który się rusza: tłumaczą DLACZEGO, nie CO. Bez diakrytyków w komunikatach commitów, z diakrytykami w kodzie i w UI.
- **Pliki mają CRLF.** Edycje skryptami muszą to zachować (`replace(/\r\n/g,"\n")` na wejściu, `replace(/\n/g,"\r\n")` na wyjściu).
- **Jednostki planu:** 1 jedn. = 5 cm; `M = 20` jedn. na metr; początek układu `X0 = 20`, `Y0 = 20`. Wszystkie narożniki na pełnym albo połówkowym metrze.
- **Korytarze minimum 1,5 m.** Poniżej tego obrys wsunięty o `ODSUNIECIE_TRASY` (5 jedn.) z obu stron zostawia pasek ≤ `MERGE_TOLERANCE` (10 jedn.) i krawędzie scalają się w jeden węzeł grafu tras.
- **Odstęp osprzętu ≥ 0,8 m** między symbolami, żeby się nie nakładały.
- **`przyklejDoScian` wywołuje się OSOBNO dla każdej kondygnacji**, na jej własnych ścianach i obrysach. Wspólne wywołanie pozwoliłoby gniazdu z piętra przykleić się do ściany parteru.
- Po każdym zadaniu: `npx tsc --noEmit`, `npx eslint <zmienione pliki>`, `npx vitest run`. Commit dopiero gdy wszystko zielone.
- Nazwa projektu domu: `Przykład: dom 136 m²`. Nazwa mieszkania bez zmian.

---

### Task 1: Wspólne pomocniki i przeniesienie mieszkania do `src/lib/demo/`

Czysta przeprowadzka. Po tym zadaniu testy mają przejść **bez zmiany ani jednej asercji** — jeśli któraś padnie, przeprowadzka nie była czysta.

**Files:**
- Create: `src/lib/demo/wspolne.ts`
- Create: `src/lib/demo/mieszkanie.ts` (z `src/lib/demoProjekt.ts`)
- Create: `src/lib/demo/mieszkanie.test.ts` (z `src/lib/demoProjekt.test.ts`)
- Delete: `src/lib/demoProjekt.ts`, `src/lib/demoProjekt.test.ts`
- Modify: `src/store/useProjectStore.ts` — ścieżka w `import("@/lib/demoProjekt")`

**Interfaces:**
- Produces:
  - `p(mx: number, my: number): Point` — punkt z metrów liczonych od narożnika budynku
  - `tworzE(floor: string): (id: string, type: ElementType, room: string, mx: number, my: number, extra?: Partial<InstallationElement>) => InstallationElement`
  - `przyklejDoScian(elements: InstallationElement[], walls: Wall[], rooms: RoomShape[]): InstallationElement[]`
  - `zbudujProjektPrzykladowy(): ProjectPayload` z `./mieszkanie`

- [ ] **Step 1: Utwórz `src/lib/demo/wspolne.ts`**

Przenieś z `demoProjekt.ts` bez zmian merytorycznych: stałe `X0`, `Y0`, `M`, funkcję `p`, ciało `e` i całe `przyklejDoScian` razem z jego komentarzem.

```ts
import type { InstallationElement, ElementType, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, WALL_SNAP_TOLERANCE_M } from "@/lib/design";
import { przyscienny, snapElementToWall } from "@/lib/wallSnap";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";

/** Lewy górny róg budynku w jednostkach planu. */
const X0 = 20;
const Y0 = 20;
/** Jednostki planu na metr — patrz `MANUAL_DRAW_SCALE_MPU` (0,05 m na jednostkę). */
const M = 20;

/** Punkt z METRÓW liczonych od narożnika budynku — cały rysunek przykładów jest w nich,
 *  bo „ściana na 5 m" czyta się, a „ściana na 200" trzeba przeliczać w głowie. */
export const p = (mx: number, my: number) => ({ x: X0 + mx * M, y: Y0 + my * M });

/**
 * Skrót na element, ZWIĄZANY Z KONDYGNACJĄ.
 *
 * Fabryka, a nie funkcja z dodatkowym argumentem: przykład na dwóch kondygnacjach ma
 * dwie długie listy elementów i wpisywanie `"f1"` przy każdej z pięćdziesięciu pozycji
 * byłoby pięćdziesięcioma okazjami do literówki, której nic by nie wyłapało poza testem
 * „wszystko na zadeklarowanej kondygnacji".
 *
 * Reszta pól to wartości domyślne, identyczne z tymi, które nadaje `addElement`
 * w store'rze przy stawianiu klikiem.
 */
export function tworzE(floor: string) {
  return function e(
    id: string,
    type: ElementType,
    room: string,
    mx: number,
    my: number,
    extra: Partial<InstallationElement> = {}
  ): InstallationElement {
    return {
      id: `demo-e-${id}`,
      type,
      ...p(mx, my),
      room,
      floor,
      dedicated: false,
      note: "",
      gangs: 1,
      ...extra,
    };
  };
}
```

Dalej w tym samym pliku `przyklejDoScian`. Przenieś z `demoProjekt.ts` całą funkcję **razem z jej istniejącym komentarzem blokowym** (tym o doklejaniu osprzętu dokładnie tak, jak robi to kliknięcie na planie — nie przepisuj go, przenieś) i dopisz na jego końcu, przed `*/`, nowy akapit:

```ts
/**
 * …tu zostaje przeniesiony komentarz z demoProjekt.ts, bez zmian…
 *
 * WYWOŁUJ OSOBNO DLA KAŻDEJ KONDYGNACJI, na jej własnych ścianach i obrysach.
 * `snapElementToWall` nie wie nic o piętrach — dostając ściany całego budynku,
 * przykleiłaby gniazdo z piętra do ściany parteru, która akurat leży bliżej.
 */
export function przyklejDoScian(
  elements: InstallationElement[],
  walls: Wall[],
  rooms: RoomShape[]
): InstallationElement[] {
  const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
  const tolerancja = WALL_SNAP_TOLERANCE_M / MANUAL_DRAW_SCALE_MPU;
  return elements.map((el) => {
    if (!przyscienny(el.type)) return el;
    const m = snapElementToWall({ x: el.x, y: el.y }, walls, rooms, tolerancja, el.type, skala);
    return m ? { ...el, x: m.x, y: m.y, rotation: m.rotation } : el;
  });
}
```

- [ ] **Step 2: Przenieś plik mieszkania**

```bash
git mv src/lib/demoProjekt.ts src/lib/demo/mieszkanie.ts
git mv src/lib/demoProjekt.test.ts src/lib/demo/mieszkanie.test.ts
```

W `src/lib/demo/mieszkanie.ts` usuń przeniesione definicje (`X0`, `Y0`, `M`, `p`, `e`, `przyklejDoScian`) i dopisz import:

```ts
import { p, przyklejDoScian, tworzE } from "./wspolne";

const FLOOR = "f1";
const e = tworzE(FLOOR);
```

Usuń też importy, które zostały bez użytkownika (`WALL_SNAP_TOLERANCE_M`, `przyscienny`, `snapElementToWall`, `DEFAULT_ELEMENT_SCALE`, `elementRenderScale`) — `eslint` je wskaże.

W `src/lib/demo/mieszkanie.test.ts` popraw ścieżki importów: `"./demoProjekt"` → `"./mieszkanie"`, `"./geometry"` → `"@/lib/geometry"`, `"./costs"` → `"@/lib/costs"`, `"./elements"` → `"@/lib/elements"`, `"./panel/routing"` → `"@/lib/panel/routing"`, `"./panel/circuits"` → `"@/lib/panel/circuits"`, `"./panel/loads"` → `"@/lib/panel/loads"`, `"./symbolScale"` → `"@/lib/symbolScale"`, `"./design"` → `"@/lib/design"`.

- [ ] **Step 3: Popraw ścieżkę w store'rze**

W `src/store/useProjectStore.ts`, w `wczytajPrzyklad`:

```ts
const { zbudujProjektPrzykladowy } = await import("@/lib/demo/mieszkanie");
```

- [ ] **Step 4: Sprawdź, że przeprowadzka jest CZYSTA**

```bash
npx tsc --noEmit && npx eslint src/lib/demo src/store/useProjectStore.ts && npx vitest run
```

Oczekiwane: `1641 passed`, bez zmiany ani jednej asercji. Jeśli któraś padła — przeprowadzka coś zmieniła; znajdź co, zamiast poprawiać test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Przeniesienie przykladu do src/lib/demo, wspolne pomocniki

Przygotowanie pod drugi przyklad: p(), tworzE() i przyklejDoScian ida do wspolne.ts,
demoProjekt.ts staje sie demo/mieszkanie.ts. Zero zmian merytorycznych — te same 1641
testow przechodzi bez ruszania asercji.

tworzE jest fabryka wiazana z kondygnacja, bo przyklad na dwoch pietrach ma dwie dlugie
listy elementow i wpisywanie floor przy kazdej pozycji byloby okazja do literowki.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rejestr przykładów i `wczytajPrzyklad(id)`

**Files:**
- Create: `src/lib/demo/index.ts`
- Create: `src/lib/demo/index.test.ts`
- Modify: `src/store/useProjectStore.ts` (deklaracja i ciało `wczytajPrzyklad`)
- Modify: `src/components/design/DesignTab.tsx` (wywołanie `wczytajPrzyklad`)

**Interfaces:**
- Consumes: `zbudujProjektPrzykladowy()` z `./mieszkanie` (Task 1)
- Produces:
  - `type PrzykladId = (typeof PRZYKLADY)[number]["id"]`
  - `PRZYKLADY: readonly Przyklad[]`
  - `zbudujPrzyklad(id: PrzykladId): Promise<ProjectPayload>`

- [ ] **Step 1: Napisz test rejestru (ma paść)**

`src/lib/demo/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRZYKLADY, zbudujPrzyklad } from "./index";
import { polygonAreaM2 } from "@/lib/geometry";
import { scaleOf } from "@/lib/design";

describe("rejestr przykładów", () => {
  it("ma unikalne identyfikatory", () => {
    const id = PRZYKLADY.map((x) => x.id);
    expect(new Set(id).size).toBe(id.length);
  });

  it("każdy wpis ma komplet metadanych do narysowania karty", () => {
    for (const x of PRZYKLADY) {
      expect(x.nazwa.length, x.id).toBeGreaterThan(3);
      expect(x.opis.length, x.id).toBeGreaterThan(20);
      expect(x.fakty.length, x.id).toBe(3);
    }
  });

  it("każdy wpis buduje się do payloadu oznaczonego jako przykład", async () => {
    for (const x of PRZYKLADY) {
      const payload = await zbudujPrzyklad(x.id);
      expect(payload.projektPrzykladowy, x.id).toBe(true);
      expect(payload.draft.elements.length, x.id).toBeGreaterThan(0);
    }
  });

  /**
   * Liczby na karcie są w rejestrze WPISANE RĘCZNIE, żeby okno mogło je pokazać bez
   * pobierania danych przykładu — więc rozjadą się przy pierwszej zmianie rzutu, jeśli
   * nikt tego nie pilnuje. Metraż i liczba pomieszczeń dokładnie, liczba elementów
   * z tolerancją, bo jest podana z tyldą.
   */
  it("liczby na karcie zgadzają się z danymi", async () => {
    for (const x of PRZYKLADY) {
      const payload = await zbudujPrzyklad(x.id);
      const [faktMetraz, faktPokoje, faktElementy] = x.fakty;

      const mpu = scaleOf(payload.scales, payload.activeFloorId)!;
      const metraz = payload.draft.roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
      expect(Number(faktMetraz.replace(/[^\d,]/g, "").replace(",", ".")), x.id).toBeCloseTo(metraz, 0);

      expect(Number(faktPokoje.replace(/\D/g, "")), x.id).toBe(payload.draft.roomShapes.length);

      const deklarowane = Number(faktElementy.replace(/\D/g, ""));
      const naprawde = payload.draft.elements.length;
      expect(Math.abs(deklarowane - naprawde) / naprawde, `${x.id}: karta mówi ${deklarowane}, jest ${naprawde}`).toBeLessThanOrEqual(0.1);
    }
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

```bash
npx vitest run src/lib/demo/index.test.ts
```

Oczekiwane: FAIL, „Failed to resolve import ./index".

- [ ] **Step 3: Napisz rejestr**

`src/lib/demo/index.ts`:

```ts
import type { ProjectPayload } from "@/store/useProjectStore";

/**
 * Rejestr gotowych projektów przykładowych.
 *
 * METADANE SĄ STATYCZNE, A BUDOWNICZY ZA `import()` — i to jest cała istota tego pliku.
 * Okno wyboru musi pokazać nazwy, opisy i liczby ZANIM ktokolwiek coś wybierze; gdyby
 * czytało je z danych, otwarcie okna ściągałoby wszystkie przykłady naraz. Tak ściąga
 * się wyłącznie ten, w który ktoś kliknął — dokładnie z tego powodu, dla którego
 * `wczytajPrzyklad` w store'rze od początku używa dynamicznego importu.
 *
 * Kosztem jest to, że liczby w `fakty` są wpisane ręcznie i mogą się rozjechać
 * z danymi. Pilnuje tego test w `index.test.ts`.
 */
export interface Przyklad {
  id: string;
  nazwa: string;
  opis: string;
  /** Dokładnie trzy: metraż, liczba pomieszczeń, liczba elementów. Kolejność ma znaczenie
   *  — czyta ją test zgodności z danymi. `readonly`, bo rejestr jest `as const`. */
  fakty: readonly [string, string, string];
  zaladuj: () => Promise<{ default?: unknown; [k: string]: unknown }>;
  /** Nazwa eksportu budowniczego w module wskazanym przez `zaladuj`. */
  eksport: string;
}

export const PRZYKLADY = [
  {
    id: "mieszkanie",
    nazwa: "Mieszkanie 70 m²",
    opis: "Blok, M4 z korytarzem. Sześć pomieszczeń, jedna rozdzielnica.",
    fakty: ["70 m²", "6 pomieszczeń", "48 elementów"],
    zaladuj: () => import("./mieszkanie"),
    eksport: "zbudujProjektPrzykladowy",
  },
] as const satisfies readonly Przyklad[];

export type PrzykladId = (typeof PRZYKLADY)[number]["id"];

/** Buduje payload wskazanego przykładu. Rzuca, gdy `id` nie ma w rejestrze — to błąd
 *  programisty, nie stan, w którym użytkownik może się znaleźć. */
export async function zbudujPrzyklad(id: PrzykladId): Promise<ProjectPayload> {
  const wpis = PRZYKLADY.find((x) => x.id === id);
  if (!wpis) throw new Error(`Nie ma przykładu o id "${id}"`);
  const mod = await wpis.zaladuj();
  return (mod as Record<string, () => ProjectPayload>)[wpis.eksport]();
}
```

- [ ] **Step 4: Uruchom test rejestru**

```bash
npx vitest run src/lib/demo/index.test.ts
```

Oczekiwane: PASS (4 testy). Jeśli „liczby na karcie" padnie — popraw `fakty`, nie test.

- [ ] **Step 5: Przestaw store na `id`**

W `src/store/useProjectStore.ts` zmień deklarację w interfejsie:

```ts
  /** Wczytuje gotowy projekt przykładowy z rejestru (lib/demo/index.ts). Osobno od
   *  `loadProjectPayload`, bo sam sięga po dane — komponent nie musi ich znać,
   *  a moduł z wybranym przykładem dociąga się dopiero na kliknięcie (dynamiczny
   *  `import()` w rejestrze). */
  wczytajPrzyklad: (id: PrzykladId) => Promise<void>;
```

i ciało:

```ts
  wczytajPrzyklad: async (id) => {
    const { zbudujPrzyklad } = await import("@/lib/demo");
    get().loadProjectPayload(await zbudujPrzyklad(id));
    lastCloudSavedJson = null;
    znaneUpdatedAt = null;
    ostatniaZapisanaNazwa = null;
    set({ cloudId: null, lastCloudSaveAt: null, cloudSaveError: null, konfliktChmury: null });
  },
```

Dodaj `import type { PrzykladId } from "@/lib/demo";` na górze pliku. Komentarze wewnątrz ciała zostają bez zmian.

- [ ] **Step 6: Popraw wywołanie w `DesignTab`**

`onClick={() => void wczytajPrzyklad()}` → `onClick={() => void wczytajPrzyklad("mieszkanie")}`. Okno wyboru przyjdzie w Tasku 3.

- [ ] **Step 7: Zielono i commit**

```bash
npx tsc --noEmit && npx eslint src/lib/demo src/store/useProjectStore.ts src/components/design/DesignTab.tsx && npx vitest run
git add -A && git commit -m "Rejestr przykladow i wczytajPrzyklad(id)

Metadane statyczne, budowniczy za dynamicznym import(): okno wyboru pokaze nazwy i liczby
bez sciagania danych zadnego przykladu, a po kliknieciu dociaga sie wylacznie wybrany.

Liczby na karcie sa wpisane recznie, wiec pilnuje ich test porownujacy je z payloadem —
metraz i liczba pomieszczen dokladnie, liczba elementow z tolerancja 10%, bo jest z tylda.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Okno wyboru przykładu

**Files:**
- Create: `src/components/onboarding/WyborPrzykladu.tsx`
- Modify: `src/components/design/DesignTab.tsx`
- Modify: `src/components/onboarding/PasekPrzykladu.tsx`
- Modify: `e2e/_flow.ts`
- Modify: 8 plików e2e (12 wywołań)
- Modify: `e2e/projekt-przykladowy.spec.ts`

**Interfaces:**
- Consumes: `PRZYKLADY`, `PrzykladId` (Task 2)
- Produces: `<WyborPrzykladu open onOpenChange />`; `wczytajPrzyklad(page, id)` w `e2e/_flow.ts`

- [ ] **Step 1: Napisz komponent okna**

`src/components/onboarding/WyborPrzykladu.tsx`:

```tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PRZYKLADY, type PrzykladId } from "@/lib/demo";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Wybór gotowego przykładu.
 *
 * Karty renderują się Z REJESTRU, a nie z listy wpisanej tutaj w JSX: trzeci przykład
 * ma być jednym plikiem i jednym wierszem w rejestrze, bez wracania do tego komponentu.
 *
 * GDZIE TO MIESZKA, JEST WARUNKIEM DZIAŁANIA, nie kwestią porządku. Renderuj to okno
 * POZA blokiem ekranu startowego w `DesignTab`: wybór przykładu wczytuje projekt, ekran
 * startowy natychmiast znika — a okno osadzone w jego bloku odmontowałoby się w połowie
 * własnej akcji. To ta sama pułapka, którą komentarz w `KompletDialog` opisuje dla
 * przełączania zakładek.
 */
export function WyborPrzykladu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const wczytajPrzyklad = useProjectStore((s) => s.wczytajPrzyklad);

  async function wybierz(id: PrzykladId) {
    onOpenChange(false);
    await wczytajPrzyklad(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <h2 className="text-base font-semibold">Który przykład otworzyć?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Oba są gotowe do oglądania — rozdzielnica, schemat i kosztorys wypełniają się z rzutu same.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRZYKLADY.map((x) => (
            <button
              key={x.id}
              onClick={() => void wybierz(x.id)}
              className="rounded-lg border border-slate-200 p-4 text-left hover:border-blueprint hover:bg-slate-50"
            >
              <span className="block font-semibold">{x.nazwa}</span>
              <span className="mt-1 block text-sm text-slate-600">{x.opis}</span>
              <span className="mt-2 block text-xs text-slate-500">{x.fakty.join(" · ")}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wepnij okno w `DesignTab`**

Dodaj import i stan:

```tsx
import { WyborPrzykladu } from "@/components/onboarding/WyborPrzykladu";
// …
const [wyborPrzykladu, setWyborPrzykladu] = useState(false);
```

Zmień przycisk na ekranie startowym (zostaw komentarz „TRZECIA droga" nad nim bez zmian):

```tsx
          <button
            onClick={() => setWyborPrzykladu(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-blueprint underline-offset-2 hover:underline"
          >
            <Eye size={15} /> Zobacz gotowy przykład
          </button>
```

Samo okno wstaw **poza** blokiem `showEntryScreen`, obok innych okien renderowanych na poziomie zakładki:

```tsx
      <WyborPrzykladu open={wyborPrzykladu} onOpenChange={setWyborPrzykladu} />
```

- [ ] **Step 3: Odkłam pasek przykładu**

`PasekPrzykladu.tsx` ma wpisane na stałe „gotowe mieszkanie 70 m²" — przy wczytanym domu mówiłby nieprawdę. Zamień zdanie na niezależne od przykładu:

```tsx
      <span>
        <strong>To jest projekt przykładowy</strong> — gotowy projekt, na którym widać, co aplikacja liczy sama.
        Poklikaj po zakładkach, zmieniaj co chcesz; ten projekt nie zapisuje się na Twoim koncie.
      </span>
```

Pogrubiony początek zostaje bez zmian, bo to na nim stoi sześć asercji e2e (`getByText("To jest projekt przykładowy")`).

- [ ] **Step 4: Dodaj pomocnik e2e**

Na końcu `e2e/_flow.ts`:

```ts
/**
 * Wczytuje gotowy przykład z ekranu startowego: link, a potem karta w oknie wyboru.
 *
 * Osobny pomocnik, bo wejść w przykład chce kilkanaście testów, a droga wejścia jest
 * właściwością UI, nie treścią żadnego z nich — do okna doszło się dopiero wtedy, gdy
 * przykładów zrobiło się więcej niż jeden, i równie dobrze może się jeszcze zmienić.
 */
export async function wczytajPrzyklad(page: Page, id: "mieszkanie" | "dom"): Promise<void> {
  const nazwa = id === "mieszkanie" ? /Mieszkanie 70 m²/ : /Dom 136 m²/;
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.getByRole("button", { name: nazwa }).click();
}
```

- [ ] **Step 5: Przestaw 12 wywołań**

We wszystkich ośmiu plikach zamień

```ts
await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
```

na

```ts
await wczytajPrzyklad(page, "mieszkanie");
```

i dopisz import z `./_flow`. Liczba wywołań na plik: `kopia-zapasowa` 3, `kafle-etapow` 2, `projekty-lokalne` 2, `dymki-rozdzielnicy` 1, `etykiety-grup` 1, `niepelny-zapis` 1, `projekt-przykladowy` 1, `stopka-zastrzezenie` 1. **Żadnej asercji nie ruszaj.**

- [ ] **Step 6: Dopisz testy samego okna**

Do `e2e/projekt-przykladowy.spec.ts`:

```ts
test("okno wyboru pokazuje kartę dla każdego przykładu z rejestru", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await expect(page.getByRole("button", { name: /Mieszkanie 70 m²/ })).toBeVisible();
  // Liczba kart ma iść za rejestrem, a nie za tym, ile ich akurat jest w dniu pisania testu.
  const kart = await page.getByRole("button", { name: /m²/ }).count();
  expect(kart).toBeGreaterThanOrEqual(1);
});

test("Escape zamyka okno wyboru bez wczytywania czegokolwiek", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Mieszkanie 70 m²/ })).toBeHidden();
  await expect(page.getByText("To jest projekt przykładowy")).toBeHidden();
});
```

- [ ] **Step 7: Zielono i commit**

```bash
npx tsc --noEmit && npx eslint src e2e && npx vitest run && npx playwright test --reporter=line
git add -A && git commit -m "Okno wyboru przykladu

Ekran startowy zostaje z jednym linkiem — dopisek o mieszkaniu z niego znika, bo
przykladow bedzie wiecej. Karty renderuja sie z rejestru, wiec trzeci przyklad nie
bedzie wymagal wracania do tego komponentu.

Okno renderuje sie POZA blokiem ekranu startowego: wybor wczytuje projekt, ekran
startowy znika, a okno osadzone w jego bloku odmontowaloby sie w polowie wlasnej akcji.

Pasek 'To jest projekt przykladowy' mial wpisane na stale 'gotowe mieszkanie 70 m2' —
przy domu mowilby nieprawde, wiec zdanie jest teraz niezalezne od przykladu. Pogrubiony
poczatek zostaje, bo na nim stoi szesc asercji e2e.

Droga wejscia w przyklad przeniesiona do pomocnika w e2e/_flow.ts; 12 wywolan w osmiu
plikach na niego przechodzi, zadna asercja nie ruszona.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wspólny zestaw testów po rejestrze

**Files:**
- Create: `src/lib/demo/przyklady.test.ts`
- Delete: `src/lib/demo/mieszkanie.test.ts` (treść rozchodzi się do pliku wyżej)

**Interfaces:**
- Consumes: `PRZYKLADY`, `zbudujPrzyklad` (Task 2)

- [ ] **Step 1: Napisz wspólny zestaw**

`src/lib/demo/przyklady.test.ts` — pętla po rejestrze. Przenieś tu wszystkie testy z `mieszkanie.test.ts`, zamieniając `zbudujProjektPrzykladowy()` na `await zbudujPrzyklad(x.id)` i opakowując je w `describe.each`. Nowe i zmienione:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { PRZYKLADY, zbudujPrzyklad } from "./index";
import { nearestPointOnPolyline, pointInPolygon, polygonAreaM2 } from "@/lib/geometry";
import { scaleOf, MANUAL_DRAW_SCALE_MPU } from "@/lib/design";
import { computeCircuits } from "@/lib/panel/circuits";
import { buildCableRoutes, findPanel, findPanels, spreadOverlappingRoutes } from "@/lib/panel/loads";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";
import { ODSUNIECIE_TRASY } from "@/lib/panel/routing";
import type { ProjectPayload } from "@/store/useProjectStore";

describe.each(PRZYKLADY.map((x) => [x.id, x] as const))("przykład „%s»", (id, wpis) => {
  let payload: ProjectPayload;
  beforeAll(async () => {
    payload = await zbudujPrzyklad(id);
  });

  it("obiecuje metraż w nazwie i tyle naprawdę ma", () => {
    const mpu = scaleOf(payload.scales, payload.activeFloorId)!;
    const metraz = payload.draft.roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
    const zNazwy = Number(payload.projectName.replace(/[^\d,]/g, "").replace(",", "."));
    expect(zNazwy, payload.projectName).toBeCloseTo(metraz, 0);
  });

  it("element LEŻY w pomieszczeniu, które ma wpisane — nie tylko je nazywa", () => {
    for (const el of payload.draft.elements) {
      const wew = payload.draft.roomShapes
        .filter((r) => r.floor === el.floor && pointInPolygon({ x: el.x, y: el.y }, r.points))
        .map((r) => r.name);
      expect(wew, `element ${el.id} wpisany do „${el.room}"`).toContain(el.room);
    }
  });

  it("KAŻDA kondygnacja z elementami ma na sobie rozdzielnicę", () => {
    /**
     * To nie jest kosmetyka. `buildCableRoutes` dostaje elementy przefiltrowane po
     * kondygnacji (patrz `trasyPotrzebne` w DesignTab.tsx), więc `findPanel` szuka
     * rozdzielnicy TEJ kondygnacji. Piętro bez własnej nie dostaje ŻADNEJ trasy
     * zasilania — zostają same linie sterowania łącznik→oprawa, a rzut wygląda na pusty.
     */
    const zElementami = [...new Set(payload.draft.elements.map((e) => e.floor))];
    const panele = findPanels(payload.draft.elements);
    for (const f of zElementami) expect(panele.poKondygnacji.has(f), `kondygnacja ${f}`).toBe(true);
  });

  it("każde pomieszczenie ma drzwi do KOMUNIKACJI, a nie do sąsiada", () => {
    /**
     * Uogólnienie reguły, która wcześniej wisiała na nazwie „Przedpokój". Komunikacja to
     * pomieszczenia typu `inne` — w mieszkaniu Przedpokój, w domu Hol i Korytarz.
     *
     * Sama spójność grafu drzwi by nie wystarczyła: przepuściłaby sypialnię dostępną
     * przez kuchnię, czyli dokładnie to, co było nie tak z pierwszą wersją rzutu.
     */
    const LUZ = 0.5 / MANUAL_DRAW_SCALE_MPU;
    const naObrysie = (o: { x: number; y: number }, pts: { x: number; y: number }[]) => {
      const rzut = nearestPointOnPolyline(o, [...pts, pts[0]]);
      return rzut !== null && Math.hypot(rzut.point.x - o.x, rzut.point.y - o.y) <= LUZ;
    };
    const komunikacja = payload.draft.roomShapes.filter((r) => r.type === "inne");
    expect(komunikacja.length, "przykład bez pomieszczenia komunikacyjnego").toBeGreaterThan(0);

    for (const r of payload.draft.roomShapes) {
      if (r.type === "inne") continue;
      const drzwi = payload.draft.openings.filter(
        (o) =>
          o.floor === r.floor &&
          naObrysie(o, r.points) &&
          komunikacja.some((k) => k.floor === r.floor && naObrysie(o, k.points))
      );
      expect(drzwi.length, `„${r.name}" bez drzwi do komunikacji`).toBeGreaterThan(0);
    }
  });

  it("przewody biegną wzdłuż ścian — na KAŻDEJ kondygnacji", () => {
    const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
    for (const f of payload.floors.map((x) => x.id)) {
      const el = payload.draft.elements.filter((e) => e.floor === f);
      if (el.length === 0) continue;
      const sc = payload.draft.walls.filter((w) => w.floor === f);
      const rs = payload.draft.roomShapes.filter((r) => r.floor === f);
      const ot = payload.draft.openings.filter((o) => o.floor === f);
      const rysowane = spreadOverlappingRoutes(
        buildCableRoutes(findPanel(el), computeCircuits(el, rs), el, sc, rs, ot, skala),
        rs
      );
      const zle: string[] = [];
      let dlugosc = 0;
      let ukos = 0;
      for (const [rid, pts] of rysowane) {
        for (let i = 1; i < pts.length; i++) {
          const dx = Math.abs(pts[i].x - pts[i - 1].x);
          const dy = Math.abs(pts[i].y - pts[i - 1].y);
          const len = Math.hypot(dx, dy);
          dlugosc += len;
          if (dx > 0.01 && dy > 0.01) ukos += len;
          if (dx <= 0.01 || dy <= 0.01) continue;
          if (len < ODSUNIECIE_TRASY) continue;
          if (Math.abs(dx - dy) <= 0.1) continue;
          zle.push(`${f}/${rid}: (${pts[i - 1].x.toFixed(1)},${pts[i - 1].y.toFixed(1)})→(${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)})`);
        }
      }
      expect(zle, `kondygnacja ${f}`).toEqual([]);
      expect(ukos / dlugosc, `kondygnacja ${f}`).toBeLessThan(0.1);
    }
  });
});
```

Przenieś też pozostałe testy z `mieszkanie.test.ts` w tej samej konwencji: „wszystko w obszarze planu", „ma rozdzielnicę na planie", „wypełnia rozdzielnicę i kosztorys", „pomieszczenia mokre mają jawny typ", „oznaczony jako przykład", „nie wlecze podkładu", „buduje się od nowa", „gniazdo podwójne" i „liczba puszek podtynkowych". Testy o gnieździe podwójnym zostają w pętli — dotyczą obu przykładów.

Test „liczba puszek podtynkowych nie zależy od wariantu gniazd" zostaje w pętli, ale
listę typów pomijanych (`rozdzielnica`, `puszka`, `szafkaTeletech`, przybory sanitarne)
przenieś bez zmian — dom dokłada do niej `ladowarkaEV` i `oswietlenieZewn`, które puszkę
podtynkową mają, więc nic nie trzeba dopisywać.

- [ ] **Step 2: Skasuj stary plik**

```bash
git rm src/lib/demo/mieszkanie.test.ts
```

- [ ] **Step 3: Uruchom**

```bash
npx vitest run src/lib/demo
```

Oczekiwane: PASS. Testy lecą na razie tylko dla mieszkania — dom dojdzie do rejestru w Tasku 8.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Testy przykladu ida po rejestrze, nie po jednej funkcji

Dzieki temu drugi przyklad jest od pierwszego dnia pilnowany przez wszystko, czego
nauczylo nas mieszkanie, a trzeci dostanie to bez pisania.

Dwie reguly przy okazji mocniejsze:
— 'kazde pomieszczenie ma drzwi do Przedpokoju' wisialo na NAZWIE; teraz brzmi 'ma drzwi
  wspolne z pomieszczeniem typu inne' i dziala dla kazdego przykladu bez konfiguracji;
— przebieg przewodow sprawdzany OSOBNO dla kazdej kondygnacji, a nie dla calego budynku.

Nowy: kazda kondygnacja z elementami musi miec na sobie rozdzielnice. Bez niej
buildCableRoutes nie narysuje na niej ani jednej trasy zasilania.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Dom — kondygnacje, ściany, obrysy, otwory

Sam szkielet, bez osprzętu. Jeszcze **nie** wchodzi do rejestru, więc wspólny zestaw go nie dotyczy.

**Files:**
- Create: `src/lib/demo/dom.ts`
- Create: `src/lib/demo/dom.test.ts`

**Interfaces:**
- Consumes: `p`, `tworzE`, `przyklejDoScian` (Task 1)
- Produces: `zbudujProjektDom(): ProjectPayload`, `PARTER = "f1"`, `PIETRO = "f2"`

- [ ] **Step 1: Napisz test geometrii (ma paść)**

`src/lib/demo/dom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { zbudujProjektDom } from "./dom";
import { polygonAreaM2 } from "@/lib/geometry";
import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";

describe("dom — szkielet", () => {
  const payload = zbudujProjektDom();
  const pole = (f: string) =>
    payload.draft.roomShapes
      .filter((r) => r.floor === f)
      .reduce((a, r) => a + (polygonAreaM2(r.points, MANUAL_DRAW_SCALE_MPU) ?? 0), 0);

  it("ma dwie kondygnacje z wysokością w świetle", () => {
    expect(payload.floors.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(payload.floors[0].heightM).toBe(2.8);
    expect(payload.floors[1].heightM).toBe(2.6);
  });

  it("parter ma 80 m², piętro 56 m², razem 136 m²", () => {
    expect(pole("f1")).toBeCloseTo(80, 1);
    expect(pole("f2")).toBeCloseTo(56, 1);
    expect(payload.projectName).toContain("136 m²");
  });

  it("piętra nie ma nad garażem — obrysy kondygnacji są różne", () => {
    const minX = (f: string) => Math.min(...payload.draft.roomShapes.filter((r) => r.floor === f).flatMap((r) => r.points.map((q) => q.x)));
    expect(minX("f2")).toBeGreaterThan(minX("f1"));
  });

  it("każdy otwór należy do ściany, która istnieje na tej samej kondygnacji", () => {
    for (const o of payload.draft.openings) {
      const w = payload.draft.walls.find((x) => x.id === o.wallId);
      expect(w, `otwór ${o.id}`).toBeTruthy();
      expect(w!.floor, `otwór ${o.id}`).toBe(o.floor);
    }
  });
});
```

- [ ] **Step 2: Uruchom — ma paść**

```bash
npx vitest run src/lib/demo/dom.test.ts
```

Oczekiwane: FAIL, „Failed to resolve import ./dom".

- [ ] **Step 3: Napisz `dom.ts` — nagłówek i stałe**

```ts
import type { InstallationElement, Opening, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, ROOM_COLORS } from "@/lib/design";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";
import { p, przyklejDoScian, tworzE } from "./wspolne";

/**
 * Gotowy projekt przykładowy — dom jednorodzinny 136 m² na dwóch kondygnacjach.
 *
 * PO CO OBOK MIESZKANIA: mieszkanie stoi na jednej kondygnacji i jednej rozdzielnicy,
 * więc nie pokazuje ani przełączania pięter, ani pionów między nimi, ani podrozdzielnicy,
 * ani pomieszczeń gospodarczych z osobnymi obwodami, ani ładowarki samochodowej.
 *
 * CZEGO TEN PRZYKŁAD NIE OBIECUJE: zakładka Rozdzielnica nie zna pojęcia podrozdzielnicy
 * — `PanelTab` buduje JEDNĄ tablicę z obwodów całego budynku. Podrozdzielnica działa
 * w dwóch miejscach i tylko o nich mówi karta w oknie wyboru:
 *   — na RYSUNKU, bo `buildCableRoutes` dostaje elementy przefiltrowane po kondygnacji,
 *     więc piętro bez własnej rozdzielnicy nie ma ŻADNEJ trasy zasilania;
 *   — w KOSZTORYSIE, bo `estimateRoutes` nie dolicza wtedy pionu przez strop.
 *
 * KONDYGNACJE MAJĄ RÓŻNY OBRYS — piętra nie ma nad garażem. Tak buduje się domy
 * z garażem w bryle i przy okazji widać, że obrysy pięter nie muszą się pokrywać.
 *
 * SZEROKOŚĆ KORYTARZY to 1,5 m i nie jest to estetyka: obrys wchodzi do grafu tras
 * wsunięty o `ODSUNIECIE_TRASY` z każdej strony, więc z korytarza 1,0 m zostaje pasek
 * równy `MERGE_TOLERANCE` i obie jego krawędzie scalają się w jeden węzeł grafu.
 * Powód opisany szerzej w nagłówku `mieszkanie.ts`.
 *
 * Parter 10 × 8 m = 80 m²:
 *   Garaż 24 · Hol 16,5 · Salon 15,75 · Kuchnia 8,75 · Łazienka 6 · Pralnia 4,5 · Kotłownia 4,5
 * Piętro 7 × 8 m = 56 m² (nad x 3–10):
 *   Sypialnia 1 12,25 · Sypialnia 2 12,25 · Korytarz 10,5 · Sypialnia główna 10,5 · Łazienka 10,5
 */

export const PARTER = "f1";
export const PIETRO = "f2";

const eP = tworzE(PARTER);
const eG = tworzE(PIETRO);

const GARAZ = "Garaż";
const HOL = "Hol";
const SALON = "Salon";
const KUCHNIA = "Kuchnia";
const LAZIENKA_D = "Łazienka";
const PRALNIA = "Pralnia";
const KOTLOWNIA = "Kotłownia";

const SYP1 = "Sypialnia 1";
const SYP2 = "Sypialnia 2";
const SYP_GL = "Sypialnia główna";
const KORYTARZ = "Korytarz";
const LAZIENKA_G = "Łazienka na piętrze";
```

**Uwaga na nazwy:** dwie łazienki muszą mieć RÓŻNE `name`, bo pole `room` elementu to wolny tekst dopasowywany po nazwie (`typPomieszczenia` w `design.ts`). Dwie „Łazienki" zlałyby się w jedno pomieszczenie przy grupowaniu obwodów.

- [ ] **Step 4: Ściany**

```ts
function sciany(): Wall[] {
  return [
    // --- Parter ---
    { id: "dom-w-obrys-p", floor: PARTER, points: [p(0, 0), p(10, 0), p(10, 8), p(0, 8), p(0, 0)] },
    { id: "dom-w-garaz", floor: PARTER, points: [p(3, 0), p(3, 8)] },
    { id: "dom-w-kuchnia-salon", floor: PARTER, points: [p(5.5, 0), p(5.5, 3.5)] },
    { id: "dom-w-dzienna-hol", floor: PARTER, points: [p(3, 3.5), p(10, 3.5)] },
    // Łamana zamykająca przedsionek i strefę techniczną: pion x=5 od ściany
    // zewnętrznej do korytarza, dalej poziom y=5 aż do ściany wschodniej.
    { id: "dom-w-hol-dol", floor: PARTER, points: [p(5, 8), p(5, 5), p(10, 5)] },
    { id: "dom-w-lazienka-pralnia", floor: PARTER, points: [p(7, 5), p(7, 8)] },
    { id: "dom-w-pralnia-kotlownia", floor: PARTER, points: [p(8.5, 5), p(8.5, 8)] },

    // --- Piętro (obrys węższy — nie ma go nad garażem) ---
    { id: "dom-w-obrys-g", floor: PIETRO, points: [p(3, 0), p(10, 0), p(10, 8), p(3, 8), p(3, 0)] },
    { id: "dom-w-syp1-syp2", floor: PIETRO, points: [p(6.5, 0), p(6.5, 3.5)] },
    { id: "dom-w-gora-korytarz", floor: PIETRO, points: [p(3, 3.5), p(10, 3.5)] },
    { id: "dom-w-korytarz-dol", floor: PIETRO, points: [p(3, 5), p(10, 5)] },
    { id: "dom-w-sypgl-lazienka", floor: PIETRO, points: [p(6.5, 5), p(6.5, 8)] },
  ];
}
```

- [ ] **Step 5: Obrysy pomieszczeń**

```ts
function pomieszczenia(): RoomShape[] {
  return [
    // --- Parter ---
    { id: "dom-r-garaz", floor: PARTER, name: GARAZ, type: "garaz", color: ROOM_COLORS[7],
      points: [p(0, 0), p(3, 0), p(3, 8), p(0, 8)] },
    { id: "dom-r-kuchnia", floor: PARTER, name: KUCHNIA, type: "kuchnia", color: ROOM_COLORS[1],
      points: [p(3, 0), p(5.5, 0), p(5.5, 3.5), p(3, 3.5)] },
    { id: "dom-r-salon", floor: PARTER, name: SALON, type: "salon", color: ROOM_COLORS[0],
      points: [p(5.5, 0), p(10, 0), p(10, 3.5), p(5.5, 3.5)] },
    // Hol jest literą L: pas 1,5 m przez całą szerokość plus przedsionek 2 × 3 m
    // przy drzwiach wejściowych. Typ „inne" jest ŚWIADOMY — komunikacja nie jest ani
    // pokojem, ani pomieszczeniem mokrym, a `ZASTOSOWANIE` daje jej kubełek „nieznane",
    // więc jej gniazda nie wpadają na obwód z pokojami.
    { id: "dom-r-hol", floor: PARTER, name: HOL, type: "inne", color: ROOM_COLORS[2],
      points: [p(3, 3.5), p(10, 3.5), p(10, 5), p(5, 5), p(5, 8), p(3, 8)] },
    { id: "dom-r-lazienka", floor: PARTER, name: LAZIENKA_D, type: "lazienka", color: ROOM_COLORS[3],
      points: [p(5, 5), p(7, 5), p(7, 8), p(5, 8)] },
    { id: "dom-r-pralnia", floor: PARTER, name: PRALNIA, type: "pralnia", color: ROOM_COLORS[4],
      points: [p(7, 5), p(8.5, 5), p(8.5, 8), p(7, 8)] },
    { id: "dom-r-kotlownia", floor: PARTER, name: KOTLOWNIA, type: "kotlownia", color: ROOM_COLORS[5],
      points: [p(8.5, 5), p(10, 5), p(10, 8), p(8.5, 8)] },

    // --- Piętro ---
    { id: "dom-r-syp1", floor: PIETRO, name: SYP1, type: "sypialnia", color: ROOM_COLORS[4],
      points: [p(3, 0), p(6.5, 0), p(6.5, 3.5), p(3, 3.5)] },
    { id: "dom-r-syp2", floor: PIETRO, name: SYP2, type: "sypialnia", color: ROOM_COLORS[6],
      points: [p(6.5, 0), p(10, 0), p(10, 3.5), p(6.5, 3.5)] },
    { id: "dom-r-korytarz", floor: PIETRO, name: KORYTARZ, type: "inne", color: ROOM_COLORS[2],
      points: [p(3, 3.5), p(10, 3.5), p(10, 5), p(3, 5)] },
    { id: "dom-r-sypgl", floor: PIETRO, name: SYP_GL, type: "sypialnia", color: ROOM_COLORS[0],
      points: [p(3, 5), p(6.5, 5), p(6.5, 8), p(3, 8)] },
    { id: "dom-r-lazienka-g", floor: PIETRO, name: LAZIENKA_G, type: "lazienka", color: ROOM_COLORS[3],
      points: [p(6.5, 5), p(10, 5), p(10, 8), p(6.5, 8)] },
  ];
}
```

- [ ] **Step 6: Otwory**

```ts
/** Drzwi. `angle` to kierunek ściany w tym miejscu: 0 — pozioma, π/2 — pionowa.
 *  `width` w jednostkach planu, czyli 18 jedn. = 90 cm.
 *
 *  Każde pomieszczenie ma drzwi do komunikacji — na parterze do Holu, na piętrze do
 *  Korytarza. Klatka schodowa nie potrzebuje otworu: kondygnacje łączy w modelu
 *  `pionMiedzyKondygnacjami`, a nie drzwi. */
function otwory(): Opening[] {
  const SZER = 18;
  const BRAMA = 48; // 2,4 m — brama garażowa
  const POZIOMA = 0;
  const PIONOWA = Math.PI / 2;
  return [
    // --- Parter ---
    { id: "dom-o-wejscie", floor: PARTER, wallId: "dom-w-obrys-p", ...p(4, 8), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-brama", floor: PARTER, wallId: "dom-w-obrys-p", ...p(0, 4), angle: PIONOWA, width: BRAMA, kind: "drzwi" },
    { id: "dom-o-garaz", floor: PARTER, wallId: "dom-w-garaz", ...p(3, 4.25), angle: PIONOWA, width: SZER, kind: "drzwi" },
    { id: "dom-o-kuchnia", floor: PARTER, wallId: "dom-w-dzienna-hol", ...p(4.25, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-salon", floor: PARTER, wallId: "dom-w-dzienna-hol", ...p(7, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-lazienka", floor: PARTER, wallId: "dom-w-hol-dol", ...p(6, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-pralnia", floor: PARTER, wallId: "dom-w-hol-dol", ...p(7.75, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-kotlownia", floor: PARTER, wallId: "dom-w-hol-dol", ...p(9.25, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },

    // --- Piętro ---
    { id: "dom-o-syp1", floor: PIETRO, wallId: "dom-w-gora-korytarz", ...p(4.75, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-syp2", floor: PIETRO, wallId: "dom-w-gora-korytarz", ...p(8.25, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-sypgl", floor: PIETRO, wallId: "dom-w-korytarz-dol", ...p(4.75, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-lazienka-g", floor: PIETRO, wallId: "dom-w-korytarz-dol", ...p(8.25, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
  ];
}
```

- [ ] **Step 7: Payload ze szkieletem**

```ts
function elementy(): InstallationElement[] {
  return [];
}

export function zbudujProjektDom(): ProjectPayload {
  const walls = sciany();
  const roomShapes = pomieszczenia();
  // PRZYKLEJANIE OSOBNO DLA KAŻDEJ KONDYGNACJI — `snapElementToWall` nie wie nic
  // o piętrach i dostając ściany całego budynku przykleiłaby gniazdo z piętra do
  // ściany parteru, która akurat leży bliżej.
  const elements = [PARTER, PIETRO].flatMap((f) =>
    przyklejDoScian(
      elementy().filter((e) => e.floor === f),
      walls.filter((w) => w.floor === f),
      roomShapes.filter((r) => r.floor === f)
    )
  );
  return {
    draft: { elements, walls, roomShapes, openings: otwory(), routeOverrides: {} },
    floors: [
      { id: PARTER, name: "Parter", heightM: 2.8 },
      { id: PIETRO, name: "Piętro", heightM: 2.6 },
    ],
    activeFloorId: PARTER,
    bgImages: {},
    scales: { [PARTER]: MANUAL_DRAW_SCALE_MPU, [PIETRO]: MANUAL_DRAW_SCALE_MPU },
    prices: { ...DEFAULT_PRICES },
    costOverrides: {},
    qtyOverrides: {},
    warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
    docHeader: {
      obiekt: "Dom jednorodzinny przykładowy, 136 m²",
      adres: "", zleceniodawca: "", wykonawca: "", uprawnienia: "", przyrzad: "",
      nrFabryczny: "", swiadectwo: "",
      data: new Date().toISOString().slice(0, 10),
      temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
      drawingNo: "E-01", revision: "A",
    },
    protocols: {},
    projectName: "Przykład: dom 136 m²",
    panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
    panelDevices: [],
    panelHidden: [],
    panelTryb: "zRzutu",
    panelOverrides: {},
    planSize: { w: 240, h: 200 },
    onboarding: { ...INITIAL_ONBOARDING, krok1Done: true, krok2Done: true, krok3Done: true, pominiety: true, ostatnioOtwarty: false },
    projektPrzykladowy: true,
  };
}
```

- [ ] **Step 8: Uruchom i commit**

```bash
npx tsc --noEmit && npx eslint src/lib/demo && npx vitest run src/lib/demo
git add -A && git commit -m "Dom przykladowy — szkielet obu kondygnacji

Sciany, obrysy i otwory, bez osprzetu. Parter 80 m2, pietro 56 m2 nad czescia
mieszkalna — piętra nie ma nad garazem, wiec obrysy kondygnacji sa rozne.

Korytarze 1,5 m, bo przy 1,0 m obrys wsuniety o ODSUNIECIE_TRASY z obu stron zostawia
pasek rowny MERGE_TOLERANCE i krawedzie scalaja sie w jeden wezel grafu tras.

Dwie lazienki maja ROZNE nazwy: pole room elementu to wolny tekst dopasowywany po
nazwie, wiec dwie 'Lazienki' zlalyby sie w jedno pomieszczenie przy grupowaniu obwodow.

Przyklejanie do scian wywolywane osobno dla kazdej kondygnacji — snapElementToWall nie
wie nic o pietrach.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Dom — osprzęt parteru

**Files:**
- Modify: `src/lib/demo/dom.ts` (`elementy()`)
- Modify: `src/lib/demo/dom.test.ts`

- [ ] **Step 1: Dopisz testy parteru (mają paść)**

```ts
describe("dom — parter", () => {
  const payload = zbudujProjektDom();
  const naParterze = payload.draft.elements.filter((e) => e.floor === "f1");

  it("ma rozdzielnicę główną i pięćdziesiąt elementów", () => {
    expect(naParterze.length).toBe(50);
    expect(naParterze.some((e) => e.type === "rozdzielnica")).toBe(true);
  });

  it("ładowarka EV, kocioł i pralka są dedykowane", () => {
    for (const id of ["demo-e-dom-ev", "demo-e-dom-kociol", "demo-e-dom-pralka"]) {
      const el = naParterze.find((e) => e.id === id);
      expect(el, id).toBeTruthy();
      expect(el!.dedicated, id).toBe(true);
    }
  });

  it("kotłownia i pralnia NIE dzielą obwodu gniazd z pokojami", () => {
    const rs = payload.draft.roomShapes.filter((r) => r.floor === "f1");
    const obwody = computeCircuits(naParterze, rs);
    const gospodarcze = new Set(["Kotłownia", "Pralnia"]);
    const mieszkalne = new Set(["Salon"]);
    for (const c of obwody) {
      const pokoje = new Set(c.elements.map((e) => e.room));
      const maGosp = [...pokoje].some((x) => gospodarcze.has(x));
      const maMieszk = [...pokoje].some((x) => mieszkalne.has(x));
      expect(maGosp && maMieszk, `obwód ${c.name} miesza gospodarcze z pokojami`).toBe(false);
    }
  });
});
```

Dopisz import `computeCircuits` z `@/lib/panel/circuits`.

- [ ] **Step 2: Uruchom — ma paść**

```bash
npx vitest run src/lib/demo/dom.test.ts
```

Oczekiwane: FAIL, `expected 0 to be 50`.

- [ ] **Step 3: Wpisz osprzęt parteru**

Zastąp `function elementy(): InstallationElement[] { return []; }` ciałem poniżej. Rozstaw pilnuje odstępu ≥ 0,8 m między symbolami — powód opisany w `mieszkanie.ts`.

```ts
function elementy(): InstallationElement[] {
  return [
    // ===================== PARTER =====================

    // --- Hol (L: pas 1,5 m + przedsionek 2 × 3 m) ---
    // Rozdzielnica i szafka zaraz za drzwiami, na ścianie przedsionka. Para łączników
    // SCHODOWYCH: jeden przy wejściu, drugi na końcu korytarza — w domu to najbardziej
    // typowe miejsce na taki układ.
    eP("dom-rozdzielnica", "rozdzielnica", HOL, 3.2, 6.6),
    eP("dom-szafka", "szafkaTeletech", HOL, 3.2, 5.4),
    eP("dom-hol-gn", "gniazdko", HOL, 3.2, 7.6),
    eP("dom-hol-sw", "wlacznikSchodowy", HOL, 4.8, 6.6),
    eP("dom-hol-dzwonek", "dzwonek", HOL, 4.8, 5.4),
    eP("dom-hol-lampa", "oswietlenie", HOL, 4, 6.2),
    eP("dom-hol-zewn", "oswietlenieZewn", HOL, 4.7, 7.8, { note: "Nad wejściem" }),
    eP("dom-kor-lampa", "oswietlenie", HOL, 7, 4.25),
    eP("dom-kor-sw", "wlacznikSchodowy", HOL, 9.8, 4.25),
    eP("dom-kor-gn", "gniazdko", HOL, 5.5, 3.7),
    eP("dom-hol-dym", "czujnikDymu", HOL, 5.5, 4.6),

    // --- Garaż ---
    eP("dom-ev", "ladowarkaEV", GARAZ, 0.25, 1.5, { dedicated: true, note: "Ładowarka EV" }),
    eP("dom-garaz-zewn", "oswietlenieZewn", GARAZ, 0.25, 0.6, { note: "Nad bramą" }),
    eP("dom-garaz-gn1", "gniazdkoHerm", GARAZ, 0.25, 6.5),
    eP("dom-garaz-gn2", "gniazdkoHerm", GARAZ, 2.75, 6.5),
    eP("dom-garaz-sw", "wlacznik", GARAZ, 2.75, 3.3),
    eP("dom-garaz-lampa1", "oswietlenie", GARAZ, 1.5, 2),
    eP("dom-garaz-lampa2", "oswietlenie", GARAZ, 1.5, 6),

    // --- Kuchnia (mokra) ---
    eP("dom-kuch-gn1", "gniazdko", KUCHNIA, 3.5, 0.25, { gangs: 2 }),
    eP("dom-kuch-gn2", "gniazdko", KUCHNIA, 4.5, 0.25, { gangs: 2 }),
    eP("dom-kuch-led", "tasmaLed", KUCHNIA, 5.25, 0.8, { note: "Podszafkowa" }),
    eP("dom-kuch-agd1", "wypustAGD", KUCHNIA, 5.25, 1.8, { dedicated: true, note: "Zmywarka" }),
    eP("dom-kuch-agd2", "wypustAGD", KUCHNIA, 5.25, 2.8, { dedicated: true, note: "Piekarnik" }),
    eP("dom-kuch-plyta", "gniazdko400", KUCHNIA, 3.25, 1.5, { dedicated: true, note: "Płyta indukcyjna" }),
    eP("dom-kuch-sw", "wlacznik", KUCHNIA, 3.25, 3.2),
    eP("dom-kuch-lampa", "oswietlenie", KUCHNIA, 4.3, 1.8),

    // --- Salon ---
    eP("dom-salon-gn1", "gniazdko", SALON, 6.2, 0.25, { gangs: 2 }),
    eP("dom-salon-roleta", "roleta", SALON, 7.2, 0.25),
    eP("dom-salon-gn2", "gniazdko", SALON, 8.2, 0.25),
    eP("dom-salon-tv", "rtvsat", SALON, 9.2, 0.25),
    eP("dom-salon-gn3", "gniazdko", SALON, 9.75, 1.5, { gangs: 2 }),
    eP("dom-salon-lan", "rj45", SALON, 9.75, 2.4),
    eP("dom-salon-gn4", "gniazdko", SALON, 5.75, 2.4),
    eP("dom-salon-sw", "sciemniacz", SALON, 7.9, 3.25),
    eP("dom-salon-lampa1", "oswietlenie", SALON, 7, 1.4),
    eP("dom-salon-lampa2", "oswietlenie", SALON, 8.6, 2.2),

    // --- Łazienka na parterze (mokra: hermetyczne, łącznik dwubiegunowy, strefy) ---
    eP("dom-laz-went", "wentylator", LAZIENKA_D, 6.7, 5.25),
    eP("dom-laz-gn", "gniazdkoHerm", LAZIENKA_D, 6.75, 6.2),
    eP("dom-laz-sw", "wlacznikDwubiegunowy", LAZIENKA_D, 6.75, 7.1),
    eP("dom-laz-lampa", "oswietlenie", LAZIENKA_D, 5.9, 6.6),
    eP("dom-laz-umywalka", "umywalka", LAZIENKA_D, 5.4, 5.6),
    eP("dom-laz-prysznic", "prysznic", LAZIENKA_D, 5.5, 7.5),

    // --- Pralnia (gospodarcza) ---
    eP("dom-pralka", "wypustAGD", PRALNIA, 8.25, 6, { dedicated: true, note: "Pralka" }),
    eP("dom-pralnia-gn", "gniazdkoHerm", PRALNIA, 8.25, 7),
    eP("dom-pralnia-sw", "wlacznik", PRALNIA, 7.25, 5.6),
    eP("dom-pralnia-lampa", "oswietlenie", PRALNIA, 7.6, 6.5),

    // --- Kotłownia (gospodarcza) ---
    eP("dom-kociol", "wypustAGD", KOTLOWNIA, 9.75, 6, { dedicated: true, note: "Kocioł gazowy" }),
    eP("dom-kotlownia-gn", "gniazdkoHerm", KOTLOWNIA, 9.75, 7),
    eP("dom-kotlownia-sw", "wlacznik", KOTLOWNIA, 8.75, 5.6),
    eP("dom-kotlownia-lampa", "oswietlenie", KOTLOWNIA, 9.1, 6.5),
  ];
}
```

- [ ] **Step 4: Uruchom testy parteru**

```bash
npx vitest run src/lib/demo/dom.test.ts
```

Oczekiwane: PASS. Gdyby „pięćdziesiąt elementów" nie zgadzało się o jeden–dwa, popraw liczbę w teście do faktycznej — ta liczba jest opisem, nie wymaganiem.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint src/lib/demo
git add -A && git commit -m "Dom — osprzet parteru

Piecdziesiat elementow: rozdzielnica glowna i szafka w przedsionku, ladowarka EV
w garazu, kociol i pralka na wypustach dedykowanych, oswietlenie zewnetrzne nad
wejsciem i nad brama, para lacznikow schodowych na komunikacji.

Test pilnuje rzeczy, ktorej mieszkanie nie umialo pokazac: kotlownia i pralnia nie
dziela obwodu gniazd z pokojami, bo maja inne ZASTOSOWANIE.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Dom — osprzęt piętra i podrozdzielnica

**Files:**
- Modify: `src/lib/demo/dom.ts` (`elementy()`)
- Modify: `src/lib/demo/dom.test.ts`

- [ ] **Step 1: Dopisz testy piętra (mają paść)**

```ts
describe("dom — piętro i podrozdzielnica", () => {
  const payload = zbudujProjektDom();
  const naPietrze = payload.draft.elements.filter((e) => e.floor === "f2");

  it("ma trzydzieści elementów", () => {
    expect(naPietrze.length).toBe(30);
  });

  it("podrozdzielnica jest rozpoznana jako rozdzielnica TEJ kondygnacji", () => {
    // Nie wystarczy, że na planie stoi drugi symbol: `findPanels` musi zwrócić wpis
    // dla f2, bo to od niego zależy i rysowanie tras piętra, i pominięcie pionu
    // przez strop w kosztorysie.
    const panele = findPanels(payload.draft.elements);
    expect(panele.poKondygnacji.has("f1")).toBe(true);
    expect(panele.poKondygnacji.has("f2")).toBe(true);
    expect(panele.glownaKondygnacja).toBe("f1");
  });

  it("piętro dostaje narysowane trasy ZASILANIA, nie tylko sterowania", () => {
    const rs = payload.draft.roomShapes.filter((r) => r.floor === "f2");
    const trasy = buildCableRoutes(
      findPanel(naPietrze),
      computeCircuits(naPietrze, rs),
      naPietrze,
      payload.draft.walls.filter((w) => w.floor === "f2"),
      rs,
      payload.draft.openings.filter((o) => o.floor === "f2"),
      1
    );
    expect(trasy.some((t) => t.kind === "zasilanie")).toBe(true);
  });
});
```

Dopisz importy `buildCableRoutes`, `findPanel`, `findPanels` z `@/lib/panel/loads`.

- [ ] **Step 2: Uruchom — ma paść**

```bash
npx vitest run src/lib/demo/dom.test.ts
```

Oczekiwane: FAIL, `expected 0 to be 30`.

- [ ] **Step 3: Dopisz osprzęt piętra**

Na końcu tablicy w `elementy()`, przed zamykającym `];`:

```ts
    // ===================== PIĘTRO =====================

    // --- Korytarz: PODROZDZIELNICA ---
    // Bez niej piętro nie dostałoby ani jednej trasy zasilania na rzucie
    // (`buildCableRoutes` szuka rozdzielnicy TEJ kondygnacji), a kosztorys doliczałby
    // pion przez strop do każdego obwodu.
    eG("dom-podrozdzielnica", "rozdzielnica", KORYTARZ, 3.25, 4.25),
    eG("dom-g-kor-lampa1", "oswietlenie", KORYTARZ, 5.5, 4.25),
    eG("dom-g-kor-lampa2", "oswietlenie", KORYTARZ, 8.5, 4.25),
    eG("dom-g-kor-sw1", "wlacznikSchodowy", KORYTARZ, 6.2, 3.7),
    eG("dom-g-kor-sw2", "wlacznikSchodowy", KORYTARZ, 9.75, 4.25),
    eG("dom-g-kor-gn", "gniazdko", KORYTARZ, 7, 3.7),
    eG("dom-g-kor-dym", "czujnikDymu", KORYTARZ, 6.6, 4.6),

    // --- Sypialnia 1 ---
    eG("dom-syp1-gn1", "gniazdko", SYP1, 3.7, 0.25, { gangs: 2 }),
    eG("dom-syp1-roleta", "roleta", SYP1, 4.7, 0.25),
    eG("dom-syp1-gn2", "gniazdko", SYP1, 5.7, 0.25, { gangs: 2 }),
    eG("dom-syp1-lan", "rj45", SYP1, 6.25, 1.5),
    eG("dom-syp1-sw", "sciemniacz", SYP1, 5.6, 3.25),
    eG("dom-syp1-lampa", "oswietlenie", SYP1, 4.7, 1.7),

    // --- Sypialnia 2 ---
    eG("dom-syp2-gn1", "gniazdko", SYP2, 7.2, 0.25, { gangs: 2 }),
    eG("dom-syp2-roleta", "roleta", SYP2, 8.2, 0.25),
    eG("dom-syp2-gn2", "gniazdko", SYP2, 9.2, 0.25, { gangs: 2 }),
    eG("dom-syp2-sw", "wlacznik", SYP2, 9.3, 3.25),
    eG("dom-syp2-lampa", "oswietlenie", SYP2, 8.2, 1.7),

    // --- Sypialnia główna ---
    eG("dom-sypgl-gn1", "gniazdko", SYP_GL, 3.7, 7.75, { gangs: 2 }),
    eG("dom-sypgl-roleta", "roleta", SYP_GL, 4.7, 7.75),
    eG("dom-sypgl-gn2", "gniazdko", SYP_GL, 5.7, 7.75, { gangs: 2 }),
    eG("dom-sypgl-lan", "rj45", SYP_GL, 6.25, 6.5),
    eG("dom-sypgl-sw", "sciemniacz", SYP_GL, 5.6, 5.25),
    eG("dom-sypgl-lampa", "oswietlenie", SYP_GL, 4.8, 6.4),

    // --- Łazienka na piętrze (mokra, z wanną) ---
    eG("dom-lazg-went", "wentylator", LAZIENKA_G, 7.1, 5.25),
    eG("dom-lazg-gn", "gniazdkoHerm", LAZIENKA_G, 9.75, 6.2),
    eG("dom-lazg-sw", "wlacznikDwubiegunowy", LAZIENKA_G, 9.75, 7.2),
    eG("dom-lazg-lampa", "oswietlenie", LAZIENKA_G, 8.5, 6.6),
    eG("dom-lazg-umywalka", "umywalka", LAZIENKA_G, 6.9, 6.3),
    eG("dom-lazg-wanna", "wanna", LAZIENKA_G, 7.2, 7.4),
```

- [ ] **Step 4: Uruchom i commit**

```bash
npx tsc --noEmit && npx eslint src/lib/demo && npx vitest run src/lib/demo
git add -A && git commit -m "Dom — osprzet pietra i podrozdzielnica

Trzydziesci elementow. Podrozdzielnica w korytarzu nie jest ozdoba: bez niej
buildCableRoutes nie narysowalby na pietrze ani jednej trasy zasilania (szuka
rozdzielnicy TEJ kondygnacji), a kosztorys doliczalby pion przez strop do kazdego obwodu.

Test nie poprzestaje na tym, ze na planie stoi drugi symbol — sprawdza, ze findPanels
zwraca wpis dla f2 i ze trasy zasilania na pietrze naprawde powstaja.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Dom do rejestru, pełne sprawdzenie, weryfikacja w aplikacji

**Files:**
- Modify: `src/lib/demo/index.ts`
- Create: `e2e/przyklad-dom.spec.ts`

- [ ] **Step 1: Dopisz dom do rejestru**

W `PRZYKLADY`, po wpisie mieszkania:

```ts
  {
    id: "dom",
    nazwa: "Dom 136 m², dwie kondygnacje",
    opis: "Parter z garażem, kotłownią i pralnią, piętro z sypialniami. Podrozdzielnica na piętrze zasila jego obwody.",
    fakty: ["136 m²", "12 pomieszczeń", "~80 elementów"],
    zaladuj: () => import("./dom"),
    eksport: "zbudujProjektDom",
  },
```

- [ ] **Step 2: Uruchom CAŁY zestaw jednostkowy**

```bash
npx vitest run
```

Teraz wspólny zestaw z Taska 4 leci **także na domu**. Spodziewaj się, że zapali się test przebiegu przewodów — to jest ryzyko numer jeden z planu i ze specu.

**Jeśli zostanie uparty skos:** przesuń oprawę albo łącznik tak, żeby zejście było prostopadłe, korzystając z doświadczenia z mieszkania (oprawa w osi punktu wejścia; łącznik dalej od narożnika wklęsłego). **Jeśli po trzech próbach nie ustąpi — przerwij i zgłoś to, zamiast wykrzywiać rzut.**

- [ ] **Step 3: Napisz e2e domu**

`e2e/przyklad-dom.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

test("dom otwiera się z dwiema kondygnacjami, a piętro ma trasy zasilania", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");

  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Piętro", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Piętro", exact: true }).click();
  // Podrozdzielnica jest na piętrze, więc trasy ZASILANIA mają tam powstać. Czytamy
  // je z zapisu, a nie ze sceny: scena bywa jeszcze nieustalona zaraz po przełączeniu.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const klucz = "pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy");
        const pr = JSON.parse(localStorage.getItem(klucz) ?? "{}") as { draft?: { elements?: { floor: string; type: string }[] } };
        return (pr.draft?.elements ?? []).filter((e) => e.floor === "f2" && e.type === "rozdzielnica").length;
      })
    )
    .toBe(1);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Widok frontu rozdzielnicy/)).toBeVisible();
});
```

- [ ] **Step 4: Pełne e2e**

```bash
npx playwright test --reporter=line
```

Oczekiwane: wszystko zielone (503 dotychczasowe + nowe).

- [ ] **Step 5: Sprawdź w aplikacji — tego testy nie złapią**

```bash
# serwer dev startuje przez narzędzie preview, nie przez Bash
```

1. Wczytaj dom z okna wyboru.
2. **Baner „elementy zostały w starych pokojach" ma się NIE pojawić.** Jeśli się pojawi — któryś element przykleił się do ściany po złej stronie; znajdź go porównaniem `pointInPolygon` z polem `room`.
3. Zrzut obu kondygnacji.
4. **Ocena bramy garażowej.** Otwór 2,4 m rysuje się łukiem skrzydła. Jeśli wygląda źle — usuń `dom-o-brama` i powiedz o tym wprost w podsumowaniu, zamiast zostawiać brzydki rysunek.
5. Sprawdź zakładki Rozdzielnica i Kosztorys.

- [ ] **Step 6: Sprawdź podział paczki**

```bash
npm run build
```

W wypisie `vite` mają być **osobne chunki** dla `mieszkanie` i `dom`. Jeśli wpadły do głównej paczki — dynamiczny import gdzieś się zgubił i trzeba go przywrócić, bo to był powód całej konstrukcji rejestru.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Dom w rejestrze przykladow

Okno wyboru pokazuje dwie karty, wspolny zestaw testow leci teraz na obu przykladach.
Nowy e2e: dom otwiera sie z dwiema kondygnacjami, a pietro ma wlasna rozdzielnice.

Sprawdzone po zbudowaniu, ze oba przyklady siedza w osobnych chunkach — to byl powod,
dla ktorego rejestr trzyma budowniczych za dynamicznym import().

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Przegląd planu względem specu

| Wymaganie ze specu | Zadanie |
|---|---|
| `src/lib/demo/` z `wspolne.ts`, `mieszkanie.ts`, `dom.ts`, `index.ts` | 1, 2, 5 |
| Metadane statyczne, budowniczy za `import()` | 2, sprawdzenie w 8 |
| `wczytajPrzyklad(id)` | 2 |
| Okno wyboru z rejestru, poza `showEntryScreen` | 3 |
| Link traci dopisek o mieszkaniu | 3 |
| Pasek przykładu bez „mieszkanie 70 m²" | 3 (znalezione przy planowaniu, poza specem) |
| Rzut parteru i piętra, `heightM`, różne obrysy | 5 |
| Osprzęt: EV, kocioł, pralka, oświetlenie zewnętrzne, dwie łazienki | 6, 7 |
| Podrozdzielnica rozpoznana przez `findPanels` | 7 |
| Wspólny zestaw testów po rejestrze | 4 |
| Uogólniona reguła drzwi do komunikacji | 4 |
| Trasy sprawdzane osobno na kondygnację | 4 |
| Rozdzielnica na każdej kondygnacji z elementami | 4 |
| Zgodność `fakty` z danymi | 2 |
| Pomocnik e2e + 12 wywołań w 8 plikach | 3 |
| `e2e/przyklad-dom.spec.ts` | 8 |
| Okno w `projekt-przykladowy.spec.ts` | 3 |
| Sprawdzenie w aplikacji, brama garażowa | 8 |
| Sprawdzenie podziału na chunki | 8 |
