# Redesign interfejsu — ewolucja tożsamości „rysunek techniczny + miedź”

Data: 2026-11-04 · Status: zatwierdzony do implementacji (wariant A)

## Po co

Audyt wizualny (390 i 1366 px: start, Instalacja, Rozdzielnica, Kosztorys, lista
kalkulatorów, „Dobór obwodu”) dał ocenę 6,5/10. Tożsamość jest dobra i spójna,
kontrast już przeszedł audyt axe — słaba jest dyscyplina systemu: każdy ekran był
dopracowywany osobno. Celem jest jeden system projektowy wdrożony konsekwentnie,
bez zmiany tożsamości, logiki obliczeń, modułów ani danych.

## Problemy, które redesign rozwiązuje

1. Brak skali typografii: 17 rozmiarów w px (8,5–23), ok. 120 miejsc z 10–11 px.
2. Wynik obliczeń nie jest bohaterem — w „Doborze obwodu” „2,5 mm²” jest mniejsze
   od komunikatu „Bez oceny warunku” pod nim.
3. Pigułki „Cofnij / Dalej” (`position: fixed`, tylko ≥ md) unoszą się nad treścią.
4. Telefon: zakładki ucięte w pół słowa, kroki 01–04 wyjeżdżają poza ekran, nazwa
   projektu łamie się na dwie linie.
5. Lista kalkulatorów: 19 jednakowych kafli bez ikon i bez skrótu do ostatnich.
6. Kosztorys: nie widać, co jest edytowalne (ilość wygląda na wyłączoną, wartość
   wyliczana wygląda jak pole); suma nie jest przyklejona.
7. Niespójne komponenty: `Button` + `.pe-btn-copper` + `.pe-btn-ghost` (~40 użyć
   klas), promienie 3/5/6/7 px, cienie ad hoc.
8. Drobiazgi: logo w stopce ~8 px; karuzela „Co z tego powstanie” ucięta bez
   wskaźnika na telefonie.

## 1. Tokeny kolorów

Zmienne CSS na `:root` w `src/index.css`, mapowane w `tailwind.config.ts`
(Tailwind dalej używa nazw klas, wartości idą ze zmiennych).

| Rola | Token | Wartość |
|---|---|---|
| Główny (linki, focus, zaznaczenie, info) | `blueprint` | `#2D5A8C`, hover `#244A73`, tło `#EAF0F6` |
| Akcent (jedna akcja główna na ekran) | `copper` | `#9A5A27`, hover `#86501F`, tło `#F7EEE6` |
| Tło strony | `paper` | `#EEF1F4` |
| Karta | `surface` | `#FFFFFF` |
| Tło wartości tylko do odczytu, nagłówki tabel | `surface-2` | `#F7F9FA` |
| Tekst | `ink` / `slate-500` / `slate-400` | `#16202B` / `#4F5D73` / `#5B6A80` (bez zmian, AA) |
| Obramowanie | `border` / `border-strong` | `#DFE4E9` / `#C7D0D9` |
| Sukces | `success` | tekst `#2C6B4A`, grafika `#3B8C63`, tło `#EBF3EF` |
| Ostrzeżenie | `caution` | tekst `#8A5526`, tło `#F9F1EB` |
| Błąd | `danger` | tekst `#A2352C`, grafika `#C6433A`, tło `#F9ECEB` |

`ok` i `warn` zostają jako aliasy (`warn` = `danger`), żeby nie przepisywać
wszystkiego w jednym kroku; nowe miejsca używają nazw semantycznych. Stałe hex
w stylach inline (np. `WERDYKT_STYL` w `CalcResultView.tsx`) przechodzą na tokeny.
Kolory danych rysunku, PDF-ów i legend — **bez zmian**.

## 2. Typografia

Skala w `tailwind.config.ts` (`fontSize`), nazwy zamiast `text-[11px]`:

| Token | px / line-height | Użycie |
|---|---|---|
| `text-caption` | 12 / 16 | podpisy, znaczniki, stopki — minimum interfejsu |
| `text-sm` | 13 / 18 | tekst drugorzędny, etykiety pól |
| `text-base` | 14 / 20 | tekst interfejsu |
| `text-md` | 16 / 24 | pola formularzy na telefonie, tekst czytany |
| `text-lg` | 18 / 26 | tytuły kart |
| `text-xl` | 22 / 28 | tytuły stron |
| `text-hero` | 30 / 36 | wartość wyniku głównego |

- Uwaga: `text-sm` i `text-base` mają dziś domyślne wartości Tailwinda (14 i 16 px).
  Przedefiniowanie zmienia je w całej aplikacji — to zamierzone, ale PR 1 przegląda
  wszystkie widoki przed/po, a miejsca, które mają zostać większe, dostają `text-md`.
- Nic w interfejsie poniżej 12 px. Wyjątek: napisy na płótnie Konva i w PDF.
- Pola `input`/`select` mają 16 px poniżej `md` (iOS nie powiększa strony).
- Liczby: IBM Plex Mono, `tabular-nums` (klasa `pe-mono` zostaje).
- Pozostałe `text-[Npx]` są mapowane na najbliższy token; reguła lint/grep
  w kontroli jakości pilnuje, żeby nie wróciły (`text-\[\d` w `src/**/*.tsx` = 0,
  poza plikami rysunku z uzasadnieniem w komentarzu).

## 3. Odstępy, zaokrąglenia, cienie

- Zaokrąglenia: `rounded-sm` 6 px (pola, przyciski, znaczniki), `rounded-card`
  10 px (karty, panele), `rounded-xl` 14 px (dialogi, arkusze). Inne wartości znikają.
- Cienie: `shadow-xs` (karta: `0 1px 2px rgb(22 32 43 / .06)`) i `shadow-pop`
  (dialog, menu, przyklejone paski: `0 8px 24px rgb(22 32 43 / .12)`).
- Odstępy: siatka 4 px Tailwinda bez zmian; karty `p-5` (desktop) / `p-4` (telefon).

## 4. Komponenty

Wszystkie w `src/components/ui/`.

- **`Button`** (rozszerzenie istniejącego `button.tsx`):
  warianty `primary` (miedź), `secondary` (obramowany), `subtle` (bez ramki),
  `danger`, `link`; rozmiary `sm` 32, `md` 40, `lg` 48 px — poniżej `md` minimum
  44 px dla akcji głównych; stany hover / active (`scale-[.98]`) / focus-visible
  (pierścień 2 px `blueprint`) / disabled / `loading` (spinner + `aria-busy`,
  szerokość bez skoku). Stare nazwy `copper`/`ghost`/`destructive` jako aliasy.
  Klasy `.pe-btn-copper` / `.pe-btn-ghost` — wszystkie użycia przechodzą na
  `Button`, klasy usunięte z arkusza.
- **`Field` / pole liczbowe** (`calculators/Field.tsx` i odpowiedniki):
  etykieta nad polem, jednostka WEWNĄTRZ pola (sufiks), podpowiedź i błąd pod
  polem powiązane `aria-describedby`.
- **`select`**: zostaje natywny (najlepszy na telefonie), wspólna klasa
  `pe-select` z własną strzałką; Radix Select bez zmian tam, gdzie już jest.
- **`Card`**: `rounded-card border bg-surface shadow-xs`, nagłówek `text-lg`.
- **`Badge`**: zastępuje `pe-chip` + `pe-tag-*` (warianty neutral / info /
  success / caution / danger / accent), `text-caption`.
- **`Alert`**: info / success / caution / danger z ikoną, `text-base`;
  zastępuje ręcznie stylowane ramki komunikatów.

## 5. Nawigacja i telefon

- **Nagłówek < md**: logo + nazwa projektu (jedna linia, wielokropek) + przycisk
  menu. Kalkulatory, Protokoły, Dokumentacja, Pomoc, logowanie i nowy projekt —
  w wysuwanym panelu (Radix Dialog jako arkusz od prawej). Na ≥ md bez zmian
  układu, tylko tokeny.
- **Kroki 01–04 < md**: zwarty pasek czterech segmentów (numer + krótka nazwa),
  wszystkie widoczne naraz, aktywny wyróżniony, pasek postępu pod spodem.
- **Dolny pasek kroku**: na Rozdzielnicy, Schemacie i Kosztorysie przyklejony do
  dołu pasek „← Cofnij: X / Dalej: Y →” (ten sam wzorzec co pasek stanu
  Instalacji, który już ma „Dalej: Rozdzielnica”). Pływające pigułki z `App.tsx`
  znikają; logika `pobierzZawczasu` przechodzi na przyciski paska. Na telefonie
  pasek ma `padding-bottom: env(safe-area-inset-bottom)`.
- Stopka: logo czytelne (min. 16 px wysokości).
- Ekran startowy < md: „Co z tego powstanie” jako siatka 2×2 zamiast uciętej
  karuzeli.

## 6. Kalkulatory i wyniki

- **`WynikGlowny`** (nowy, `calculators/WynikGlowny.tsx`): etykieta
  (`text-sm`), wartość (`text-hero`, mono) + jednostka, wartości pomocnicze jako
  `Badge`, pod spodem `PasekWerdyktu`. Tylko prezentacja — dostaje gotowe
  wartości, zero matematyki (ta sama zasada co `CalcResultView`).
  Wchodzi do wszystkich 19 kalkulatorów w miejsce obecnych ramek wyniku.
- **`CalcResultView`**: tekst rachunku, założeń i błędów z 11–11,5 px na
  `text-sm`/`text-base`; kolory na tokeny.
- **Lista kalkulatorów**: ikona lucide przy każdym kalkulatorze (mapa w
  `NawigacjaKalkulatorow.tsx`), sekcja „Ostatnio używane” — 4 ostatnie, zapis
  w `localStorage` w try/catch, bez danych → sekcji nie ma.
- Werdykt i wynik główny są w DOM przed rachunkiem krok po kroku.

## 7. Kosztorys i tabele

- Edytowalne: prawdziwe pola (`Field`). Wyliczane (wartość pozycji): zwykły tekst
  mono na `surface-2`. Ilość z rzutu: pole edytowalne + `Badge` „z rzutu”, który
  znika po ręcznej zmianie (obecne zachowanie z krzyżykiem przywracania zostaje).
- Suma (netto, VAT, brutto) w przyklejonym pasku na dole widoku Kosztorysu.
- < md: wiersz pozycji jako blok (nazwa, pod nią ilość × cena = wartość).
- Wspólny styl tabeli (`pe-table`: nagłówek `surface-2`, `text-sm`, liczby do
  prawej, mono) w Kosztorysie, „Doborze obwodów” Rozdzielnicy i Protokołach.

## 8. Ruch

- Czasy: `--dur-fast: 120ms`, `--dur-base: 200ms`, `ease-out`.
- Dialog/arkusz: przenikanie + `scale(.98→1)` / wjazd z boku; przycisk:
  wciśnięcie; karta kalkulatora: przenikanie przy zmianie kalkulatora.
- Wczytywanie zakładki: szkielet układu zamiast samego „Wczytywanie…”.
- `@media (prefers-reduced-motion: reduce)`: wszystkie powyższe wyłączone
  (istniejące reguły onboardingu zostają).

## 9. Dostępność

- Focus widoczny wszędzie (pierścień 2 px, offset 2 px), także na kafelkach
  kroków i pozycjach listy kalkulatorów.
- Cele dotykowe ≥ 24 px (już jest, #234) — akcje główne na telefonie ≥ 44 px.
- Kontrast nowych par sprawdzony (tekst ≥ 4,5:1, grafika ≥ 3:1); axe w e2e
  bez nowych naruszeń.
- Arkusz menu: pułapka fokusu i Escape (Radix Dialog), przycisk z `aria-label`.

## Poza zakresem

Kolory i symbole rysunku, PDF-y, tryb ciemny, podpisy przy ikonach narzędzi
(odrzucone 2026-09-13), przycinanie siatki do rzutu (odrzucone), baner cookies,
zmiany logiki obliczeń, układu edytora Instalacji poza tokenami.

## Wdrożenie

Gałąź bazowa `redesign-ewolucja` od `main`; pięć PR-ów, każdy zielony osobno:

1. Tokeny kolorów, typografii, zaokrągleń i cieni + migracja `text-[Npx]`.
2. Komponenty: `Button`, `Field`, `pe-select`, `Card`, `Badge`, `Alert`;
   usunięcie `.pe-btn-*`, `pe-chip`/`pe-tag-*`.
3. Nawigacja i telefon: nagłówek, arkusz menu, kroki, dolny pasek kroku, stopka,
   ekran startowy.
4. Kalkulatory: `WynikGlowny` w 19 kalkulatorach, lista z ikonami i ostatnimi.
5. Kosztorys i tabele, ruch, szkielety; kontrola jakości.

## Kontrola jakości (każdy PR)

- `npm run typecheck`, `npm run lint`, `npm test`, pełne `npm run e2e`
  (wynik czytany z pełnego podsumowania, nie z ostatniej linii).
- Zrzuty przed/po na 360, 390, 430, 768, 1024, 1366, 1920 px: start, Instalacja
  (przykład 70 m²), Rozdzielnica, Schemat, Kosztorys, lista kalkulatorów,
  „Dobór obwodu”, Protokoły — w opisie PR.
- Brak poziomego przewijania strony na żadnej szerokości
  (`document.documentElement.scrollWidth <= innerWidth`).
- Konsola bez błędów na każdym z widoków.
- Żaden kalkulator, moduł ani przycisk nie znika (porównanie listy przycisków
  i nagłówków przed/po).
