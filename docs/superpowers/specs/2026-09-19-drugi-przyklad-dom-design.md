# Drugi projekt przykładowy — dom 136 m² na dwóch kondygnacjach

Data: 2026-09-19 · Status: zatwierdzony do implementacji

## Po co

Dziś przykład jest jeden: mieszkanie 70 m² na jednej kondygnacji, z jedną
rozdzielnicą. Kto wchodzi „zobaczyć, co ta strona robi", nie dowiaduje się z niego
o rzeczach, które aplikacja liczy i rysuje: o kondygnacjach, o pionach między nimi,
o podrozdzielnicy, o pomieszczeniach gospodarczych z osobnymi obwodami, o ładowarce
samochodowej.

Drugi przykład ma to pokazać — i ma być drugi, a nie zamiast. Mieszkanie zostaje
bez zmian.

## Czego przykład NIE obiecuje

Zakładka Rozdzielnica nie zna pojęcia podrozdzielnicy: `PanelTab` buduje **jedną
tablicę** z obwodów całego budynku i w `src/components/panel/` nie ma ani jednego
odwołania do `poKondygnacji`. Podrozdzielnica działa wyłącznie w dwóch miejscach:

- **rysunek** — `buildCableRoutes` dostaje elementy już przefiltrowane po kondygnacji
  (patrz komentarz przy `trasyPotrzebne` w `DesignTab.tsx`), więc `findPanel` znajduje
  rozdzielnicę **tej** kondygnacji. Piętro bez własnej rozdzielnicy nie dostaje ŻADNEJ
  trasy zasilania — zostają same linie sterowania łącznik→oprawa;
- **kosztorys** — `estimateRoutes` liczy obwody piętra od jego podrozdzielnicy i nie
  dolicza pionu przez strop (`pionMiedzyKondygnacjami`).

Karta przykładu w oknie wyboru mówi więc o podrozdzielnicy w kontekście rzutu
i kosztorysu, a nie zakładki Rozdzielnica. Rozszerzenie `PanelTab` o wiele tablic to
osobne, znacznie większe zadanie (dotyka doboru zabezpieczeń, schematu i PDF-ów)
i NIE wchodzi w zakres tej pracy.

## Architektura: rejestr przykładów

Nowy katalog `src/lib/demo/`:

| Plik | Zawartość |
|---|---|
| `wspolne.ts` | `p()`, `e()`, `przyklejDoScian`, wspólne stałe — dziś prywatne w `demoProjekt.ts` |
| `mieszkanie.ts` | przeniesione `demoProjekt.ts`, bez zmian merytorycznych |
| `dom.ts` | nowy przykład |
| `index.ts` | rejestr `PRZYKLADY` |

```ts
export const PRZYKLADY = [
  {
    id: "mieszkanie",
    nazwa: "Mieszkanie 70 m²",
    opis: "Blok, M4 z korytarzem. Sześć pomieszczeń, jedna rozdzielnica.",
    fakty: ["70 m²", "6 pomieszczeń", "48 elementów"],
    zaladuj: () => import("./mieszkanie"),
  },
  {
    id: "dom",
    nazwa: "Dom 136 m², dwie kondygnacje",
    opis: "Parter z garażem, kotłownią i pralnią, piętro z sypialniami. Podrozdzielnica na piętrze zasila jego obwody.",
    fakty: ["136 m²", "2 kondygnacje", "~80 elementów"],
    zaladuj: () => import("./dom"),
  },
] as const;
```

Liczby w `fakty` są wpisane ręcznie, więc mogą się rozjechać z danymi — pilnuje tego
test rejestru (patrz „Testy").

Metadane są **statyczne**, budowniczy siedzi za `import()`. Okno wyboru rysuje karty,
nie pobierając danych żadnego przykładu; po kliknięciu dociąga się wyłącznie wybrany.
Dzięki temu drugi przykład nie obciąża pierwszego — to był powód, dla którego
`wczytajPrzyklad` w store'rze używa dynamicznego importu, i ten powód zostaje w mocy.

`wczytajPrzyklad` w `useProjectStore` przyjmuje `id` i sięga do rejestru. Reszta tej
funkcji (zerowanie `cloudId`, `lastCloudSavedJson`, `znaneUpdatedAt`) bez zmian.

Trzeci przykład = jeden nowy plik i jeden wiersz w rejestrze. Bez dotykania store'a
ani UI.

## Okno wyboru

Nowy komponent `src/components/onboarding/WyborPrzykladu.tsx` (obok
`PasekPrzykladu.tsx`), na `Dialog`/`DialogContent` z `@/components/ui/dialog`, tak jak
`KompletDialog`. Karty renderowane **z rejestru**, każda jako `<button>` z nazwą
przykładu jako dostępną etykietą — na tym stoją testy e2e.

Link na ekranie startowym traci dopisek:
`Zobacz gotowy przykład — mieszkanie 70 m²` → `Zobacz gotowy przykład`.
Wzorzec `/Zobacz gotowy przykład/` w e2e dalej trafia.

**Okno renderuje się w `DesignTab` POZA warunkiem `showEntryScreen`.** Wybór przykładu
wczytuje projekt, ekran startowy natychmiast znika — okno osadzone w jego bloku
odmontowałoby się w połowie własnej akcji. To ta sama pułapka, którą komentarz
w `KompletDialog` opisuje dla przełączania zakładek.

Pasek „To jest projekt przykładowy" nad rzutem NIE dostaje przełącznika na drugi
przykład. Każda droga wejścia to kolejne miejsce do utrzymania, a nikt o nią nie prosił.

## Rzut domu

Dwie kondygnacje o **różnym obrysie** — piętra nie ma nad garażem. Skala
`MANUAL_DRAW_SCALE_MPU` na obu, narożniki na pełnym albo połówkowym metrze.

Korytarze mają **1,5 m**. To nie estetyka: obrys wchodzi do grafu tras wsunięty
o `ODSUNIECIE_TRASY` z każdej strony, więc z korytarza 1,0 m zostaje pasek równy
`MERGE_TOLERANCE` i obie jego krawędzie scalają się w jeden węzeł grafu. Powód
opisany szerzej w nagłówku `mieszkanie.ts`.

`heightM`: parter 2,8 m, piętro 2,6 m. Mieszkanie tego pola nie używa, a wchodzi ono
w spadek napięcia i w długość pionów.

### Parter — 10 × 8 m, 80 m²

```
x:  0        3      5.5            10
y=0 +--------+------+---------------+
    |        |KUCH- |               |
    | GARAŻ  | NIA  |    SALON      |
    |  24    | 8,75 |    15,75      |
3.5 |        +------+---------------+
    |        |        HOL  16,5     |
 5  |        +---+------+----+------+
    |        |   | ŁAZ. |PRAL|KOT-  |
 6  |        |   |  6   | 4,5|ŁOWNIA|
    |        |[we]|     |    |  4,5 |
 8  +--------+---+------+----+------+
```

Hol jest literą L: pas 1,5 m przez całą szerokość (y 3,5–5) plus przedsionek 2 × 3 m
przy drzwiach wejściowych (x 3–5, y 5–8). Każde pomieszczenie ma drzwi do holu,
łącznie z garażem.

Obrysy (metry od lewego górnego rogu):

| Pomieszczenie | Typ | Obrys | m² |
|---|---|---|---|
| Garaż | `garaz` | x 0–3, y 0–8 | 24 |
| Kuchnia | `kuchnia` | x 3–5,5, y 0–3,5 | 8,75 |
| Salon | `salon` | x 5,5–10, y 0–3,5 | 15,75 |
| Hol | `inne` | x 3–10, y 3,5–5 ∪ x 3–5, y 5–8 | 16,5 |
| Łazienka | `lazienka` | x 5–7, y 5–8 | 6 |
| Pralnia | `pralnia` | x 7–8,5, y 5–8 | 4,5 |
| Kotłownia | `kotlownia` | x 8,5–10, y 5–8 | 4,5 |

### Piętro — 7 × 8 m, 56 m² (nad x 3–10)

```
x:  3          6.5           10
y=0 +----------+-------------+
    | SYPIALNIA| SYPIALNIA 2 |
    |    1     |    12,25    |
3.5 |  12,25   |             |
    +----------+-------------+
 5  |     KORYTARZ  10,5     |
    +----------+-------------+
    | SYPIALNIA|  ŁAZIENKA   |
 8  |  gł. 10,5|    10,5     |
    +----------+-------------+
```

| Pomieszczenie | Typ | Obrys | m² |
|---|---|---|---|
| Sypialnia 1 | `sypialnia` | x 3–6,5, y 0–3,5 | 12,25 |
| Sypialnia 2 | `sypialnia` | x 6,5–10, y 0–3,5 | 12,25 |
| Korytarz | `inne` | x 3–10, y 3,5–5 | 10,5 |
| Sypialnia główna | `sypialnia` | x 3–6,5, y 5–8 | 10,5 |
| Łazienka | `lazienka` | x 6,5–10, y 5–8 | 10,5 |

**Razem 136 m².** Nazwa projektu: `Przykład: dom 136 m²`.

### Drzwi

Parter: wejście na y=8 przy x=4; garaż↔hol na x=3 przy y=4,25; kuchnia i salon
z holu na y=3,5; łazienka, pralnia i kotłownia z holu na y=5.
Piętro: cztery pomieszczenia z korytarza (dwa na y=3,5, dwa na y=5). Klatka schodowa
nie potrzebuje otworu — kondygnacje łączy `pionMiedzyKondygnacjami`, nie drzwi.

**Brama garażowa** — otwór 2,4 m na x=0 przy y=4. Aplikacja zna tylko `drzwi` i rysuje
je łukiem skrzydła, więc brama wyjdzie jako duży łuk. Do oceny wzrokowej przy
implementacji; jeśli wygląda źle — brama wypada i jest to powiedziane wprost.

## Instalacja

| Co | Gdzie | Czego nie ma w mieszkaniu |
|---|---|---|
| Rozdzielnica główna + szafka teletechniczna | Hol, przy wejściu | — |
| **Podrozdzielnica** | Korytarz na piętrze | Bez niej górny rzut nie ma tras zasilania |
| Ładowarka EV, obwód dedykowany | Garaż | Typ `ladowarkaEV` |
| Kocioł i pralka na wypustach dedykowanych | Kotłownia, pralnia | Pomieszczenia techniczne |
| Gniazdo warsztatowe | Garaż | Kubełek `gospodarcze` — patrz sprostowanie niżej |
| Oświetlenie zewnętrzne | Przy wejściu i przy bramie | Typ `oswietlenieZewn` |
| Dwie łazienki różnej wielkości | Parter i piętro | Strefy ochronne na obu kondygnacjach |

`panelConfig`: `supply3f: true`, `mainRating: 40`, `perRow: 12`.
`panelTryb: "zRzutu"`, `panelDevices: []` — rozdzielnica ma się odbudować z rzutu,
tak samo jak w mieszkaniu.
`planSize`: `{ w: 240, h: 200 }` — metr zapasu wokół większej z kondygnacji.

Około **80 elementów**: ~50 na parterze, ~30 na piętrze.

## Testy

### Wspólny zestaw dla każdego wpisu w rejestrze

Dzisiejsze `demoProjekt.test.ts` są przywiązane do jednej funkcji. Przechodzą
na pętlę po `PRZYKLADY`, więc dom jest od pierwszego dnia pilnowany przez wszystko,
czego nauczyło nas mieszkanie, a trzeci przykład dostanie to bez pisania:

- nazwa obiecuje metraż i metraż się zgadza;
- element **leży** w pomieszczeniu, które ma wpisane (strażnik przyciągania
  do ścian w pokojach wklęsłych);
- wszystko na zadeklarowanej kondygnacji i w obszarze planu;
- wypełnia rozdzielnicę i kosztorys;
- pomieszczenia mokre mają jawny typ;
- oznaczony jako przykład, bez podkładu, budowany od nowa przy każdym wywołaniu;
- każdy ukos jest odczepem pod 45°, skosy to <10% długości — **osobno dla każdej
  kondygnacji**;
- **każda kondygnacja z elementami ma na sobie rozdzielnicę** (nowy).

Reguła dostępności pomieszczeń zostaje uogólniona i przy okazji wzmocniona. Dziś
brzmi „każde pomieszczenie ma drzwi do *Przedpokoju*", czyli wisi na nazwie. Nowa:
**każde pomieszczenie niekomunikacyjne ma drzwi wspólne z pomieszczeniem typu
`inne`** — dla mieszkania to Przedpokój, dla domu Hol i Korytarz, bez konfiguracji
w rejestrze. Sama spójność grafu drzwi by nie wystarczyła, bo przepuściłaby sypialnię
dostępną przez kuchnię; ta reguła nie przepuszcza.

### Testy własne domu

- dwie kondygnacje, obie z elementami, obie z własną rozdzielnicą — i
  `findPanels().poKondygnacji` widzi obie, czyli podrozdzielnica jest rozpoznana jako
  podrozdzielnica, a nie jako drugi symbol na planie;
- `heightM` ustawione na obu kondygnacjach;
- ładowarka EV, kocioł i pralka są `dedicated` i dostają własne obwody;
- **Garaż** nie dzieli obwodu gniazd z Salonem (reguła `ZASTOSOWANIE`, kubełek
  `gospodarcze` kontra `mieszkalne`).

> **Sprostowanie, dopisane przy wykonaniu planu (zadanie 6).** Pierwotnie stało tu
> „kotłownia i pralnia nie dzielą obwodu gniazd z pokojami (reguła `ZASTOSOWANIE`)"
> i było to **nieprawdziwe co do mechanizmu**. `sucheWgZastosowania` w
> `lib/panel/circuits.ts` — funkcja realizująca regułę `ZASTOSOWANIE` — pracuje wyłącznie
> na gniazdach ZWYKŁYCH i wyłącznie w pomieszczeniach SUCHYCH. Tymczasem `WET_ROOM_TYPES`
> w `lib/design.ts` zawiera `pralnia` i `kotlownia`, więc oba te pomieszczenia są mokre
> i odcina je od pokoi wcześniejsza gałąź `byRoom`, a nie `ZASTOSOWANIE`. Test napisany
> pod pierwotną obietnicę przechodziłby nawet po usunięciu tej reguły z kodu.
>
> Z trzech typów o zastosowaniu `gospodarcze` (`pralnia`, `kotlownia`, `garaz`) suchy
> jest tylko **garaż**. Dlatego przykład dostał w garażu jedno zwykłe gniazdo warsztatowe,
> a test porównuje parę Garaż–Salon i ma osobną asercję, że obwód z tym gniazdem w ogóle
> istnieje. Liczba elementów parteru: 50 → 51.

### Rejestr

Identyfikatory unikalne, metadane niepuste, każdy wpis buduje się do poprawnego
payloadu — to on napędza pętlę wyżej.

Osobno: **liczby w `fakty` zgadzają się z danymi**. Metraż, liczba pomieszczeń
i liczba elementów są w rejestrze wpisane ręcznie, żeby okno mogło je pokazać bez
pobierania przykładu — więc rozjadą się przy pierwszej zmianie danych, jeśli nikt
tego nie pilnuje. Test parsuje je z `fakty` i porównuje z zbudowanym payloadem.
Liczba elementów z tyldą („~80") jest sprawdzana z tolerancją ±10%, metraż i liczba
pomieszczeń dokładnie.

### e2e

Nowy pomocnik w `e2e/_flow.ts`:

```ts
export async function wczytajPrzyklad(page: Page, id: "mieszkanie" | "dom"): Promise<void>
```

**12 istniejących wywołań w 8 plikach** przechodzi na
`wczytajPrzyklad(page, "mieszkanie")`. Ich asercje zostają nietknięte — zmienia się
wyłącznie sposób wejścia.

| Plik | Wywołań |
|---|---|
| `kopia-zapasowa.spec.ts` | 3 |
| `kafle-etapow.spec.ts` | 2 |
| `projekty-lokalne.spec.ts` | 2 |
| `dymki-rozdzielnicy.spec.ts` | 1 |
| `etykiety-grup.spec.ts` | 1 |
| `niepelny-zapis.spec.ts` | 1 |
| `projekt-przykladowy.spec.ts` | 1 |
| `stopka-zastrzezenie.spec.ts` | 1 |

Nowy `e2e/przyklad-dom.spec.ts`: wybór domu → przełącznik kondygnacji ma Parter
i Piętro → po przejściu na Piętro widać jego pomieszczenia → **na piętrze narysowane
są trasy zasilania** (wypłata z podrozdzielnicy) → Rozdzielnica i Kosztorys się
wypełniają.

Do `projekt-przykladowy.spec.ts` dochodzi samo okno: otwiera się, ma dwie karty,
Escape zamyka, wybór wczytuje właściwy przykład.

### Sprawdzenie w aplikacji

Testy tego nie złapią: baner „elementy zostały w starych pokojach" ma się nie
pojawić, zrzuty obu kondygnacji, ocena wzrokowa bramy garażowej.

## Ryzyka

1. **Skosy przewodów.** Przy mieszkaniu kosztowały kilka podejść, a tu obwodów jest
   więcej. Rzut jest projektowany pod to (korytarze 1,5 m, oprawy w osiach), ale jeśli
   zostanie uparty skos, którego nie da się usunąć bez wykrzywiania rzutu — zgłaszamy
   go, zamiast naciągać dane.
2. **Brama garażowa** — patrz wyżej.
3. **Rozmiar paczki.** Dom to kolejne ~400 linii danych. Osobny chunk za `import()`
   trzyma to poza główną paczką; do sprawdzenia po `npm run build`, czy podział
   naprawdę zaszedł.
