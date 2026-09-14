# Migracja PomocnikElektryka.jsx → TypeScript + Zustand + Konva + Radix

Ten projekt to **realny, zweryfikowany szkielet startowy**, nie makieta. Wszystko
poniżej zostało faktycznie zainstalowane i sprawdzone w tym środowisku:

| Sprawdzenie | Wynik |
|---|---|
| `npm install` | bez błędów |
| `npx tsc --noEmit` | ✅ przechodzi czysto |
| `npx vitest run` | ✅ 149/149 testów jednostkowych |
| `npx playwright test` | ✅ 2/2 testów e2e (klik na płótnie Konvy przez prawdziwą przeglądarkę) |
| `npx vite build` | ✅ build produkcyjny, dzielony na chunki (patrz krok 11) |

Podczas weryfikacji TypeScript faktycznie złapał błąd (nieużywany import w
`dialog.tsx`) — dokładnie ten rodzaj pomyłki, który w oryginalnym pliku JS
(np. odwołanie do usuniętej stałej `ROW_MODULES`, wywołanie jeszcze
nieistniejącej funkcji `downloadPanelLegendPdf`) wykrywaliśmy dopiero przy
kompilacji przez esbuild albo — gorzej — dopiero w Twoim zgłoszeniu błędu.

## Co jest gotowe

- **Konfiguracja**: Vite + TypeScript (strict), Tailwind z paletą przeniesioną
  jako właściwy motyw (`tailwind.config.ts`), ESLint, Vitest, Playwright.
- **`src/types/index.ts`** — typy domenowe (`InstallationElement`, `Wall`,
  `RoomShape`, `Circuit`, `PanelDevice`, `DocumentHeader` itd.), przeniesione
  z kształtów obiektów, które w wersji JS istniały tylko "w praktyce".
- **`src/store/useProjectStore.ts`** — działający store Zustand z historią
  cofnij/ponów (ten sam mechanizm co `useHistory()` w JS), zarządzaniem
  kondygnacjami, podkładami, cenami. **6 testów jednostkowych**, w tym test
  potwierdzający, że przeciąganie (`commit:false`) nie zapycha historii.
- **`src/lib/electrical.ts`** — czyste funkcje obliczeniowe (prąd, spadek
  napięcia, dobór przewodu, impedancja pętli zwarcia) wydzielone z UI.
  **8 testów** z tymi samymi wartościami kontrolnymi (B16→80A/2,88Ω,
  C16→160A/1,44Ω), którymi ręcznie weryfikowałem kalkulator w wersji JS.
- **`src/components/ui/`** — `Button` (warianty = dawne klasy `.pe-btn-copper`
  / `.pe-btn-ghost`) i `Dialog` oparty na Radix. Dialog dostaje za darmo
  focus-trap, zamykanie Escape i przywracanie fokusu — czego własne modale
  z `<div>` w wersji JS nie miały.
- **`src/App.tsx`** — działająca (nie tylko kompilująca się) powłoka
  łącząca store, Button i Dialog: dodawanie kondygnacji przez realny dialog.
- **`e2e/floors.spec.ts`** — przykładowy test Playwright na tym scenariuszu.

## Czego NIE zrobiłem (i dlaczego)

Oryginalny plik ma ok. 5300 linii i sześć rozbudowanych zakładek (Kalkulatory,
Protokoły pomiarowe, Zaprojektuj instalację, Rozdzielnica, Schemat, Kosztorys).
Przepisanie całości na TS + Konva w tym szkielecie nie było realne bez utraty
jakości — wolałem dać Ci solidny, przetestowany fundament niż powierzchowną,
nieprzetestowaną migrację 5000 linii. Priorytet portowania poniżej.

## Kolejność migracji (proponowana)

1. ~~**`electrical.ts`** → reszta kalkulatorów z `CalculatorsTab`~~ **zrobione.**
   Dopisano `calcPowerBalance` (bilans mocy) i `calcLighting` (oświetlenie),
   z testami kontrolnymi. Cały `CalculatorsTab` (6 kalkulatorów: przewód,
   spadek napięcia, bilans mocy, pętla zwarcia, oświetlenie, RCD) przeniesiony
   do `src/components/calculators/` (`CalculatorsTab.tsx`, `Card.tsx`,
   `Field.tsx`, `HowItWorks.tsx`) i podpięty jako zakładka w `App.tsx`.
   Klasy `.pe-*` potrzebne tym komponentom przeniesione do `src/index.css`
   (`@layer components`) — reszta (`.pe-grid-paper`, `.pe-modal-backdrop`,
   `.pe-tab-floor`…) czeka na moduły, które ich faktycznie używają.
2. ~~**`useProjectStore.ts`** → akcje dla `roomShapes`~~ **zrobione.**
   Dopisano `addRoomShape`, `renameRoomShape` (synchronizuje `element.room`),
   `recolorRoomShape`, `deleteRoomShape`, `removeElements` (usuwanie
   wielokrotne) — z testami (`useProjectStore.test.ts`). Kolor/nazwa
   pomieszczeń wydzielone jako czyste funkcje w `src/lib/design.ts`
   (`roomColorForIndex`, `nextRoomName`, `nextRoomColor`).
3. ~~**Płótno projektowania**~~ **zrobione (pierwsza, okrojona wersja).**
   `src/components/design/` — `DesignCanvas.tsx` (Konva: Stage/Layer, siatka,
   ściany, pomieszczenia, elementy; klik-dodawanie, przeciąganie z natywnym
   `draggable`, zaznaczanie pojedyncze/Shift-wielokrotne, rysowanie
   ścian/pomieszczeń, Ctrl+scroll zoom), `ElementLibrary.tsx`, `RoomPanel.tsx`,
   `DesignTab.tsx` (spina to ze store'em, obsługa Delete/Escape, modal
   nazywania pomieszczenia). Katalog typów elementów przeniesiony do
   `src/lib/elements.ts`, geometria (`pointInPolygon`, `snap`, `clampNum`) do
   `src/lib/geometry.ts`, z testami.

   **Napotkany i naprawiony błąd Konvy:** `layer.batchDraw()` planuje
   przerysowanie mapy trafień (hit canvas) przez `requestAnimationFrame`;
   w tabie bez fokusu/widoczności przeglądarka może to trwale wstrzymać, więc
   świeżo dodany element/ściana/pomieszczenie nie były klikalne. Naprawione
   przez synchroniczne `layer.draw()` w `useEffect` (`DesignCanvas.tsx`).

   **Uzupełnione później:** pełna biblioteka elementów — akordeon sekcji,
   szukajka i wybór liczby gniazd/klawiszy w ramce (`VARIANTS_FOR`,
   `LIB_SUBTITLES`, `libSubtitle()` w `elements.ts`; własny licznik `gangs`
   per typ w `DesignTab`, jak w wersji JS). `EditElementModal` też dostał
   picker gangs. Sprawdzone ręcznie w przeglądarce: wybór wariantu (np. 4
   gniazda w ramce) i flaga „dedykowane” poprawnie zapisują się przy
   stawianiu elementu i utrzymują po ponownym otwarciu edycji.

   **Uzupełnione później:** zaznaczanie prostokątem (marquee) w trybie
   „Zaznacz” — przeciągnięcie na pustym płótnie zaznacza wszystkie elementy,
   których punkt bazowy mieści się w narysowanym prostokącie. Grupowe
   przeciąganie — gdy przeciągany element jest częścią większego
   zaznaczenia, cała grupa przesuwa się razem (pozycje pozostałych węzłów
   Konvy aktualizowane imperatywnie w `onDragMove` dla płynności, commit do
   store'a jedną akcją `onMoveElements` w `onDragEnd`, więc to jeden krok
   historii cofnij/ponów).

   **Napotkany i naprawiony błąd:** `handleStageMouseUp` czytał bieżący
   prostokąt zaznaczenia ze stanu Reacta (`marqueeRect`) zamiast z refa —
   przy skompresowanych w czasie zdarzeniach (kilka `mousemove` + `mouseup`
   w jednej turze, np. przy automatyzacji lub bardzo szybkim geście) React
   batchuje aktualizacje stanu, więc handler widział nieaktualną wartość
   sprzed ostatniego `mousemove`. Naprawione przez dodanie `marqueeRectRef`
   jako źródła prawdy (stan zostaje tylko do renderowania podglądu).

   **Uzupełnione później:** kalibracja skali planu — tryb „Kalibracja skali”,
   dwa kliknięcia na planie + podana długość rzeczywista w metrach liczą
   metry-na-jednostkę (`scaleOf` w `design.ts`, akcje `setScale`/`clearScale`
   w store, `scales: Record<floorId, number>` sprzątane przy usuwaniu
   kondygnacji jak `bgImages`). Podkład (obraz tła) — wgrywanie pliku przez
   `FileReader`→data URL (`setBgImage`, już istniejące w store), renderowany
   w Konvie przez `Image` z małym hookiem `useBackgroundImage` (ładuje
   `HTMLImageElement`, bez dodawania zależności typu `use-image`). Sprawdzone
   w przeglądarce: kalibracja 200 jedn. planu = 4 m dała poprawnie 2,00 cm/jedn.;
   wgranie i usunięcie testowego PNG jako podkładu zadziałało bez błędów.

   **Uzupełnione później:** menu kontekstowe (PPM) na elemencie/ścianie —
   „Edytuj”/„Usuń” (lub „Usuń zaznaczone” przy wielokrotnym zaznaczeniu,
   „Usuń ścianę” dla ściany), zamykane kliknięciem poza menu lub Escape.
   Strefy ochronne łazienki — `SANITARY_ZONES`/`computeSanitaryZones` w
   `elements.ts` (4 testy), rysowane wokół wanny/prysznica/umywalki na
   planie z przełącznikiem widoczności w toolbarze; bez kalibracji skali
   używają poglądowego przelicznika (2 cm/jednostkę), tak jak w oryginale.
   Sprawdzone w przeglądarce: menu kontekstowe otwiera się PPM, „Usuń”
   faktycznie kasuje element (zweryfikowane ponownym podwójnym kliknięciem
   w to samo miejsce — modal edycji już się nie otwiera).

   **Napotkany i naprawiony błąd (osobny od kodu):** po dodaniu importu
   `Image` z `react-konva` pojawiły się mylące błędy w konsoli
   (`Cannot read properties of undefined`, `useState is not defined`)
   pochodzące z `.vite/deps/chunk-*.js` — nieaktualny cache pre-bundlingu
   zależności Vite. Naprawione przez wyczyszczenie `node_modules/.vite`
   i restart serwera deweloperskiego; nie była to regresja w kodzie
   źródłowym.

   **Nadal pominięte** (uproszczenia względem wersji JS): brak pełnych
   piktogramów (`GlyphPreview`) — nadal plakietka kod+kolor zamiast
   właściwych symboli rysunku instalacyjnego.
4. ~~**PDF (silnik + legenda rozdzielnicy)**~~ **zrobione (silnik gotowy, protokoły
   pomiarowe czekają na `ProtocolsTab`).** `src/lib/pdf/engine.ts` — `createPdfDoc`
   przeniesiony niemal 1:1, z jedną świadomą zmianą: `finish()` zwraca teraz same
   bajty (`Uint8Array`) zamiast od razu wywoływać pobieranie — dzięki temu samo
   składanie PDF-a jest testowalne bez DOM-u. Efekt uboczny pobierania wydzielony
   do `download.ts` (`downloadBlob`, `downloadPdfBytes`). `titleBlock.ts` —
   `drawTitleBlock`. `panelLegend.ts` — `buildPanelLegendPdf` (czysta funkcja,
   zwraca bajty) + `downloadPanelLegendPdf` (cienki wrapper z pobieraniem).
   24 testy (`engine.test.ts`, `panelLegend.test.ts`), w tym paginacja
   wielostronicowa i poprawność nagłówka/trailera PDF.

   **Znaleziony (nieznany zakres w oryginale) problem renderowania polskich
   znaków:** wygenerowany PDF sprawdzony realnie (zapisany na dysk i odczytany)
   pokazał, że part akcentowanych liter (ą, ę, ś, ż — mapowanych przez
   `/Differences` na nazwy glifów `aogonek`/`eogonek`/`sacute`/`zdotaccent`)
   nie renderuje się w co najmniej jednej przeglądarce PDF (wypadają jako puste
   miejsce), podczas gdy inne (ł→`lslash`, ó→`oacute`) renderują się poprawnie.
   To wynika z polegania na podstawieniu fontu Helvetica przez czytnik (bez
   osadzonego pliku fontu) — nazwy glifów są poprawnymi wpisami Adobe Glyph
   List, ale nie każdy czytnik ma dla nich kształt w swoim foncie zastępczym.
   Ten mechanizm jest przeniesiony 1:1 z oryginału (te same tablice
   `PDF_POLISH`/`PDF_DIFF_NAMES`) — nie jest to regresja portu, tylko odziedziczone
   ograniczenie podejścia "font bez osadzonych glifów". Wymaga sprawdzenia w
   docelowych przeglądarkach/czytnikach przed produkcyjnym użyciem; solidną
   naprawą byłoby osadzenie realnego pliku fontu z pełnym zestawem znaków.
5. ~~**Modale**~~ **częściowo zrobione.** `src/components/design/EditElementModal.tsx`
   przeniesiony na wzorze `Dialog` z tego szkieletu i realnie podpięty — podwójny
   klik na elemencie w `DesignCanvas` (nowy `onEditElement`/`onDblClick`) otwiera
   edycję typu, pomieszczenia (z podpowiedziami z bieżącej kondygnacji) i flagi
   „dedykowane” dla gniazdek. Sprawdzone ręcznie w przeglądarce: zmiana zapisuje
   się i utrzymuje po ponownym otwarciu. Uproszczenie: bez wyboru liczby
   gniazd/klawiszy w ramce, spójnie z resztą kroku 3 (`gangs` zawsze `1`).

   **`AuthModal` i `ProjectsModal` świadomie pominięte** — obydwa są w
   oryginale całkowicie zależne od integracji z Supabase (`supaSignIn`,
   `supaSignUp`, `supaListProjects`, `supaDeleteProject`), a ta nie jest
   jeszcze przeniesiona (patrz „Znane ograniczenia” niżej). Port samego UI
   bez działającego backendu dałby martwą powłokę bez możliwości weryfikacji
   — do zrobienia razem z integracją Supabase.
6. ~~**Rozdzielnica elektryczna**~~ **zrobione.** Wymagało przeniesienia całego
   „mostu” obwodów, którego wcześniej nie było: `src/lib/panel/circuits.ts` —
   `computeCircuits` (heurystyka grupowania elementów planu w obwody — EV i
   gniazda 400V/dedykowane dostają własny obwód, zwykłe gniazda/oświetlenie
   grupowane po pomieszczeniu i limicie modułowym), `computeLowVoltage`,
   `computeRcdGroups` (maks. 6 obwodów na RCD). `src/lib/panel/devices.ts` —
   `buildPanelDevices` (obwody → lista aparatów wg IEC 81346), `layoutPanel`
   (rozkład na rzędy szyny DIN), `balancePhases`, `ratedCurrent`,
   `MANUAL_DEVICE_TYPES`. 20 nowych testów. `PanelTab.tsx` operuje na
   elementach z **całego budynku** (`store.draft.elements`, nie tylko
   bieżącej kondygnacji) — tak jak w oryginale, bo jedna rozdzielnica
   obsługuje zwykle więcej niż jedno piętro. Legenda PDF korzysta z już
   gotowego `buildPanelLegendPdf` z kroku 4.

   Sprawdzone w przeglądarce end-to-end: puste elementy → komunikat
   „pojawi się automatycznie”; dodanie 3 gniazd na planie → automatyczne
   wygenerowanie 5 aparatów (Q1/F0/F00/FI1/F1) z poprawnymi etykietami;
   ręczne dodanie aparatu, przesunięcie ↑/↓, usunięcie, przycisk „Legenda
   PDF” — wszystko bez błędów w konsoli.

   **Świadome uproszczenia względem wersji JS:** widok czołowy aparatu jest
   uproszczony (kolorowy prostokąt z etykietą zamiast śrub/rowków szyny DIN
   z oryginalnego SVG); kolejność aparatów zmienia się przyciskami ↑/↓, nie
   przeciąganiem myszką po płótnie; brak analizy selektywności zabezpieczeń
   (`computeSelectivity`) i podglądu bilansu obciążenia faz — to osobna,
   spora porcja logiki doradczej, do zrobienia jeśli okaże się potrzebna.
7. ~~**Protokoły pomiarowe**~~ **zrobione.** `src/lib/protocols.ts` —
   `PROTOCOL_DEFS` (izolacja, pętla zwarcia, RCD, uziemienie, ciągłość,
   oględziny) przeniesione 1:1, łącznie z funkcjami `evaluate`/`compute`
   per kolumna (pętla zwarcia ponownie używa `zsMaxFor` z kroku 1 —
   ten sam wzór, jedno źródło prawdy); `protocolVerdict`. 19 nowych testów
   (evaluate każdego protokołu + PDF). `src/lib/pdf/protocol.ts` —
   `buildProtocolPdf` (dane ogólne, tabela lub checklista, werdykt,
   zawijane „Uwagi”, podpisy) przeniesiony niemal 1:1 z tą samą zmianą co
   reszta silnika PDF (`finish()` zwraca bajty, pobieranie osobno).
   `ProtocolsTab.tsx` współdzieli `docHeader` ze store'em (ten sam nagłówek
   co legenda rozdzielnicy) — dane ogólne wypełnione raz trafiają do PDF-a
   każdego protokołu i legendy.

   Sprawdzone w przeglądarce end-to-end: wypełnienie „Obiekt”/„Wykonawca”
   chowa ostrzeżenie o brakujących danych; wczytanie listy kontrolnej
   oględzin (12 pozycji) i zaznaczenie wszystkich jako „zgodne” daje
   werdykt „pozytywny”; w protokole pętli zwarcia wpisanie Zs=2,0Ω dla
   B16 poprawnie policzyło Ia=80A i Zs max=2,88Ω (te same wartości co w
   testach z kroku 1) i dało ocenę „pozytywna”; pobranie PDF dla obu
   protokołów zadziałało bez błędów w konsoli.
8. ~~**Schemat instalacji (jednokreskowy)**~~ **zrobione.** Czysty SVG (nie
   Konva — statyczny diagram bez interakcji, przeciąganie nie ma tu
   zastosowania), generowany z tych samych `computeCircuits`/`computeRcdGroups`
   co Rozdzielnica (krok 6) — dwie zakładki, jedno źródło prawdy o obwodach.
   Dopisano `mainBreakerFor` i `colorForCircuit` do `src/lib/panel/circuits.ts`
   (6 nowych testów). `SchemaTab.tsx` przeniesiony niemal 1:1 (`SchemaBox`,
   układ złącze→rozłącznik główny→RCD→obwody ze strzałkami).

   Sprawdzone w przeglądarce end-to-end: puste elementy → komunikat; po
   dodaniu 2 gniazd i 1 punktu światła na planie diagram poprawnie pokazał
   „Rozłącznik gł. B25” → „RCD 40A/30mA” → „B16 Obwód gniazd ogólnych 1 —
   YDYp 3x2,5 mm² · 2 pkt” i „B10 Obwód oświetlenia 1 — YDYp 3x1,5 mm² · 1 pkt”
   — bez błędów w konsoli.
9. ~~**Kosztorys**~~ **zrobione — ostatnia z sześciu zakładek oryginału.**
   `src/lib/costs.ts` — `DEFAULT_PRICES`/`PRICE_LABELS`/`computeCosts`
   (ilości materiałów z elementów planu + długości kabli z obwodów, ta sama
   heurystyka „5 mb/punkt + 10 mb do rozdzielnicy” co w oryginale) i
   `parsePriceCsv` (import cennika `nazwa;cena` po słowach kluczowych).
   12 nowych testów. Store dostał `prices` wypełnione domyślnie
   `DEFAULT_PRICES` (wcześniej `{}`) i bulk-akcję `setPrices` do importu CSV.
   `CostsTab.tsx` przeniesiony niemal 1:1 — edycja cen inline, import/eksport
   CSV (eksport przez już istniejący `downloadBlob` z `src/lib/pdf/download.ts`,
   który mimo ścieżki jest generycznym helperem do pobierania plików, nie
   tylko PDF).

   **Dwie odziedziczone z oryginału usterki znalezione i udokumentowane
   testami** (nie naprawiane — port ma być wierny źródłu): (1) parser CSV
   dzieli linię na `[,;\t]` łącznie, więc przecinek jako separator dziesiętny
   w cenie („18,50” przy separatorze `;`) rozbija się na dwa pola i do ceny
   trafia tylko część po przecinku; (2) dopasowanie słów kluczowych bierze
   pierwsze pasujące pole w kolejności deklaracji, więc „Wyłącznik
   różnicowoprądowy” trafia w słowo kluczowe „łącznik” (bo „wyłącznik” je
   zawiera jako podciąg) zanim dotrze do „różnicowoprądowy” — w praktyce
   nazwy pozycji w cenniku CSV lepiej dobierać tak, żeby tego unikać (np.
   „RCD 30mA” zamiast „Wyłącznik różnicowoprądowy”).

   Sprawdzone w przeglądarce end-to-end: 3 gniazdka na planie dały poprawnie
   wyliczony kosztorys (gniazdka, puszki, 25 mb kabla 3×2,5, MCB, RCD,
   wyłącznik główny, obudowa rozdzielnicy) z sumą 440,50 zł; edycja ceny
   inline przeliczyła wiersz i sumę na żywo; import CSV („Gniazdko
   podtynkowe;20”, „RCD 30mA;100”) poprawnie zaktualizował obie ceny i
   sumę na 465,50 zł — bez błędów w konsoli.

10. ~~**Logowanie i chmura (Supabase)**~~ **zrobione (kod), konfiguracja
    zostawiona Tobie.** `src/lib/supabase.ts` — klient REST bez SDK
    (`fetch` do `${SUPABASE_URL}/auth/v1/...` i `/rest/v1/projects...`),
    przeniesiony niemal 1:1 z oryginału; jedyna świadoma zmiana to źródło
    konfiguracji — zamiast wpisanych na sztywno stałych w kodzie, adres i
    klucz projektu czytane są z `import.meta.env.VITE_SUPABASE_URL` /
    `VITE_SUPABASE_ANON_KEY` (Vite env vars, typy w `vite-env.d.ts`), żeby
    nie było ryzyka wrzucenia realnych danych do repo. `.env.example`
    dokumentuje potrzebne zmienne i kroki założenia projektu Supabase
    (tabela `projects` + RLS); `.env` jest już w `.gitignore`.
    `isSupabaseConfigured()` wydzielona jako czysta funkcja (4 testy) —
    `SUPABASE_CONFIGURED` jest `false` dopóki `.env` nie zostanie uzupełniony
    realnymi danymi, więc UI logowania działa, ale nie próbuje łączyć się z
    nieistniejącym backendem.

    `src/components/auth/AuthModal.tsx` (logowanie/rejestracja, z
    ostrzeżeniem gdy `SUPABASE_CONFIGURED` jest `false`) i `ProjectsModal.tsx`
    (lista projektów w chmurze, wczytaj/usuń) przeniesione niemal 1:1 na
    komponencie `Dialog` z tego szkieletu. Podpięte w `App.tsx`: przycisk
    „Zaloguj się”/e-mail+„Moje projekty”+„Zapisz w chmurze”+wyloguj w
    nagłówku, `saveToCloud`/`loadCloudProject`/`signOut` — w oryginale te
    funkcje ręcznie składały/rozkładały payload z kilkunastu osobnych
    `useState`; tutaj korzystają z nowych akcji store'a `getProjectPayload()`/
    `loadProjectPayload()` (patrz niżej), co jest krótsze i eliminuje ryzyko
    pominięcia pola przy rozbudowie.

    **Przy okazji przeniesione do store'a:** `session`/`cloudId` (z
    persystencją sesji w `localStorage` pod tym samym kluczem
    `pomocnikelektryka_sesja` co w oryginale, ładowaną synchronicznie przy
    starcie store'a) oraz `protocols` (stan zakładki Protokoły). Dodano
    `getProjectPayload()` (migawka pól projektu — celowo bez historii
    cofnij/ponów i bez `session`/`cloudId`, bo to stan sesji, nie projektu)
    i `loadProjectPayload()` (podmienia stan projektu i czyści historię —
    to nowy punkt startowy, nie krok do cofnięcia). 3 nowe testy w
    `useProjectStore.test.ts`.

    **Napotkany i naprawiony błąd (odkryty przy okazji, nie zgłoszony):**
    wiersze protokołów pomiarowych żyły w lokalnym `useState` w
    `ProtocolsTab`, więc znikały przy każdym przełączeniu zakładki (`App.tsx`
    odmontowuje nieaktywne zakładki warunkowym renderowaniem). Naprawione
    przez przeniesienie `protocols` do store'a (`setProtocolState`,
    scalanie częściowego patcha zamiast nadpisywania) — przy okazji było to
    też konieczne, żeby `getProjectPayload()` mógł objąć protokoły.

    Sprawdzone w przeglądarce (świeża karta): kliknięcie „Zaloguj się”
    otwiera `AuthModal` z widocznym ostrzeżeniem o brakującej konfiguracji,
    zamyka się Escape, brak błędów w konsoli; przełączanie zakładek dalej
    działa bez regresji. **Nie da się zweryfikować realnego zapisu/odczytu
    w chmurze bez prawdziwego projektu Supabase** — `.env` nie istnieje
    (tylko `.env.example`), więc `SUPABASE_CONFIGURED` jest `false` i
    logowanie celowo kończy się błędem. Gdy uzupełnisz `.env` prawdziwymi
    danymi, warto ręcznie sprawdzić pełny cykl: rejestracja → logowanie →
    „Zapisz w chmurze” → „Moje projekty” → wczytanie → usunięcie.

11. ~~**Code-splitting bundla**~~ **zrobione.** `npx vite build` zaczął zgłaszać
    ostrzeżenie o chunku >500 kB — jeden plik `index.js` ważył 628 kB (198 kB
    gzip), bo Konva/`react-konva` (największa pojedyncza zależność w projekcie)
    trafiała do głównego bundla, mimo że jest potrzebna tylko dwóm zakładkom
    (Zaprojektuj instalację, Rozdzielnica). `DesignTab`/`PanelTab` w `App.tsx`
    zamienione na `React.lazy()` + `<Suspense fallback={<TabLoading />}>`
    (zwykły spinner z `lucide-react`) — to jedyne dwa moduły, które importują
    `react-konva`.

    Efekt po przebudowie: `index.js` spadł do 294 kB (96 kB gzip), Konva
    (292 kB / 89 kB gzip) i oba komponenty (13–29 kB) ładują się osobnymi
    plikami dopiero przy pierwszym wejściu w odpowiednią zakładkę.
    Ostrzeżenie o rozmiarze chunku zniknęło. Sprawdzone w przeglądarce
    (świeża karta): obie zakładki nadal ładują się poprawnie (płótno Konva,
    biblioteka elementów, lista aparatów rozdzielnicy) — bez błędów w
    konsoli i bez widocznego migotania (loading spinner pojawia się tylko
    przy pierwszym przełączeniu, kolejne są już z cache modułów).

12. ~~**Prawdziwe piktogramy elementów**~~ **zrobione.** `src/lib/glyphs.ts` —
    `socketGridMetrics`/`glyphBoxSize` (geometria płytek i siatki gniazd w
    ramce), przeniesione 1:1 z wersji JS, w pełni testowane (6 testów) bo są
    współdzielone przez obie implementacje symboli poniżej. Dwie renderujące
    implementacje tego samego zestawu kształtów — bo Stage/Layer Konvy nie
    renderuje węzłów DOM, więc gotowego SVG z oryginału nie dało się użyć
    wprost na płótnie:
    - `src/components/design/ElementGlyphSvg.tsx` (`ElementGlyphSvg` +
      `GlyphPreview`) — surowe SVG, do list poza płótnem (biblioteka
      elementów, siatka typów w `EditElementModal`). Podpięte w miejsce
      dawnej plakietki kod+kolor w obu miejscach.
    - `src/components/design/ElementGlyphKonva.tsx` (`ElementGlyphKonva` +
      `SelectionOutlineKonva`) — te same symbole jako prymitywy `react-konva`
      (`Rect`/`Circle`/`Line`/`Text`/`Path` — łuki i krzywe Beziera z
      oryginalnych ścieżek SVG obsługiwane przez parser `Konva.Path`).
      Podpięte w `DesignCanvas.tsx` w miejsce jednolitego kółka z kodem;
      przerywana obwódka zaznaczenia dopasowana do kształtu (okrąg dla
      punktu sufitowego, prostokąt dla reszty), tak jak w oryginale.

    Sprawdzone: wszystkie 16 gałęzi przełącznika typu (gniazdko/gniazdko
    hermetyczne z siatką 1–6, włącznik/schodowy z 1–2 klawiszami, punkt
    sufitowy, kinkiet, oświetlenie zewn., taśma LED, wentylator, czujnik
    ruchu/dymu, puszka, wanna, prysznic, umywalka, rozdzielnica, roleta,
    plakietka kodowa domyślna) — wersja SVG bezpośrednio w DOM biblioteki
    elementów (odczyt `outerHTML` potwierdził realne kształty), wersja
    Konva **realnym zrzutem ekranu z Playwright** (patrz krok 14) —
    widoczne pierścienie gniazda z dwoma bolcami, przerywany obrys IP44
    dla gniazdka hermetycznego i podzielona płytka łącznika 2-klawiszowego,
    dokładnie jak w projekcie.
13. ~~**Rozdzielnica: selektywność, bilans faz, front aparatu**~~ **zrobione.**
    `src/lib/panel/devices.ts` — `computePhaseLoad` (suma prądów wg fazy) i
    `computeSelectivity` (7 reguł: zabezpieczenie obwodu większe niż główne,
    zbyt małe stopniowanie, różnicówka niezabezpieczona nadprądowo, zbyt
    dużo obwodów na jednym RCD, selektywność różnicowoprądowa przy >1 RCD,
    brak SPD, nierównomierne obciążenie faz), przeniesione 1:1 z
    `computeSelectivity` w wersji JS — **z wyjątkiem** `checkSelectivity` i
    `EXTRA_DEVICES`, które w oryginale są martwym kodem (zdefiniowane, nigdy
    nie wywołane/użyte) i świadomie pominięte. 23 nowe testy
    (`devices.test.ts`), pokrywające każdą regułę osobno. `PanelTab.tsx`
    dostał pasek bilansu faz (L1/L2/L3, kolorowe słupki, przycisk „Wyrównaj
    fazy” już istniejącej `balancePhases`) i listę spostrzeżeń selektywności
    z ikonami wg poziomu (błąd/ostrzeżenie/info/ok), oba przeliczane
    `useMemo` na każdą zmianę aparatów.

    `src/lib/panel/devices.ts` dostał też `accentForDevice` (kolor akcentu:
    dla auto-MCB wg typu obwodu przez `colorForCircuit` — ten sam kolor co
    na schemacie jednokreskowym — dla reszty wg rodzaju aparatu), a
    `PanelCanvas.tsx` — pełniejszy widok czołowy: śruby mocujące do szyny
    DIN (para na moduł, góra i dół), dźwignia łącznika z podpisem „I”,
    przycisk testu „T” na różnicówce, wymienne wkłady SPD/bezpiecznika,
    pasek akcentu u dołu korpusu — ten sam zestaw detali co oryginalny
    komponent `PanelDevice` w JS (bez przeciągania myszką do zmiany
    kolejności — to zostaje uproszczeniem, ↑/↓ już działa i jest solidne).

    Zweryfikowane realnym zrzutem ekranu z Playwright (krok 14): pasek
    bilansu faz pokazuje L1/L2/L3 z poprawnymi sumami i kolorami, front
    rozdzielnicy ma śruby mocujące, dźwignię łącznika, czerwony przycisk
    „T” na różnicówce i kolorowy pasek akcentu na każdym aparacie, a sekcja
    selektywności pokazuje zielony komunikat „Nie wykryto problemów” dla
    poprawnie dobranej konfiguracji.
14. ~~**Domknięcie weryfikacji przez Playwright**~~ **zrobione.** Poprzednia
    tura nie mogła potwierdzić wizualnie kroków 12–13 w podglądzie —
    Stage/Layer Konvy ignorował syntetyczne zdarzenia wskaźnika wysyłane
    programowo (`MouseEvent`/`PointerEvent` przez `dispatchEvent`) w tym
    środowisku automatyzacji, mimo że DOM je odbierał (potwierdzone
    diagnostycznie przez podpięcie się pod `window.Konva.stages[0]`).
    Playwright to osobny, prawdziwy silnik przeglądarki sterowany przez
    CDP — jego kliknięcia są nierozróżnialne od realnych, więc Konva
    reaguje na nie poprawnie. `e2e/design-panel.spec.ts` (nowy, drugi test
    e2e obok `floors.spec.ts`) stawia 3 gniazdka realnymi kliknięciami na
    płótnie, potwierdza że przycisk „Cofnij” się odblokowuje (dowód, że
    element faktycznie trafił do historii, a nie tylko że kliknięcie nie
    rzuciło błędu), po czym sprawdza, że zakładka Rozdzielnica pokazuje
    sekcje bilansu faz i selektywności.

    Dodatkowo, tymczasowym skryptem Playwright (nieopublikowanym w repo)
    zrobiono zrzuty ekranu płótna projektowania i frontu rozdzielnicy z
    realnie postawionymi elementami — obejrzane bezpośrednio, potwierdziły
    poprawny wygląd piktogramów (pierścienie gniazd z bolcami, przerywana
    obwódka IP44, podzielona płytka włącznika 2-klawiszowego) i frontu
    rozdzielnicy (śruby, dźwignia, przycisk T, pasek akcentu) opisane w
    krokach 12–13 wyżej.

    **Napotkany i naprawiony błąd (regresja z kroku 11):** przy
    porządkowaniu importów `App.tsx` pod code-splitting domyślna aktywna
    zakładka została przypadkiem zmieniona z `"projekt"` na `"kalkulatory"`
    — niezgodnie z oryginałem (`useState("projekt")` w JS) i łamiąc
    istniejący test `e2e/floors.spec.ts` (oczekiwał widocznego przycisku
    „Parter”, który renderuje się tylko w zakładce „Zaprojektuj
    instalację”). Wykryte dopiero teraz, bo dotąd nic nie uruchamiało pełnej
    suity Playwright po tamtej zmianie — naprawione przywróceniem domyślnej
    zakładki na `"projekt"`; oba testy e2e przechodzą.
15. ~~**Osadzony font w PDF (poprawne renderowanie polskich znaków)**~~
    **zrobione.** Oryginalny mechanizm (`/Differences` mapujące kody 128+ na
    nazwy glifów, licząc na to, że czytnik PDF ma te glify w swoim foncie
    zastępczym Helvetica) był niepewny — udokumentowany w kroku 4 jako
    odziedziczone ograniczenie. Naprawione przez osadzenie realnego pliku
    fontu (`/FontFile2`), więc renderowanie już nie zależy od czytnika.

    **Źródło fontu — za zgodą użytkownika.** Osadzenie wymaga dodania binarnego
    pliku fontu do repo, więc zapytałem wprost o źródło (opcje: pobrać otwarcie
    licencjonowany font / podać własny plik / pominąć). Użytkownik wybrał
    pobranie DejaVu Sans — licencja (Bitstream Vera + modyfikacje, zob.
    `src/assets/fonts/DejaVuSans-LICENSE.txt`) wprost pozwala na osadzanie i
    redystrybucję, w przeciwieństwie do fontów systemowych Windows (Arial/
    Calibri), które nie mogłyby być tak dystrybuowane. Pobrane pliki (regular
    693 KB, bold 678 KB, ze zweryfikowanym sygnaturą sfnt `00 01 00 00`) trafiły
    do `src/assets/fonts/`.

    **`src/lib/pdf/ttf.ts`** (nowy) — minimalny parser SFNT/TrueType napisany
    od zera (bez biblioteki): tablica katalogowa, `cmap` format 4 (code point
    → glyph ID), `hmtx` (glyph ID → szerokość), metryki z `head`/`hhea`/`OS/2`/
    `post`. Testowany na prawdziwym pliku `DejaVuSans.ttf` (5 testów) —
    m.in. dowód, że `cmap` poprawnie trafia w polskie znaki (`ą`, `ł` mają
    niezerową szerokość) i zwraca `null` dla code pointów spoza fontu.

    **`src/lib/pdf/engine.ts`** — `assemblePdfBytes` przyjmuje teraz dwa
    sparsowane fonty (regular/bold) i buduje dla każdego `/FontFile2` +
    `/FontDescriptor` (Ascent/Descent/CapHeight/ItalicAngle/FontBBox z
    realnych metryk fontu) + `/Widths` (realne szerokości per znak z `cmap`+
    `hmtx`, z awaryjnym spadkiem na starą tabelę Helvetiki, gdyby jakiegoś
    code pointa zabrakło) — ten sam mechanizm `/Differences` co wcześniej,
    bez zmian w `pdfCharCode`/`pdfEscape`. `assemblePdfBytes` zostaje **czystą,
    synchroniczną** funkcją (fonty wchodzą już gotowe — testowalne przez
    odczyt plików z dysku, jak w `ttf.test.ts`); jedyny nowy element
    asynchroniczny to `loadPdfFonts()` (pobiera i parsuje pliki przez
    `fetch()`, cache'owane w module na całą sesję) wywoływane przez
    `doc.finish()`, które **stało się asynchroniczne** (`Promise<Uint8Array>`)
    — zmiana propaguje się przez `buildProtocolPdf`/`buildPanelLegendPdf`,
    `downloadProtocolPdf`/`downloadPanelLegendPdf` i ich wywołania w
    `ProtocolsTab`/`PanelTab` (proste `async`/`await`). Pliki fontów (~1,4 MB
    razem) nie trafiają do głównego bundla JS — Vite emituje je jako osobne
    assety pod `?url`, pobierane leniwie dopiero przy pierwszym generowaniu
    PDF-a w danej sesji (build produkcyjny: `index.js` urósł tylko o ~3 KB).

    Świadomie **nie** przepisano `pdfCharWidth`/`pdfTextWidth`/`pdfFitText`
    (nadal przybliżenia wg tabel Helvetiki) — służą tylko do wewnętrznych
    decyzji o zawijaniu/przycinaniu tekstu w treści dokumentów, nie do
    samego `/Widths` w PDF-ie (które teraz jest w pełni realne), więc
    drobna niedokładność tam nie psuje renderowania, tylko w skrajnych
    przypadkach odrobinę zmienia miejsce przycięcia „..”. Przepisanie całego
    systemu szacowania szerokości na realne metryki fontu wymagałoby zrobienia
    `createPdfDoc()` asynchronicznym od pierwszego wywołania `doc.text()` (nie
    tylko `finish()`) — uznane za nieproporcjonalny do problemu zakres zmian.

    **Napotkany i naprawiony błąd (odsłonięty przez tę zmianę, nie
    wprowadzony przez nią):** siatka „dane ogólne” w `protocol.ts` pozycjonowała
    wartość obok etykiety na sztywno wyliczonym przesunięciu (np. `M + 108`),
    dobranym pod orientacyjną szerokość Helvetiki. Realny DejaVu Sans Bold
    okazał się być ok. 17–21% szerszy niż przybliżenie z tabeli (zmierzone na
    rzeczywistych etykietach: „Wykonawca pomiarów:” 94,0 pkt szacowane vs
    110,5 pkt rzeczywiste) — przy dłuższych etykietach („Świadectwo
    wzorcowania:”, „Wykonawca pomiarów:”) wartość zaczynała się nachodzić na
    koniec etykiety. Wykryte dopiero przy realnej wizualnej weryfikacji (patrz
    niżej) — nic wcześniej nie renderowało PDF-a na oczy, tylko sprawdzało
    strukturę bajtów. Naprawione dwuetapowo: (1) pozycja wartości liczona
    dynamicznie z `pdfTextWidth(etykieta)` zamiast na sztywno, (2) dodany
    współczynnik bezpieczeństwa `LABEL_WIDTH_SAFETY = 1.3` kompensujący
    niedoszacowanie Helvetiki względem realnego DejaVu Bold.

    **Weryfikacja wizualna — realny plik PDF, nie tylko struktura bajtów.**
    Tymczasowym testem Playwright (nieopublikowanym w repo) wypełniono
    formularz protokołu tekstem z pełnym zestawem polskich znaków
    (`ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ` w kilku polach), kliknięto „Pobierz protokół
    (PDF)”, przechwycono zdarzenie pobierania Playwrighta i zapisano plik na
    dysk. Plik odczytany narzędziem do czytania PDF (renderuje realne strony)
    potwierdził: wszystkie polskie znaki (małe i duże, we wszystkich
    fragmentach — nagłówek, treść, tabliczka rysunkowa) renderują się
    poprawnie bez wyjątku, bez „krzaków” i bez brakujących glifów; po
    poprawce etykiety/wartości mają czysty odstęp bez nachodzenia. To
    najsilniejszy możliwy dowód poprawności tej zmiany — realny plik
    wygenerowany przez aplikację, obejrzany bezpośrednio.
16. ~~**Więcej testów e2e (Protokoły, Schemat, Kosztorys)**~~ **zrobione.**
    `e2e/protocols-schema-costs.spec.ts` — trzy testy, tym samym wzorcem co
    krok 14 (stawianie elementów realnymi kliknięciami, potem przejście do
    kolejnej zakładki): (1) Protokoły — wczytanie listy kontrolnej oględzin,
    zaznaczenie wszystkich pozycji jako „zgodne”, sprawdzenie werdyktu
    „Wynik pozytywny” i realne pobranie PDF-a (`protokol-ogledziny.pdf`,
    przechwycone zdarzeniem `download` Playwrighta); (2) Schemat —
    potwierdzenie, że po dodaniu elementów renderuje się rozłącznik główny
    i wygenerowany obwód gniazd (czysty SVG, bez płótna Konvy, ale wciąż
    zależny od tych samych obwodów co Rozdzielnica); (3) Kosztorys —
    wyliczone pozycje z sumą „RAZEM” i realny eksport CSV
    (`kosztorys-instalacji.csv`). Razem z krokiem 14 to teraz 5 testów e2e
    pokrywających Zaprojektuj instalację/Rozdzielnica/Protokoły/Schemat/
    Kosztorys — jedynie Kalkulatory i integracja Supabase (wymaga realnych
    danych `.env`, patrz „Znane ograniczenia”) zostają bez pokrycia e2e.

    **Sprawdzone, ale świadomie NIE zrobione w tej turze:** `npm audit fix
    --force` naprawiłby 5 znanych podatności `esbuild`/`vite` (dotyczących
    wyłącznie serwera deweloperskiego, nie builda produkcyjnego), ale
    faktyczne sprawdzenie pokazało, że wymaga to skoku Vite 5→8 (trzy wersje
    główne, nie plasterek) wraz z Vitest — realne ryzyko niezgodności w
    całym łańcuchu narzędzi bez proporcjonalnej korzyści (podatności i tak
    nie dotyczą tego, co trafia do użytkowników aplikacji). Pozostawione
    jako świadoma decyzja, nie przeoczenie — patrz „Znane ograniczenia”.
17. ~~**Symbol gniazdka zgodny z konwencją rysunku instalacyjnego**~~
    **zrobione, na prośbę użytkownika.** Użytkownik przesłał obrazek
    referencyjny — standardowy symbol gniazda 1-fazowego z dokumentacji
    technicznej (pionowy trzon nad półokręgiem otwartym w dół) — i poprosił
    o zastąpienie nim dotychczasowego symbolu. Poprzedni symbol gniazdka
    (pierścień z dwoma kropkami-bolcami w środku, krok 12) był bliższy
    realistycznej ikonie gniazdka niż właściwemu symbolowi schematycznemu.

    Zmieniono rysowanie pojedynczej komórki siatki gniazd w obu
    implementacjach (`ElementGlyphSvg.tsx` i `ElementGlyphKonva.tsx`) —
    reszta mechaniki (ramka, siatka N gniazd w rzędzie/kolumnie,
    przerywana obwódka + etykieta „IP” dla wariantu hermetycznego) bez
    zmian. Łuk połowy okręgu (`A r,r 0 0 1 ...`) i trzon stykają się
    dokładnie w wierzchołku łuku, bez nachodzenia — pierwsza wersja miała
    błędny kierunek wygięcia łuku (flaga `sweep`) i trzon przecinający łuk;
    wykryte i naprawione dzięki zrzutom ekranu Playwrighta w wysokiej
    rozdzielczości (`deviceScaleFactor: 6`) — przy normalnym, małym
    rozmiarze symbolu na planie usterka nie była widoczna gołym okiem.

    Sprawdzone wizualnie (zrzuty ekranu, nieopublikowane w repo): pojedyncze
    gniazdko, wariant 3-gniazdkowy w ramce i wariant hermetyczny (IP44,
    przerywana obwódka) — wszystkie trzy pokazują poprawny symbol, zgodny
    z przesłanym obrazkiem referencyjnym.
18. ~~**Symbol gniazdka bez tła + obrót elementów**~~ **zrobione, na kolejną
    prośbę użytkownika.** Ramka (biały prostokąt + wewnętrzna obwódka,
    przerywana dla wariantu hermetycznego) z kroku 17 usunięta — zostaje
    goły symbol (trzon + łuk), zgodnie z konwencją rysunku technicznego,
    gdzie gniazdko rysuje się bezpośrednio na planie bez ramki. Etykieta
    „IP” dla wariantu hermetycznego przeniesiona z rogu ramki na pozycję
    obok symbolu (ramki już nie ma, więc nie ma do czego jej przypiąć).

    **Napotkany i naprawiony błąd (regresja wprowadzona usunięciem tła):**
    biały prostokąt ramki pełnił też rolę obszaru trafień (hit area) w
    Konvie — kształty bez wypełnienia (`fill` nieustawiony) są klikalne
    tylko dokładnie na narysowanej linii, nie w całym polu ikony. Po
    usunięciu ramki kliknięcie w środek symbolu (gdzie wcześniej działało)
    przestało trafiać w element (menu kontekstowe się nie otwierało).
    Wykryte testem Playwright (kliknięcie prawym przyciskiem nie otwierało
    menu „Obróć”/„Edytuj”/„Usuń”), naprawione dodaniem niewidocznego
    `Rect` (`fill="transparent"`) o tym samym rozmiarze co dawna ramka —
    Konva liczy to jako trafienie mimo że nic się nie rysuje. Zweryfikowane
    ponownie tym samym testem — menu kontekstowe otwiera się poprawnie.

    **Obrót elementów (nowa funkcja).** `InstallationElement` dostał pole
    `rotation?: number` (stopnie, domyślnie 0), zastosowane jako
    `rotation` na Konvowej `Group` elementu w `DesignCanvas.tsx` — obraca
    się cały symbol (razem z obwódką zaznaczenia, bo jest w tej samej
    grupie). Dwa sposoby obrotu, oba o **90°** w prawo za każdym razem
    (skok zmieniony z pierwotnych 45° na wyraźną prośbę użytkownika —
    „Zmień krok rotacji na 90 stopni”): (1) przycisk „Obróć o 90°” w menu
    kontekstowym (PPM), zarówno dla pojedynczego elementu jak i zaznaczenia
    wielokrotnego; (2) skrót klawiszowy „R” dla aktualnie zaznaczonego
    elementu/zaznaczenia — przydatne przy szybkim ustawianiu wielu
    gniazd/łączników pod kątem ściany.

    Sprawdzone wizualnie zrzutem ekranu Playwrighta (nieopublikowanym w
    repo, wysoka rozdzielczość): pojedyncze kliknięcie „Obróć o 90°” obraca
    symbol z pionowego trzonu (0°) na poziomy, otwarty w lewo (90°) —
    zgodnie z nowym skokiem.
19. ~~**Gniazdko wielokrotne: jeden symbol + liczba, nie powtórzone
    symbole**~~ **zrobione, wg kolejnego obrazka referencyjnego
    użytkownika.** Wcześniej gniazdko 2–6-krotne rysowało N pełnych
    symboli (trzon+łuk) obok siebie w siatce (`socketGridMetrics`,
    dziedziczone z kroku 12/17). Użytkownik przesłał obrazek: pojedynczy
    symbol z małą cyfrą „2” obok — właściwa konwencja rysunku
    instalacyjnego dla gniazd wielokrotnych (jeden symbol + liczba, a nie
    powtórzenie).

    `src/lib/glyphs.ts` — `glyphBoxSize` dla gniazdka nie skaluje się już z
    liczbą gniazd (stała wysokość 14, szerokość 14 lub 20 gdy trzeba
    zmieścić cyfrę) — zaktualizowany test w `glyphs.test.ts`.
    `ElementGlyphSvg.tsx`/`ElementGlyphKonva.tsx` — case gniazdka
    uproszczony: zamiast pętli po komórkach siatki (`socketGridMetrics`,
    teraz nieużywane w renderowaniu gniazdka, ale zostawione jako
    przetestowana funkcja pomocnicza) rysuje jeden symbol na środku, z
    dopisaną liczbą gniazd (kolor, pogrubienie, obok łuku) gdy `gangs > 1`
    i etykietą „IP” dla wariantu hermetycznego (obie mogą wystąpić
    jednocześnie, w różnych miejscach — sprawdzone, nie nachodzą na
    siebie). Niewidoczny prostokąt trafień z kroku 18 przeliczony na nowy,
    mniejszy rozmiar płytki.

    Sprawdzone wizualnie zrzutem ekranu Playwrighta (nieopublikowanym w
    repo): pojedyncze, podwójne i podwójne-hermetyczne gniazdko obok
    siebie — dokładnie zgodne z przesłanym obrazkiem referencyjnym; tym
    samym testem potwierdzone też, że menu kontekstowe (PPM → „Obróć o
    90°”) nadal działa na przebudowanym symbolu.

    **Poprawka (ten sam krok, kolejna uwaga użytkownika):** brakowało
    ukośnej kreski między łukiem a cyfrą — w konwencji rysunku
    instalacyjnego liczba gniazd zapisuje się jako kreska+cyfra (np. „/2”),
    nie sama cyfra. Dopisana krótka ukośna linia tuż przed liczbą w obu
    plikach (`ElementGlyphSvg.tsx`/`ElementGlyphKonva.tsx`), sprawdzona
    zrzutem ekranu w wysokiej rozdzielczości.

    **Poprawka #2 — właściwy kształt symbolu (obrazek referencyjny
    wysokiej rozdzielczości).** Poprzednie dwie poprawki (tick+cyfra) nie
    dotyczyły sedna problemu — użytkownik przesłał trzeci obrazek, tym
    razem czytelny, po tym jak dwie tury doprecyzowania na małym szkicu
    nie wystarczyły (zapytałem wprost, którego elementu brakuje, zamiast
    zgadywać dalej — użytkownik zaproponował przesłanie lepszego obrazka).
    Okazało się, że różnica jest głębsza niż brakująca kreska: właściwy
    symbol ma pod trzonem **poziomą belkę** (szerszą niż sam trzon,
    dokładnie na szerokość łuku), a półokrąg pod nią jest **otwarty w
    górę** (ugięty w dół, jak „⌣”) — dokładnie odwrotnie niż kopułka „∩”
    otwarta w dół z poprzednich dwóch wersji (kroki 17–18).

    Zmieniona flaga `sweep` łuku SVG (`0 0 0` zamiast `0 0 1` dla łuku
    biegnącego od lewej do prawej — przeciwny kierunek wygięcia niż
    poprzednio) i dopisana pozioma linia (`-r` do `r`) na wysokości, gdzie
    poprzednio był tylko wierzchołek trzonu. Ukośna kreska + liczba gniazd
    z poprzedniej poprawki przesunięte względem nowego dołu łuku
    (`arcBottomY = crossbarY + r` zamiast starego `chordY`).

    Sprawdzone zrzutami ekranu Playwrighta w wysokiej rozdzielczości
    (nieopublikowane w repo): pojedyncze i podwójne gniazdko — kształt
    (trzon + belka + łuk otwarty w górę) zgodny z przesłanym obrazkiem
    referencyjnym co do piksela na tyle, na ile dało się to ocenić wizualnie.

    **Poprawka #3 — proporcje, nie tylko kształt.** Użytkownik przesłał
    ten sam (już poprawny co do kształtu) obrazek referencyjny ponownie z
    komentarzem „nie wygląda tak samo, w ogóle”. Kształt (trzon+belka+łuk)
    już się zgadzał, ale **proporcje** nie: symbol był wyraźnie za mały i
    za „gruby” względem swojego rozmiaru — promień łuku (4,3) i długość
    trzonu (4,6) były niemal identyczne, podczas gdy na obrazku trzon jest
    wyraźnie dłuższy niż promień łuku (~1,3–1,4×), a grubość linii
    względem całego symbolu dużo mniejsza (smuklejszy rysunek techniczny,
    nie gruba ikonka). Powiększono symbol (promień łuku 4,3→9, trzon
    4,6→12, dobrane pod zmierzone proporcje z obrazka) i zmniejszono
    względną grubość linii (1,3→1,8, ale przy dwa razy większym symbolu to
    relatywnie cieńsza kreska) — `glyphBoxSize` dla gniazdka zaktualizowany
    zgodnie (14×14 → 18×22 dla pojedynczego), test w `glyphs.test.ts`
    dostosowany. Na wyraźną prośbę użytkownika zmiana dotyczy tylko
    geometrii symbolu gniazdka (pojedynczego i wielokrotnego dzielą tę samą
    bazową geometrię) — reszta elementów bez zmian.

    Sprawdzone zrzutem ekranu Playwrighta w wysokiej rozdzielczości: nowe
    proporcje (dłuższy trzon, smuklejsza kreska) wizualnie znacznie bliżej
    obrazka referencyjnego niż poprzednia, mniejsza wersja.

    **Poprawka #4 — kierunek łuku, dwie ślepe uliczki zanim padło właściwe
    wyjaśnienie.** Użytkownik: „arc powinien być obrócony o 180 stopni”.
    Spróbowałem dwóch interpretacji, obie odrzucone/nieużyte:
    (a) obrót samego łuku wokół jego środka (ta sama cięciwa, przeciwny
    kierunek wygięcia) — wynik nachodził na trzon, wizualnie zepsuty,
    odrzucony bez pokazywania użytkownikowi;
    (b) obrót całej bryły symbolu (łuk u góry, trzon schodzący w dół) —
    czysty, bez nachodzenia, pokazany użytkownikowi z wprost zadanym
    pytaniem, czy trzon rzeczywiście ma iść w dół. Użytkownik odpowiedział
    obrazkiem — dokładnie tym samym, co posłużył za bazę **przed** dodaniem
    poziomej belki (pierwsza wersja symbolu, krok 12/17: trzon u góry, łuk
    otwarty w dół, bez belki) — z komentarzem, że trzon ma iść w dół, a łuk
    „tylko w dół”. W trakcie analizy tej odpowiedzi użytkownik dopisał
    doprecyzowanie wprost: „jedyne zadanie to dodać poziomą linię nad
    łukiem” — co jednoznacznie rozstrzygnęło sprawę: baza to pierwotny
    kształt (trzon u góry, łuk otwarty w dół, dokładnie jak w kroku 17),
    jedyna zmiana to dopisana pozioma kreska nad łukiem, na wysokości
    styku trzonu z wierzchołkiem łuku — bez zmiany kierunku łuku i bez
    obracania całości. Wdrożone dokładnie tak; zrzut ekranu Playwrighta
    potwierdza zgodność z ostatnim obrazkiem referencyjnym.

    **Poprawka #5 — liczba gniazd wewnątrz łuku.** Użytkownik przesłał
    kolejny obrazek: dla gniazdka wielokrotnego liczba ma siedzieć
    **wyśrodkowana wewnątrz łuku** (duża, pod belką), a nie z boku za
    ukośną kreską jak w kroku 12. Usunięta ukośna kreska i boczne
    pozycjonowanie; liczba wyśrodkowana poziomo (`x=0`/`text-anchor:
    middle` w SVG, `align="center"` na szerokości łuku w Konvie) i
    dosunięta nisko w łuku, żeby nie nachodzić na poziomą belkę (pierwsza
    próba, `fontSize=13` blisko belki, nachodziła — poprawione na
    `fontSize=9.5` niżej, sprawdzone ponownie zrzutem ekranu). Skoro
    liczba już nie wystaje na bok, `glyphBoxSize` dla gniazdka wraca do
    jednego stałego rozmiaru niezależnie od liczby gniazd (18×22) —
    uproszczony też test w `glyphs.test.ts`.

    **Poprawka #6 — liczba dalej za wysoko + wycofane warianty 3–6.**
    Dwie rzeczy naraz: (1) liczba w łuku wciąż siedziała za blisko belki —
    przesunięta niżej (`chordY - 1` → `chordY + 2` w SVG, odpowiednio w
    Konvie) i powiększona (9,5 → 10), sprawdzone zrzutem ekranu — teraz
    ma wyraźny odstęp od belki; (2) warianty gniazdka 3/4/5/6-krotnego
    usunięte z biblioteki elementów na wyraźną prośbę użytkownika —
    zostają tylko pojedyncze i podwójne (`ELEMENT_SECTIONS` w
    `elements.ts`: `variants: [1, 2, 3, 4, 5, 6]` → `[1, 2]` dla
    `gniazdko`; `gniazdkoHerm` miał już tylko `[1, 2]`). Sam kod
    renderujący symbol nadal obsługuje wyższe liczby (zabezpieczenie na
    wypadek istniejących zapisanych projektów z gniazdkiem 3+-krotnym
    sprzed tej zmiany, żeby się nie wyświetliły błędnie), zmieniła się
    tylko lista opcji dostępnych w bibliotece elementów.

    **Poprawka #7 — nazwa i podpis gniazdka podwójnego.** Na prośbę
    użytkownika: nazwa elementu (`ELEMENT_TYPES.gniazdko.label`, użyta
    wszędzie tam, gdzie widać nazwę typu — biblioteka elementów, siatka
    typów w `EditElementModal`) zmieniona z „Gniazdko 230V” na „Gniazdo
    230 V”; e2e testy (`design-panel.spec.ts`,
    `protocols-schema-costs.spec.ts`), które wyszukiwały przycisk biblioteki
    po starym tekście, zaktualizowane w tym samym kroku. Podpis pod nazwą
    (widoczny tylko gdy dany typ jest aktywny w bibliotece) dla wariantu
    podwójnego zmieniony z „2× w ramce” na „podwójne” (`libSubtitle` w
    `elements.ts`) — wyższe liczby gniazd (gdyby trafiły z zapisanego
    wcześniej projektu) nadal pokazują starą, ogólniejszą formę „N× w
    ramce”, skoro nie mają już własnej nazwy słownej.

    **Poprawka #8 — symbol gniazdka hermetycznego (IP44).** Użytkownik
    przesłał obrazek: zamiast etykiety „IP” nad trzonem, wariant
    hermetyczny ma dodatkowy, mniejszy łuk współśrodkowy wewnątrz
    głównego łuku. Wdrożone jako drugi łuk o tym samym środku
    (`(0, chordY)`, czyli środek okręgu głównego łuku) i promieniu 0,6×
    głównego (`r * 0.6`), tym samym kierunkiem wygięcia (ten sam sweep) —
    geometrycznie mniejszy łuk zagnieżdżony w większym, nie dotykający
    poziomej belki (jego wierzchołek wypada niżej niż wierzchołek
    głównego łuku, który styka się z belką). Dotychczasowa etykieta „IP”
    usunięta całkowicie — rozróżnienie zwykłe/hermetyczne teraz wyłącznie
    przez obecność wewnętrznego łuku, zgodnie z obrazkiem. Sprawdzone
    zrzutem ekranu Playwrighta.

    **Poprawka #9 — gniazdko hermetyczne bez wyboru liczby gniazd.** Na
    prośbę użytkownika: usunięty picker „1”/„2” dla gniazdka
    hermetycznego — zostaje tylko jedna, pojedyncza wersja. W
    `ELEMENT_SECTIONS` (`elements.ts`) wpis `gniazdkoHerm` stracił
    `variants: [1, 2]` (teraz bez `variants` w ogóle, jak większość
    elementów bez wariantów). Ponieważ `ElementLibrary`/`EditElementModal`
    pokazują picker liczby gniazd tylko, gdy dany typ ma zdefiniowane
    `variants`, usunięcie tej właściwości samo w sobie usuwa UI wyboru —
    bez dodatkowych zmian w komponentach. Sprawdzone testem Playwright:
    po wybraniu „Gniazdko hermetyczne” w bibliotece nie renderują się
    żadne przyciski „1”/„2”.
20. ~~**Nawigacja: główny przepływ vs. narzędzia**~~ **zrobione.** Po audycie
    UI (zrzuty wszystkich 6 zakładek) użytkownik doprecyzował, że główną
    funkcją aplikacji jest projektowanie instalacji domowej **dla laików**,
    a naturalny przepływ to: *zaprojektuj → rozdzielnica/schemat
    (generowane) → kosztorys*; Kalkulatory i Protokoły to narzędzia poboczne,
    do przesunięcia na prawy skraj.

    Płaski pasek 6 równorzędnych zakładek zastąpiony dwoma strefami:
    - **główny przepływ (lewa strona)** — 3 ponumerowane etapy oddzielone
      strzałkami: „1 Zaprojektuj instalację” → „2 Rozdzielnica | Schemat”
      → „3 Kosztorys”. Rozdzielnica i Schemat dzielą jeden numer kroku
      (oba powstają z tego samego planu), więc są zamknięte we wspólnym
      kontenerze z przerywaną obwódką i etykietą „auto” — laik od razu
      widzi, że nie musi ich wypełniać ręcznie;
    - **narzędzia (prawy skraj)** — Kalkulatory i Protokoły, oddzielone
      pionową kreską, w stonowanym stylu (bez numeru kroku), żeby nie
      konkurowały wizualnie z głównym przepływem.

    Podtytuł w nagłówku zmieniony ze „Szkielet TypeScript + Zustand +
    Radix — punkt startowy migracji” (tekst deweloperski, widoczny dla
    użytkownika końcowego) na opis funkcji produktu.

    **Uwaga na dostępność:** numery kroków są w `<span aria-hidden="true">`,
    więc nazwa dostępnościowa przycisku pozostaje czystą nazwą zakładki
    („Rozdzielnica”, nie „2 Rozdzielnica”) — dla czytników ekranu i dla
    istniejących testów e2e, które wyszukują zakładki po nazwie
    (`getByRole("button", { name: "Rozdzielnica", exact: true })`).
    Potwierdzone: wszystkie 5 testów e2e przechodzi bez zmian w ich kodzie.

21. **Trzy poważne usterki z audytu UI — naprawione po kolei.** Po
    audycie z kroku 20 zostały jeszcze trzy zgłoszone problemy, poza
    samą nawigacją; użytkownik poprosił „wykonaj kolejno wszystkie”.

    **21a — ucinany schemat jednokreskowy.** W `SchemaTab.tsx` wysokość
    SVG (`height`) i pozycja pierwszego obwodu (`y` startowe rysowania
    wierszy) były dwiema niezależnymi stałymi (`230` vs. `250`), które w
    pewnym momencie się rozjechały — dla grup z więcej niż jednym
    obwodem ostatni wiersz (razem z dwuliniowym podpisem kabla,
    rysowanym na `y + rowH/2 + 15`) wychodził poza `viewBox` i był
    ucinany. Naprawione strukturalnie, nie łatane magiczną liczbą: obie
    wartości liczone teraz z jednej stałej `CIRCUITS_TOP`, plus jawny
    margines `ROW_TEXT_DROP` na zejście czcionki podpisu. Zweryfikowane
    scenariuszem testowym z 12 gniazdkami (trzeba było przekroczyć
    wbudowany w `computeCircuits` limit 8 gniazd na obwód, żeby w ogóle
    wymusić grupę z dwoma obwodami i odtworzyć błąd) — po poprawce oba
    obwody mieszczą się w całości, z zapasem pod spodem.

    **21b — brak autozapisu lokalnego.** Projekt istniał wyłącznie w
    pamięci karty: odświeżenie strony lub jej zamknięcie bez konta w
    chmurze (Supabase jest opcjonalne, patrz „Znane ograniczenia”
    niżej) kasowało całą pracę nad planem. Dodany autozapis w
    `useProjectStore.ts`, zbudowany na już istniejącej infrastrukturze z
    integracji Supabase (`getProjectPayload`/`loadProjectPayload`) i na
    tym samym wzorcu co zapis sesji logowania (`SESSION_KEY`/
    `loadStoredSession`/`setSession`), ale pod osobnym kluczem
    (`pomocnikelektryka_projekt_autosave`) — to dane samego projektu, nie
    logowania, więc mają przetrwać nawet wylogowanie. Mechanizm: (1) przy
    tworzeniu store'a, jeśli w `localStorage` jest zapisana migawka,
    wczytuje ją od razu przez `loadProjectPayload`, zanim zamontuje się
    pierwszy komponent; (2) moduł subskrybuje się na każdą zmianę
    store'a (`useProjectStore.subscribe`) i po 600 ms ciszy (debounce —
    żeby nie zapisywać przy każdym pojedynczym przeciągnięciu elementu)
    zapisuje świeżą migawkę, tylko jeśli faktycznie różni się od
    ostatnio zapisanej (porównanie zserializowanego JSON-a) — to
    zabezpieczenie zapobiega też nieskończonej pętli, bo sam zapis
    ustawia `lastLocalSaveAt`, co ponownie odpala subskrybenta. W
    nagłówku (`App.tsx`) dodany wskaźnik „Zapisano lokalnie GG:MM” —
    adresuje z audytu punkt o braku jakiejkolwiek informacji zwrotnej o
    stanie zapisu. Zweryfikowane w przeglądarce: dodanie elementu na
    planie zapisuje migawkę do `localStorage` w ~1 s, wskaźnik się
    pojawia, a po przeładowaniu strony (`localStorage` zachowany)
    element wraca na plan bez żadnej akcji użytkownika.

    **21c — brak pola nazwy projektu w UI.** `projectName` istniał w
    store'u od integracji z chmurą (`setProjectName`, wykorzystywany przy
    zapisie/wczytaniu projektu Supabase), ale nie miał żadnej kontrolki
    w interfejsie — nie dało się go zmienić inaczej niż programistycznie.
    Dodany `ProjectNameField` w nagłówku (`App.tsx`): domyślnie przycisk
    z aktualną nazwą i ikoną ołówka, klik zamienia go w pole tekstowe
    (autofocus + zaznaczenie całej treści), zapis na Enter lub przy
    utracie fokusu, Escape anuluje bez zapisu. Zweryfikowane w
    przeglądarce: zmiana nazwy na „Dom testowy” widoczna od razu w
    nagłówku i odzwierciedlona w kolejnej migawce autozapisu (21b).

    Zweryfikowane dla całej trójki: `npx tsc --noEmit` czysto, `npx
    vitest run` 149/149, `npx playwright test` 5/5, `npx vite build`
    bez błędów.

22. **Schemat jednokreskowy: prawdziwy rysunek techniczny zamiast diagramu
    blokowego.** Użytkownik przesłał zdjęcie referencyjne prawdziwego
    schematu jednokreskowego rozdzielnicy i poprosił o przebudowę zakładki
    Schemat tak, żeby: (1) była w pełni dynamiczna — liczba gałęzi, RCD i
    ich zawartość wynika wyłącznie z obwodów na planie, bez sztywnych
    liczb; (2) wyglądała jak dokumentacja techniczna (cienkie czarne
    linie, symbole aparatów wg konwencji IEC), nie jak kolorowe,
    zaokrąglone „karty” w stylu prezentacji biznesowej; (3) miała
    dynamiczną tabelę oznaczeń pod schematem; (4) była zbudowana z grup
    SVG z `id` per aparat/obwód.

    **Współdzielone źródło prawdy z Rozdzielnicą.** Dotychczas Schemat
    liczył własne, uproszczone `circuits`/`rcdGroups` wprost z elementów
    na planie, ignorując konfigurację rozdzielnicy (zasilanie 1/3-fazowe,
    SPD, rozłącznik główny) — te trzy pola żyły wyłącznie jako lokalny
    stan komponentu `PanelTab` (`useState`), niewidoczny dla innych
    zakładek. Wymóg „SPD tylko jeśli występuje w konfiguracji projektu”
    wymagał, żeby Schemat widział te same ustawienia co Rozdzielnica, więc
    `supply3f`/`spd`/`mainRating` zostały podniesione do store'a jako
    `panelConfig` (nowy typ `PanelConfig` w `types/index.ts`), dopisane do
    `ProjectPayload` (z fallbackiem do wartości domyślnych przy wczytaniu
    starszych zapisów bez tego pola — patrz krok 21b, ten sam mechanizm
    autozapisu). `PanelTab` czyta/zapisuje je teraz przez
    `useProjectStore` zamiast `useState`; `perRow`, ukryte aparaty i
    ręcznie dodane pozycje zostają lokalne dla `PanelTab` (to fizyczny
    układ na froncie rozdzielnicy, nie topologia obwodów). Dzięki temu
    Schemat buduje się z dokładnie tej samej funkcji
    `buildPanelDevices(rcdGroups, panelConfig)`, której już używała
    Rozdzielnica — jedno źródło prawdy, zero duplikowanej logiki doboru
    tagów (Q1/F.../FI...) czy opisów aparatów.

    **Layout: kolumny, nie sztywna siatka.** `SchemaTab.tsx` przepisany od
    zera. Z listy `devices` wyodrębniane są: aparat główny (`kind:
    "main"`), SPD (`kind: "spd"`, pomijany całkowicie z rysunku i tabeli,
    gdy `spd === "brak"`) oraz różnicówki (`kind: "rcd"`) sparowane z ich
    obwodami przez `rcdGroups` (ten sam porządek, zero zgadywania po
    tagach). Każda gałąź RCD to kolumna o szerokości `max(liczba
    obwodów × 96px, 130px)`; kolumny ułożone od lewej (SPD, jeśli jest,
    potem kolejne RCD) z odstępem 50px — stąd szerokość SVG rośnie
    automatycznie z liczbą obwodów, a nie jest stałą liczbą. Główna szyna
    pozioma rozciąga się od środka pierwszej do środka ostatniej kolumny,
    rozłącznik główny wisi nad jej środkiem — układ nie zależy od tego,
    ile jest gałęzi. Wysokość jest stała (jedna siatka pionowa dla
    wszystkich gałęzi: szyna → aparat → podszyna obwodów → wyłącznik →
    znacznik przewodu → nazwa odbiornika), bo w przeciwieństwie do
    szerokości nie rośnie z liczbą obwodów — rośnie tylko przy większej
    liczbie obwodów W JEDNEJ grupie RCD, co i tak mieści się w jednym
    rzędzie (obwody w grupie stoją obok siebie, nie jeden pod drugim).

    **Symbole wg konwencji, nie kolorowe ikonki.** Zamiast poprzednich
    białych prostokątów z kolorową obwódką (`SchemaBox`) — rozłącznik
    główny jako odłącznik (trzon + zestyk skośny), SPD jako prostokąt ze
    strzałką odprowadzenia i symbolem uziemienia (trzy poziome kreski
    malejącej długości), RCD jako prostokąt z cewką toroidalną (okrąg) i
    zestykiem skośnym, wyłącznik obwodu jako mniejsza wersja tego samego
    motywu. Wszystko w jednym kolorze (`#16202B`), bez wypełnień,
    zaokrągleń czy cieni — poprzedni kolorowy podział wg typu obwodu
    (`colorForCircuit`, niebieski/miedziany/fioletowy) i legenda kolorów
    pod schematem usunięte całkowicie, bo referencja jest czarno-biała.
    Każdy aparat i każdy obwód to osobna grupa `<g id="...">`
    (`main-switch`, `spd`, `rcd-{tag}`, `circuit-{tag}`), przewody to
    osobne elementy `<line>` poza tymi grupami — zgodnie z prośbą o
    strukturę gotową pod późniejsze zaznaczanie/edycję elementów.

    **Tabela oznaczeń.** Budowana dynamicznie z tej samej listy `devices`
    (`tag` + `caption`, oba pola już istniały w `PanelDevice` z widoku
    Rozdzielnicy) — dodanie obwodu na planie automatycznie dodaje kolumnę
    w tabeli, bez osobnej logiki opisów.

    **Weryfikacja geometrii, nie tylko „czy się renderuje”.** Zamiast
    zrzutu ekranu (panel podglądu w tej sesji nie renderował klatek —
    `computer{action:"screenshot"}` konsekwentnie się wywalał) napisany
    tymczasowy test Playwright (usunięty po sprawdzeniu, nie wszedł do
    stałego zestawu e2e), który przez `getBBox()` na każdym elemencie
    `<text>` w SVG sprawdzał: (1) żaden element nie wychodzi poza
    `viewBox` (brak ucinania, ten sam błąd co w kroku 1 tej samej tury —
    tym razem zapobiegnięty od razu, nie łatany później); (2) żadne dwa
    teksty w tym samym rzędzie się nie nakładają (brak kolizji etykiet
    przy wielu obwodach). Scenariusz z 60 gniazdkami (8 obwodów, 2 grupy
    RCD) przeszedł: `viewBoxH=286`, `maxBottom=280` (mieści się),
    `viewBoxW=1076`, `maxRight=1017` (mieści się), zero nakładających się
    tekstów. Dodatkowo potwierdzone: wyłączenie SPD w Rozdzielnicy usuwa
    grupę `#spd` ze Schematu, przełączenie na zasilanie 1-fazowe zmienia
    liczbę biegunów rozłącznika głównego w opisie (`4P` → `2P`) — oba
    świadectwo tego, że Schemat faktycznie czyta `panelConfig` ze store'a,
    a nie własną, oddzielną kopię ustawień.

    Istniejący test e2e (`protocols-schema-costs.spec.ts`) zaktualizowany:
    stary regex szukał starego, ręcznie sklejanego tekstu „Rozłącznik gł.
    {aparat}” — zastąpiony asercją na `caption` aparatu głównego
    („Rozłącznik izolacyjny główny”), pochodzącą teraz wprost z
    `buildPanelDevices` zamiast z osobnej, lokalnej logiki opisu w
    `SchemaTab`. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest
    run` 149/149 (bez zmian w testach jednostkowych — `computeCircuits`/
    `computeRcdGroups`/`buildPanelDevices` nie zmienione, tylko sposób
    ich wywołania), `npx playwright test` 5/5, `npx vite build` bez
    błędów.

23. **Tabela pod schematem: tylko odpływy końcowe, wyrównane pod obwodem.**
    Doprecyzowanie od użytkownika po kroku 22: tabela miała wtedy kolumnę
    na każdy aparat (W1, SPD, każdy RCD, każdy obwód) w zwykłym HTML-owym
    `<table>` obok schematu. Użytkownik sprecyzował, że ma zawierać
    **wyłącznie odpływy końcowe** (np. „gniazda kuchnia”, „piec
    kotłownia” — realne obwody, nie aparaty pośrednie) i że każda komórka
    ma leżeć **dokładnie pod swoim obwodem** w diagramie powyżej.

    Zwykły HTML `<table>` nie dawał takiej gwarancji — jego szerokości
    kolumn (auto-layout przeglądarki) nie miały żadnego związku z
    pozycjami `x` gałęzi w SVG nad nim; jedyny sposób na piksel-perfect
    wyrównanie to narysować tabelę w tym samym układzie współrzędnych co
    schemat. Dlatego HTML `<table>` usunięty całkowicie, a w jego miejsce
    nowa grupa `<g id="final-circuits-table">` dorysowana na dole tego
    samego `<svg>`: dla każdej gałęzi RCD (kolumny `kind: "rcd"` — SPD
    i główny wyłącznik świadomie pominięte, bo to nie są odpływy) siatka
    komórek zaczyna się przy tym samym `left = col.x0 + offset`, którego
    już używa `CircuitBranch` do wyliczenia `x` każdego obwodu — więc
    środek komórki w tabeli i środek gałęzi w diagramie są tą samą
    wartością z definicji, nie dwoma niezależnie liczonymi liczbami,
    które mogłyby się rozjechać. Każda komórka: tag obwodu (np. „F3”,
    pogrubiony) u góry, nazwa odpływu (np. „Obwód gniazd — kuchnia”,
    ucięta do 16 znaków z pełną nazwą w `<title>` na hover) u dołu.
    Wysokość SVG (`SCHEMA_HEIGHT`) powiększona o miejsce na tabelę,
    liczoną od tej samej stałej co reszta układu (`TABLE_TOP` względem
    `Y_TERMINAL_TEXT`), tym samym wzorcem jednego źródła prawdy co przy
    naprawie ucinania w kroku 1 tej tury.

    Zweryfikowane tymczasowym testem Playwright (usunięty po sprawdzeniu):
    dla scenariusza z 60 gniazdkami (8 obwodów, 2 grupy RCD) — (1) brak
    ucinania po dodaniu tabeli (`maxBottom`/`maxRight` w granicach
    `viewBox`); (2) w grupie `#final-circuits-table` nie pojawia się
    żaden tag główny/RCD/SPD (`Q1`, `FI…`, `T1+T2`) — tylko tagi
    obwodów; (3) dla każdej z 8 gałęzi środek `x` (`getBBox()`) tagu w
    diagramie i tego samego tagu w tabeli są identyczne co do piksela
    (różnica < 0,5 px, w praktyce dokładnie 0 — to jedna i ta sama
    wartość `x` w kodzie, nie przybliżenie). Zaktualizowany też istniejący
    test e2e (`protocols-schema-costs.spec.ts`): asercje na
    `getByRole("cell", …)` (HTML-owa tabela, już nie istnieje) zastąpione
    odczytem tekstu wprost z SVG (`svg.locator("#main-switch text")` /
    `svg.locator("#final-circuits-table text")`), z filtrem po tagu
    `text`, żeby nie łapać ukrytych elementów `<title>` (które mają tę
    samą treść tekstową, ale nie są renderowane — Playwright poprawnie
    zgłasza je jako niewidoczne). Pełny zestaw: `npx tsc --noEmit`
    czysto, `npx vitest run` 149/149, `npx playwright test` 5/5, `npx
    vite build` bez błędów.

24. **Symbol MCB dostarczony przez użytkownika wklejony do schematu.** Test
    obiegu „użytkownik przygotowuje SVG, ja go wgrywam do kodu” (ustalony
    w rozmowie jako pierwszy krok, prostszy niż osobny mechanizm
    wgrywania w czasie działania aplikacji) — użytkownik przesłał
    `MCB.svg` (eksport z CAD, canvas 800×600, właściwy rysunek w rogu ok.
    x:276–325, y:253–355: przewód, zacisk oznaczony krzyżykiem, skośny
    zestyk łącznika, odgałęzienie z zygzakiem elementu termicznego i
    wypełniona strzałka wyzwalacza).

    Współrzędne z pliku wklejone bez zmian do nowego komponentu
    `McbGlyphPaths` w `SchemaTab.tsx` — jedyna ingerencja to zastąpienie
    ok. 90 mikroskopijnych trapezoidów, którymi eksporter CAD imitował
    wypełnienie strzałki (typowy artefakt konwersji, nie element rysunku;
    3 z tych ścieżek już tworzyły domknięty, czysty kontur), jednym
    równoważnym `<path>` z tym samym obrysem — identyczny wygląd, 90
    węzłów SVG mniej. `CircuitBranch` renderuje ten glif w `<g
    transform="translate(cx, Y_SUBBUS) scale(s) translate(-anchorX,
    -srcYTop)">` zamiast dawnego, ręcznie rysowanego prostokąta z
    ukośną kreską — `s` liczone tak, żeby wysokość źródłowego rysunku
    (101,41 jednostki) zmapować dokładnie na dotychczasową wysokość
    slotu MCB w siatce (`Y_SUBBUS` → `Y_MCB_TOP + MCB_H`, 46 px), a punkt
    kotwiczenia w poziomie to x=281.47 — współrzędna, na której leżą
    JEDNOCZEŚNIE górny koniec przewodu (wejście z podszyny) i dolny
    koniec skośnego zestyku (wyjście do przewodu odbiornika), więc obie
    krawędzie glifu wychodzą dokładnie na osi `x=cx`, współosiowo z resztą
    pionowych przewodów w diagramie, bez ręcznego domiarowania. Grubość
    linii ustawiona przez `vector-effect="non-scaling-stroke"`, żeby nie
    zcieniała przy skalowaniu w dół (glif ma zdecydowanie grubszą
    geometrię źródłową niż docelowy rozmiar w schemacie).

    **Poprawka metody weryfikacji po drodze.** Pierwszy test geometrii
    (ten sam wzorzec `getBBox()` co w krokach 21–23) dał fałszywie
    „bezpieczny” wynik, bo `getBBox()` wywołane na pojedynczym elemencie
    zagnieżdżonym wewnątrz przekształconej grupy (`<g transform=...>`)
    zwraca współrzędne w LOKALNYM układzie tego elementu — sprzed
    zastosowania transformu przodka — nie w układzie całego SVG. Test
    poprawiony: bbox liczony na poziomie kontenerów bez własnego
    transformu (`circuit-Fn`, `rcd-...`, `main-switch`, `spd`), które
    poprawnie agregują przekształcone dzieci do wspólnego układu
    współrzędnych. Po poprawce: brak ucinania, zero nachodzenia
    sąsiednich symboli MCB (3 obwody w jednej grupie RCD), górna
    krawędź każdego glifu dokładnie na `y = Y_SUBBUS` (potwierdza
    poprawne kotwiczenie). Dodatkowo zrobiony prawdziwy zrzut ekranu
    (Playwright `locator.screenshot()`, ×6 przybliżenie na jeden symbol)
    i wysłany użytkownikowi do wizualnej oceny — w tej sesji panel
    podglądu w aplikacji nie renderował klatek, więc to był jedyny
    sposób na pokazanie renderu bez polegania na samej geometrii.
    Zweryfikowane: `npx tsc --noEmit` czysto, `npx vitest run` 149/149,
    `npx playwright test` 5/5, `npx vite build` bez błędów.

25. **Poprawka czytelności: „B16” czytane jako „B6”.** Użytkownik zauważył
    na schemacie etykiety, które wyglądały jak nieznane symbole „B6” i
    „B0” pod symbolami MCB. Przyczyna: etykieta wartości zabezpieczenia
    (`device.label`, np. „B16” dla gniazd, „B10” dla oświetlenia/rolet w
    `computeCircuits`) w `CircuitBranch` jest wyśrodkowana (`textAnchor:
    middle`) dokładnie na tym samym `x`, na którym biegnie pionowy
    przewód wyprowadzający z symbolu MCB do odbiornika — sam tekst
    renderuje się nad linią (późniejszy element w DOM = wyżej w
    z-order), ale bez żadnego tła cienka pionowa kreska przewodu wciąż
    prześwitywała przez wnętrze cyfry „1” w każdej takiej etykiecie,
    wizualnie zlewając się z nią tak, że „B16” czytało się jak „B6”, a
    „B10” jak „B0” — nie osobne, niezrozumiałe symbole, tylko realny
    problem czytelności w warstwie renderowania. Ten sam mechanizm
    dotyczył też etykiety `tag` (np. „F1”) nad symbolem, leżącej na
    przewodzie wejściowym — mniej dotkliwe (krótki, pogrubiony tekst bez
    cyfr podatnych na zlanie z linią), ale naprawione tym samym sposobem
    dla spójności.

    Naprawione przez `paintOrder="stroke"` z białym obrysem
    (`stroke="#fff" strokeWidth={3}`) na obu etykietach — SVG rysuje
    wtedy najpierw gruby biały „cień” pod kształtem liter, dopiero potem
    właściwe wypełnienie, co daje czysty prześwit w przewodzie dokładnie
    pod konturem tekstu, bez potrzeby ręcznego wyliczania, gdzie
    przerwać linię. Zweryfikowane zrzutem ekranu Playwrighta (×6
    przybliżenie, ten sam obwód „B16” co w zgłoszeniu) — cyfry w pełni
    czytelne, przewód widocznie przerwany wokół tekstu z obu stron.
    Zweryfikowane też: `npx tsc --noEmit` czysto, `npx vitest run`
    149/149, `npx playwright test` 5/5, `npx vite build` bez błędów.

26. **Etykieta zabezpieczenia (B10/B16…) przeniesiona z prawej strony
    symbolu, nie pod nim.** Na wyraźną prośbę użytkownika po poprawce w
    kroku 25 — chciał, żeby oznaczenie prądu znamionowego stało obok
    symbolu MCB, nie pod nim. Nowa stała `MCB_LABEL_DX` liczona z
    geometrii samego glifu (nie „na oko”): najdalej wysunięty w prawo
    punkt rysunku to strzałka wyzwalacza przy źródłowym x=325.08,
    odległość od osi kotwiczenia (281.47) przeliczona przez `MCB_SCALE` i
    powiększona o 6 px zapasu — dzięki liczeniu z tych samych źródeł co
    reszta glifu (patrz krok 24) etykieta automatycznie nie nachodzi na
    rysunek nawet gdyby ktoś kiedyś zmienił rozmiar symbolu (`MCB_H`),
    zamiast być ustawiona na sztywno pod obecny kształt. Tag (`F1`, `F2`…)
    zostaje nad symbolem bez zmian — użytkownik prosił wyłącznie o
    przesunięcie wartości zabezpieczenia.

    Zweryfikowane dwutorowo: (1) geometrycznie — dla 3 sąsiadujących
    obwodów w jednej grupie RCD bbox całej gałęzi (`circuit-Fn`, łącznie
    z przesuniętą etykietą) nie nachodzi na sąsiednią (~15 px odstępu);
    (2) wizualnie — zrzut ekranu Playwrighta (×5 przybliżenie) na dwóch
    sąsiednich obwodach potwierdza, że „B16” stoi czysto z prawej strony
    strzałki wyzwalacza, nie dotykając rysunku glifu. Pełny zestaw: `npx
    tsc --noEmit` czysto, `npx vitest run` 149/149, `npx playwright
    test` 5/5, `npx vite build` bez błędów.

27. **Ujednolicona grubość linii w całym schemacie.** Własnoręcznie
    rysowane symbole (główny wyłącznik, SPD, RCD, szyny, tabela) miały
    grubości kreski rozrzucone w przedziale 0,8–1,6 px (różne wartości
    dobierane osobno przy każdym symbolu), podczas gdy wgrany symbol MCB
    (krok 24) używał 1,1 px. Użytkownik poprosił o ujednolicenie — dał
    wybór: pogrubić MCB do reszty albo ściągnąć resztę do MCB. Wybrana
    druga opcja: zostawia plik użytkownika jako punkt odniesienia
    nietknięty, a nie zmusza CUDZEGO rysunku do dopasowania się do
    MOICH, dowolnie dobranych wcześniej wartości. Nowa stała `LINE_W =
    1.1` zastąpiła wszystkie dotychczasowe literały grubości linii w
    pliku (odłącznik główny, SPD, RCD, szyny zbiorcze, znacznik
    przewodu, siatka tabeli odpływów) — jedno źródło prawdy zamiast
    osobno dobieranej liczby przy każdym elemencie, więc kolejny
    wgrywany symbol (SPD/RCD od użytkownika, patrz zapowiedź w kroku 24)
    wystarczy podłączyć pod tę samą stałą zamiast zgadywać grubość na
    oko. Grubości obramowania białej „poświaty” za tekstem (kroki 25–26,
    3 px — inny cel, nie linia schematu) celowo pozostawione bez zmian.
    Zweryfikowane zrzutem ekranu Playwrighta (cały schemat + zbliżenie
    ×3 na wyłącznik główny) — jednolita, spójna grubość kreski w całym
    rysunku. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run`
    149/149, `npx playwright test` 5/5, `npx vite build` bez błędów.

28. **Audyt całości aplikacji i naprawa pięciu znalezionych rzeczy.**
    Użytkownik poprosił o przegląd wizualny i jakościowy. Audyt zrobiony
    na REALNYCH danych, nie „na sucho": tymczasowy scenariusz Playwrighta
    stawiał zróżnicowany zestaw elementów (gniazda, hermetyczne,
    oświetlenie wewn./zewn., rolety, AGD, 400 V, EV, teletechnika), robił
    zrzut każdej z 6 zakładek plus widok 420 px i zbierał zdarzenia
    `console` / `pageerror`. Wynik: zero błędów i ostrzeżeń w konsoli.
    Znalezione problemy naprawione po kolei, w kolejności szkoda/koszt:

    **28a — brak „Nowego projektu" (najpilniejsze).** `resetProject`
    istniało w store od początku, ale nie było podpięte pod żaden element
    UI. Dopóki projekt żył tylko w pamięci karty, odświeżenie strony
    działało jak „wyczyść"; odkąd doszedł autozapis (krok 21b) projekt
    wraca po każdym otwarciu i **nie było już żadnej drogi do czystego
    startu** — czyli sami stworzyliśmy tę lukę i trzeba ją było domknąć.
    Dodany przycisk w nagłówku z oknem potwierdzenia, które wprost
    nazywa, ile elementów przepadnie i że operacji nie da się cofnąć.
    Samo `resetProject` rozszerzone o `projectName`, `panelConfig` oraz
    pola `docHeader` opisujące konkretny obiekt — z **celowym wyjątkiem**:
    dane własne elektryka (nazwisko, uprawnienia, miernik, świadectwo
    wzorcowania) zostają, bo są takie same dla każdego zlecenia i
    kasowanie ich zmuszałoby do przepisywania w kółko. `DialogClose`
    dołożone do `ui/dialog.tsx` (było używane tylko wewnętrznie).

    **28b — nachodzące opisy aparatów w Rozdzielnicy.** Opis obwodu
    rysowany na licu aparatu od `DEV_H*0.55` wchodził na białe pole z
    wartością zabezpieczenia zaczynające się na `DEV_H*0.62` i — rysowany
    później — przekreślał je; przy aparatach 1-modułowych (34 px) łamał
    się dodatkowo na kilka nieczytelnych pasków. Opis przeniesiony POD
    aparat, jedna linia z wielokropkiem; pełna nazwa i tak jest w liście
    „Aparaty" obok płótna oraz w legendzie PDF, a na froncie rozdzielnicy
    liczą się przede wszystkim tag i wartość. Przy okazji: kółka „×"
    (16 px przy module 34 px) zasłaniały oznaczenia F1/F2/F3 **na stałe** —
    teraz pokazują się tylko dla aparatu pod kursorem, więc tagi są zawsze
    czytelne, a płótno przestało być zaśmiecone. Lista aparatów dostała
    wyższy kontener (`max-h-72` → `max-h-[26rem]`), bo przy ~9 wierszach
    ucinała ostatni w połowie i wyglądało to jak błąd renderowania.

    **28c — nazwy obwodów na Schemacie nie do rozróżnienia.** Nazwa stała
    w dwóch miejscach (pod gałęzią i w tabeli odpływów), w obu ucięta na
    tyle, że „Obwód gniazd o…" i „Obwód gniazd og…" wyglądały identycznie —
    ucięcie zjadało końcówkę, czyli dokładnie numer odróżniający obwody.
    Podpis pod gałęzią usunięty (zostaje typ przewodu, którego w tabeli
    nie ma), a komórka tabeli łamie nazwę na dwie linie po wyrazach
    (`wrapTwoLines`), więc numer ocaleje. Liczba znaków w linii **zmierzona**
    przez `getComputedTextLength()` na realnych nazwach obwodów, nie
    zgadnięta: realna szerokość znaku dla `fontSize=8` to 3,73–4,27 px,
    więc stała przyjmuje najgorszy przypadek (4,3) i odejmuje 8 px
    marginesu — pierwsza wersja („na oko" 4,3 bez marginesu) dawała wprawdzie
    poprawny wynik, ale wypychała sam numer do drugiej linii.

    **28d — nazwa projektu nie trafiała do dokumentów.** `projectName`
    zasilał wyłącznie nagłówek aplikacji i zapis w chmurze. Efekt: pole
    „Obiekt / nazwa instalacji" w Protokołach zostawało puste mimo że
    projekt miał nazwę, a wszystkie eksporty nazywały się identycznie
    (`kosztorys-instalacji.csv`, `protokol-ogledziny.pdf`), więc pliki z
    różnych zleceń nadpisywały się w folderze pobierania. Dodane:
    `resolveDocHeader` (nazwa projektu jako domyślny „Obiekt", z
    pokazaniem jej jako placeholder w formularzu — pole nadal trzyma to,
    co użytkownik faktycznie wpisał) oraz `slugify`/`projectFileName` w
    `pdf/download.ts`. Nazwa pliku bierze się z **rozwiązanego** „Obiektu",
    więc plik na dysku nazywa się tak samo jak obiekt wydrukowany w
    dokumencie — jedno miejsce rozstrzygnięcia zamiast dwóch niezależnych.
    `slugify` zamienia polskie znaki na ASCII (`Mój dom` → `moj-dom`).
    Dopisane 11 testów jednostkowych (`docHeader.test.ts`) — logika czysta,
    z polską specyfiką, warto ją zamrozić.

    **28e — nawigacja rozpadała się na wąskim ekranie.** Przy 420 px
    `flex-wrap` łamał pasek gdziekolwiek: strzałka lądowała na końcu
    wiersza bez celu, „3 Kosztorys" wchodził wizualnie do przerywanej
    ramki kroku 2, a etykieta „auto" znikała (`hidden sm:inline`) — czyli
    przekaz 1→2→3, jedyny powód istnienia tego paska, przestawał działać.
    Przepływ jest teraz jednym rzędem, który się **nie łamie** — w razie
    braku miejsca przewija się poziomo — a narzędzia schodzą do własnego
    wiersza z kreską u góry (`lg:` przywraca układ z prawej krawędzi).
    „auto" pokazuje się już przy każdej szerokości, skoro grupa nie pęka.
    Analogicznie pasek narzędzi w Projektowaniu: przewijanie zamiast
    łamania etykiet w środku przycisków („Przesuń / widok" w dwóch
    liniach robiło przycisk wyższym od sąsiadów).

    **Weryfikacja.** Pozycje kroków sprawdzone programowo (nie tylko
    okiem) na 400/760/1280 px: wszystkie trzy kroki muszą leżeć w tym
    samym wierszu i w rosnącej kolejności poziomej — asercja, która
    złapałaby nawrót dokładnie tej regresji. Naprawy 28a–28d potwierdzone
    zrzutami ekranu i pomiarami geometrii. Testy tymczasowe usunięte, z
    jednym wyjątkiem: scenariusz „Nowy projekt" **awansował do stałego
    zestawu** (`e2e/project-lifecycle.spec.ts`), bo to jedyna nieodwracalna
    operacja w aplikacji i jedyne miejsce, gdzie liczy się zachowanie po
    prawdziwym przeładowaniu karty (czego `jsdom` nie odtworzy). Pełny
    zestaw: `npx tsc --noEmit` czysto, `npx vitest run` **160/160**
    (+11), `npx playwright test` **6/6** (+1), `npx vite build` bez błędów.

29. **Rysowanie pomieszczeń: prostokąt albo wielobok** + trzy kolejne
    poprawki z audytu.

    **29a — dwa tryby rysowania pomieszczenia.** Dotychczas pomieszczenie
    powstawało wyłącznie przez klikanie kolejnych punktów, bez żadnych
    widocznych wierzchołków (sama przerywana linia) i kończyło się
    przyciskiem „Zakończ" w pasku narzędzi. Na prośbę użytkownika po
    wejściu w tryb „Pomieszczenie" pojawia się teraz wybór kształtu:
    - **Prostokąt** — przytrzymanie LPM i przeciągnięcie, z podglądem
      wypełnionego prostokąta w trakcie; po puszczeniu przycisku od razu
      pytanie o nazwę. Przeciągnięcia mniejsze niż `MIN_ROOM_SIZE` są
      ignorowane, żeby drgnięcie myszy przy zwykłym kliknięciu nie
      tworzyło zerowego pomieszczenia.
    - **Wielobok** — klikanie narożników, każdy **widoczny** jako kropka
      (to była wprost zgłoszona luka), z „gumową" linią biegnącą od
      ostatniego punktu do kursora. Figura zamyka się kliknięciem w
      pierwszy punkt, z **przyciąganiem** w promieniu `ROOM_CLOSE_RADIUS`
      (12 jednostek planu) — nie trzeba trafiać w piksel. Gdy kursor
      wejdzie w ten promień, pierwszy punkt zmienia się w biały
      pierścień: to jedyny sygnał, po którym widać, że kolejny klik
      zamknie figurę, a nie doda wierzchołek. Zamykający klik **nie**
      dokłada powtórzonego punktu.

    Oba tryby respektują „Przyciągaj do siatki". Zmiana kształtu w trakcie
    rysowania porzuca zaczętą figurę (inaczej punkty z jednego trybu
    doklejałyby się w drugim), tak samo jak wyjście z narzędzia.
    Implementacja prostokąta korzysta z tej samej pary ref+stan co
    zaznaczanie prostokątem i z tego samego powodu: React batchuje stan
    między `mousemove` a `mouseup`, więc handler puszczenia przycisku
    czytający sam stan widziałby rozmiar sprzed ostatniego ruchu.
    Rysowanie prostokąta świadomie **nie** wymaga, by zdarzenie trafiło
    prosto w scenę (`e.target === stage`) — inaczej nie dałoby się
    narysować pomieszczenia nad już istniejącym, które jest przecież
    tylko podkładem. Sześć testów e2e (`room-drawing.spec.ts`) —
    prawdziwe zdarzenia myszy, bo tego nie da się sprawdzić inaczej;
    najważniejszy z nich klika **6 px obok** pierwszego punktu i wymaga,
    żeby figura się zamknęła (dowód, że przyciąganie działa) oraz żeby
    wierzchołków zostało 4, a nie 5.

    **29b — usuwanie kondygnacji.** `removeFloor` istniało w store, ale
    nie miało żadnego podpięcia w UI (asymetria z „+ Dodaj kondygnację").
    Kosz pojawia się przy każdej kondygnacji **tylko gdy jest ich więcej
    niż jedna** — ostatniej nie da się usunąć, więc przycisk znika,
    zamiast być wyszarzony bez wyjaśnienia. Potwierdzenie podaje, ile
    elementów zniknie razem z piętrem, bo `removeFloor` kasuje też jego
    elementy, ściany i pomieszczenia, a po samej nazwie przycisku tego
    nie widać. Efekt uboczny: `aria-label` kosza („Usuń kondygnację
    Piętro 1") zaczął pasować do wyszukiwania `{ name: "Piętro 1" }` w
    istniejącym teście — asercja doprecyzowana o `exact: true`.

    **29c — eksport Schematu.** Był jedynym dokumentem, którego nie dało
    się wyjąć z przeglądarki. Rysunek jest już wektorem w DOM, więc
    eksport serializuje go do pliku **SVG** zamiast odtwarzać geometrię w
    generatorze PDF (jak przy legendzie rozdzielnicy): wynik zostaje w
    pełni skalowalny, tekst zostaje tekstem, a grupy `id` przeżywają
    eksport — czyli plik da się otworzyć w CAD-zie i dalej edytować, co
    było wprost założeniem przy przebudowie schematu (krok 22). Do klonu
    dokładany jest biały prostokąt tła, bo bez niego czarna kreska ginie
    w podglądach renderujących SVG na ciemnym tle. Nazwa pliku z nazwą
    projektu (krok 28d).

    **29d — kosztorys: netto/VAT/brutto i pozycje bez ceny.** „RAZEM"
    pokazywało samą sumę pozycji, w której domyślnie **nie ma robocizny**
    (cena 0), a to zwykle największy składnik — przy aplikacji
    adresowanej „głównie dla laików" (krok 20) to realnie mylące. Stopka
    rozbita na *Razem netto / VAT 23% / RAZEM brutto* (to samo w
    eksporcie CSV), a nad przypisem pojawia się ostrzeżenie wymieniające
    z nazwy pozycje z ceną 0 zł, które nie weszły do sumy; znika, gdy
    ceny zostaną uzupełnione. Stawka VAT jako stała `VAT_RATE` z
    komentarzem, że dla budownictwa mieszkaniowego bywa 8% — kosztorys
    jest orientacyjny i nie udaje doradztwa podatkowego.

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` 160/160,
    `npx playwright test` **15/15** (z 6 — doszło 6 testów rysowania
    pomieszczeń, usuwanie kondygnacji, eksport SVG i rozbicie
    netto/VAT/brutto), `npx vite build` bez błędów.

30. **Pozostałe trzy symbole aparatów od użytkownika + wydzielenie modułu
    glifów.** Użytkownik przysłał `Q1.svg` (rozłącznik izolacyjny),
    `SPD.svg` (ogranicznik przepięć) i `RCD.svg` (wyłącznik
    różnicowoprądowy) — te same eksporty z CAD-a co MCB w kroku 24.

    **Uogólnienie zamiast czterokrotnego powtórzenia.** Przy jednym
    symbolu (krok 24) skala i kotwiczenie były policzone „na piechotę"
    stałymi `MCB_SRC_X`/`MCB_SCALE`/`MCB_LABEL_DX` wprost w `SchemaTab`.
    Przy czterech to samo trzeba by przepisać cztery razy, więc symbole
    wyjechały do osobnego modułu `deviceGlyphs.tsx`, gdzie każdy jest
    opisany strukturą `GlyphSpec`: oś (`axisX`), końce przewodu
    (`topY`/`bottomY`) i najdalszy punkt w prawo (`rightX`). Komponent
    `CadGlyph` sam dobiera skalę i przesunięcie tak, żeby wpiąć symbol
    dokładnie między dwa wskazane poziomy siatki, a `labelOffset` liczy,
    o ile odsunąć etykietę, żeby minęła rysunek. Efekt: zmiana wysokości
    rzędu w schemacie nie wymaga ruszania geometrii symboli, a dołożenie
    piątego symbolu to jeden wpis w `GLYPHS`, nie kolejny komplet stałych.

    **Siatka pionowa przeliczona pod symbole.** Nowe symbole są wyraźnie
    bardziej szczegółowe od dotychczasowych, ręcznie rysowanych
    prostokątów — RCD ma przekładnik toroidalny, blok wyzwalacza z
    przyciskiem testu i sprzężenie linią przerywaną, a jego rysunek
    źródłowy jest ponad dwa razy wyższy niż dawne pudełko 32 px.
    Wciśnięty w starą siatkę gubiłby te detale, więc wysokości gniazd
    (`MAIN_H` 60, `BRANCH_H` 110, `SPD_H` 84) są teraz dobrane pod
    symbole, a nie odwrotnie, i cała reszta poziomów wylicza się z nich
    kaskadowo (ten sam wzorzec jednego źródła prawdy co przy naprawie
    ucinania w kroku 21a). Rysunek urósł z 348 do 392 px wysokości —
    świadomy koszt czytelności, bez wpływu na układ poziomy.

    **Odstępstwa od plików źródłowych — tylko równoważne scalenia.**
    Okrąg styku w `Q1.svg` był łamaną z ~20 odcinków (typowe przybliżenie
    łuku przez eksporter) — zastąpiony jednym `<circle>` o tym samym
    środku i promieniu. Łamane rysowane jako ciągi stykających się
    odcinków (obrys pudełka SPD, korpus wyzwalacza RCD, znaczniki na
    ostrzu) zapisane pojedynczymi `path`. W `RCD.svg` dwa odcinki
    (`334.21 327.78`→`319.86` i →`335.69`) leżą dokładnie na torze
    głównym rysowanym już innym poleceniem — pominięte jako podwójne
    kreślenie tych samych pikseli. Wygląd bez zmian, węzłów istotnie
    mniej. Uziemienie pod SPD **nie** pochodzi z pliku: dorysowuje je
    `SchemaTab`, bo należy do topologii schematu, nie do samego aparatu.

    Zweryfikowane pomiarem `getBBox()` na kontenerach (nie na elementach
    wewnątrz przekształconych grup — patrz pułapka opisana w kroku 24):
    dla 3 obwodów nic nie wychodzi poza `viewBox`, sąsiednie gałęzie się
    nie nakładają, a etykiety `Q1`/`F00`/`FI1` mijają swoje symbole,
    bo ich odsunięcie liczy `labelOffset` z realnego `rightX`, a nie z
    ustawionej na oko liczby. Do tego zrzuty ×3,2 każdego z trzech nowych
    symboli. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run`
    160/160, `npx playwright test` 15/15, `npx vite build` bez błędów.

31. **Szyny PE i N na schemacie jednokreskowym.** Użytkownik przysłał
    rysunek z zaznaczoną na czerwono wysokością, na której mają biec
    poziome przewody ochronny i neutralny — pod wyłącznikami obwodowymi,
    nad opisami kabli — z prośbą o wykonanie ich czarną kreską i opisem
    po lewej stronie.

    Nowa grupa `#pe-n-buses`: dwie równoległe poziome linie (N wyżej, PE
    niżej) rozciągnięte na całą szerokość rysunku, od `MARGIN_X` do
    `width - MARGIN_X`, czyli od lewej do prawej krawędzi układu kolumn —
    dzięki temu przecinają **wszystkie** odejścia niezależnie od tego, ile
    ich jest i jak szerokie wyszły grupy RCD. Opisy „N" i „PE" stoją z
    lewej, wyrównane do prawej (`text-anchor: end`) tuż przed początkiem
    linii, więc mieszczą się w marginesie rysunku i nie wchodzą na żaden
    obwód. Bez kropek połączeniowych na przecięciach — na schemacie
    jednokreskowym pojedyncza kreska obwodu reprezentuje komplet żył, więc
    szyny po prostu go przecinają, dokładnie jak na rysunku referencyjnym.

    Siatka pionowa musiała zrobić im miejsce: między znacznikiem przewodu
    a opisem kabla było tylko 14 px, co nie mieści dwóch linii z czytelnym
    odstępem. Doszły `Y_N_BUS` i `Y_PE_BUS`, a `Y_WIRE_END` liczy się
    teraz **od** szyny PE, nie od dolnej krawędzi wyłącznika — inaczej
    przewód obwodu kończyłby się nad szynami i wyglądał na urwany.
    Wysokość rysunku wzrosła z 392 do 412 px, kaskadowo, bez ręcznych
    poprawek pozycji tabeli.

    Szyny rysowane **po** odejściach, żeby biegły ciągłą kreską po ich
    wierzchu, a nie były przez nie przerywane. Zweryfikowane pomiarem:
    obie linie zaczynają się nie dalej niż skrajnie lewe odejście i kończą
    nie bliżej niż skrajnie prawe (asercja odporna na zmianę liczby
    obwodów), opisy kończą się przed początkiem linii, a przewody obwodów
    sięgają poniżej szyny PE i mieszczą się nad tabelą. Asercja o zasięgu
    szyn dołożona do stałego testu Schematu. Pełny zestaw: `npx tsc
    --noEmit` czysto, `npx vitest run` 160/160, `npx playwright test`
    15/15, `npx vite build` bez błędów.

32. **Usunięte ukośne znaczniki pod MCB, PE kreską przerywaną.** Dwie
    drobne korekty zgłoszone przez użytkownika po obejrzeniu kroku 31.

    Ukośna kreska 45° pod każdym wyłącznikiem obwodowym (`Y_CABLE_TICK`)
    była pozostałością po pierwotnej, ręcznie rysowanej wersji schematu —
    oznaczała miejsce wyprowadzenia kabla. Odkąd wyłącznik rysuje symbol
    CAD użytkownika (krok 24), który ma własny, znacznie bogatszy zestaw
    detali, znacznik był tylko dodatkową kreską bez treści. Usunięty
    razem ze stałą, która obsługiwała wyłącznie jego.

    Przewód PE dostał `stroke-dasharray` — na wydruku czarno-białym, a
    taki jest cały ten schemat, kreska przerywana jest jedyną rzeczą
    odróżniającą przewód ochronny od neutralnego (kolor nie niesie tu
    żadnej informacji). N zostaje linią ciągłą.

    Zweryfikowane pomiarem: każda linia pozostała w gałęzi obwodu ma
    identyczne `x1` i `x2`, czyli jest wyłącznie pionowa — asercja, która
    złapałaby powrót jakiegokolwiek ukośnego elementu poza samym symbolem
    CAD. Rozróżnienie ciągła/przerywana dopisane do stałego testu
    Schematu obok wcześniejszej asercji o zasięgu szyn. Pełny zestaw:
    `npx tsc --noEmit` czysto, `npx vitest run` 160/160, `npx playwright
    test` 15/15, `npx vite build` bez błędów.

33. **Odczepy PE przy odejściach obwodowych.** Do tej pory szyna PE po
    prostu przecinała pionowe odpływy, a przecięcie na schemacie **nie
    oznacza połączenia** — z rysunku nie wynikało więc, że przewód
    ochronny każdego obwodu jest do niej podłączony. Nowa grupa
    `#pe-taps`: przy każdym odejściu kropka na szynie PE (umowny znak
    połączenia, w odróżnieniu od zwykłego skrzyżowania, które zostaje
    bez kropki przy szynie N) i ukośna kreska schodząca od niej pod 30°
    do pionowego odpływu, poniżej szyny.

    Kąt liczony z `Math.tan(Math.PI / 6)`, a nie wpisany jako gotowa para
    liczb — dzięki temu zmiana długości odczepu (`PE_TAP_DX`) zachowuje
    nachylenie dokładnie 30°, zamiast je po cichu psuć. Odczepy są osobną
    grupą od `#pe-n-buses` i rysowane po niej z dwóch powodów: kropka ma
    leżeć NA kresce przerywanej, nie pod nią, a wcześniejsze asercje
    liczące linie szyn (`#pe-n-buses line`) pozostają ważne.

    **Przy okazji — jedno źródło pozycji poziomych.** Wzór na `x` odejścia
    był przepisany w trzech miejscach (gałęzie, tabela odpływów, a teraz
    doszłyby odczepy), więc każda zmiana układu groziła rozjechaniem się
    tych warstw względem siebie. Wydzielony `circuitX(col, i)` i
    `circuitXs(columns)`; tabela liczy teraz lewą krawędź jako
    `circuitX(col, 0) - LEAF_W / 2`, a gałęzie i odczepy biorą x wprost
    z tej samej funkcji. (Pierwsza wersja wołała `circuitXs([col])[i]` w
    pętli, czyli budowała całą tablicę na każdy obwód — zastąpione
    punktowym `circuitX`.)

    Zweryfikowane pomiarem dla każdego odczepu: kropka leży dokładnie na
    `y` szyny PE, kreska schodzi poniżej niej i kończy się co do piksela
    na `x` pionowego odpływu, a jej nachylenie wynosi 30° z dokładnością
    do sześciu miejsc po przecinku. Asercje dopisane do stałego testu
    Schematu. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run`
    160/160, `npx playwright test` 15/15, `npx vite build` bez błędów.

34. **Oznaczenie faz nad wejściem zasilania.** Nad grotem strzałki, czyli
    nad rozłącznikiem izolacyjnym, pojawia się teraz „L1, L2, L3" dla
    zasilania 3-fazowego i „L1" dla 1-fazowego. Napis bierze się wprost z
    `panelConfig.supply3f`, tego samego pola, które steruje doborem
    aparatów (krok 22), więc przełączenie zasilania w Rozdzielnicy zmienia
    schemat od razu i nie da się doprowadzić do rozjazdu: przy 1-fazowym
    Q1 pokazuje jednocześnie „L1", „2P" i różnicówkę 40 A zamiast 63 A.

    Fazy wypisane z nazwy zamiast opisu „3-fazowe" — na schemacie liczy
    się, KTÓRE przewody dochodzą, bo to one są potem rozdzielane między
    obwody jednofazowe (por. bilans faz w Rozdzielnicy).

    Siatka pionowa musiała zrobić miejsce: strzałka zaczynała się na
    `y = 4`, więc napis nad nią wychodziłby poza górną krawędź rysunku.
    Doszła stała `Y_PHASES`, a `Y_ARROW` i `Y_SWITCH_TOP` liczą się od
    niej — reszta poziomów przesunęła się kaskadowo, bez ręcznych poprawek.

    Zweryfikowane pomiarem `getBBox()` dla obu układów: napis mieści się
    w rysunku (`y ≥ 0`), kończy się nad strzałką, jest wyśrodkowany na tej
    samej osi co grot, a strzałka nadal stoi nad rozłącznikiem. Asercja o
    treści napisu dopisana do stałego testu Schematu. Pełny zestaw: `npx
    tsc --noEmit` czysto, `npx vitest run` 160/160, `npx playwright test`
    15/15, `npx vite build` bez błędów.

35. **Łączniki: symbole instalacyjne zamiast piktogramów płytek.** Użytkownik
    przysłał tabelę pięciu łączników z nazwami i symbolami. Dotychczasowy
    rysunek — zaokrąglona „płytka" z prostokątnymi klawiszami — był
    piktogramem wyglądu aparatu, nie symbolem rysunku instalacyjnego, i
    znał tylko dwa typy (zwykły i schodowy) różnicowane licznikiem klawiszy.

    Biblioteka ma teraz pięć osobnych typów, zgodnie z przesłanym
    zestawem: jednobiegunowy, dwubiegunowy, grupowy, zmienny (schodowy) i
    krzyżowy, rysowanych kołem z odchodzącymi dźwigniami zakończonymi
    kreskami biegunów. Zwrócić uwagę na rozróżnienie, które łatwo pomylić:
    **grupowy** (świecznikowy) to ten potocznie zwany podwójnym — steruje
    dwoma obwodami; **dwubiegunowy** przerywa dwa przewody JEDNEGO obwodu.
    Stąd grupowy dostaje dwie dźwignie, a dwubiegunowy jedną z dwiema
    kreskami.

    **Liczba biegunów jest cechą typu, nie osobnym licznikiem.** Wpisy
    łączników straciły `variants: [1, 2]` — skoro symbol niesie tę
    informację, picker klawiszy tylko by ją dublował (i pozwalał na
    bezsensowne kombinacje w rodzaju „krzyżowy ×2").

    **Geometria w jednym miejscu.** `switchGlyph(type)` w `lib/glyphs.ts`
    zwraca koło, odcinki dźwigni i kropkę grupowego; rysują z niego oba
    niezależne renderery (SVG w bibliotece, Konva na planie). Trzymanie
    współrzędnych osobno w każdym z nich — jak przy wcześniejszych glifach —
    gwarantowałoby, że prędzej czy później zaczną pokazywać różne symbole.
    Kąty dźwigni siedzą w jednej tabeli `SW_RODS`, więc dołożenie kolejnego
    wariantu to jeden wiersz.

    **Zgodność ze starymi projektami.** Klucze `wlacznik` i
    `wlacznikSchodowy` zostały zachowane (zmieniły się tylko etykiety), a
    zliczanie `gangs` w kosztorysie zostawiono dla tych dwóch typów — dzięki
    temu projekt zapisany przed tą zmianą, gdzie podwójny łącznik był
    zapisany jako `gangs: 2`, wycenia się dalej tak samo.

    **Kolejność w mapie importu cen ma znaczenie.** `parsePriceCsv` kończy
    dopasowanie na pierwszym trafieniu, a „łącznik" jest podciągiem każdej
    z nowych nazw — warianty musiały więc trafić przed ogólny wpis
    `wlacznik`, inaczej cena np. krzyżowego lądowałaby w pozycji
    jednobiegunowego.

    Przy okazji usunięty martwy parametr `gangs` z `glyphBoxSize` — przestał
    być używany, odkąd gniazda wielokrotne rysują się jak pojedyncze
    (krok 19), a łączniki dostały jedno pudełko dla wszystkich wariantów.
    Sześć nowych testów jednostkowych na samą geometrię (liczba dźwigni per
    typ, prostopadłość kreski bieguna, wyjście dźwigni dokładnie z krawędzi
    koła, mieszczenie się w płytce) plus test e2e spinający trzy warstwy
    naraz: nazwy w katalogu, rysunek na planie i pozycje w kosztorysie —
    rozjazd którejkolwiek z nich przechodzi testom samej geometrii bez
    śladu. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run`
    **166/166** (+6), `npx playwright test` **16/16** (+1), `npx vite
    build` bez błędów.

36. **Poprawka zwrotu kresek biegunów w symbolach łączników.** Użytkownik
    zauważył, że końcowe kreski dźwigni miały zwrot odwrotny do
    zamierzonego — sterczały do góry zamiast schodzić w dół.

    Z dwóch prostopadłych do dźwigni poprzednia wersja brała zawsze tę
    samą, co dawało zwrot zależny od kąta dźwigni. Teraz wybór zależy od
    znaku `ux`: dla dźwigni idącej w prawo właściwa jest jedna
    prostopadła, dla idącej w lewo — druga, więc kreska schodzi w dół
    przy **każdym** z czterech kierunków, nie tylko przy części z nich.
    (Zwykłe odwrócenie znaku, czyli „druga prostopadła" dla wszystkich,
    naprawiłoby połowę przypadków i zepsuło drugą — dlatego znak liczony
    jest z kierunku dźwigni, a nie ustawiony na stałe.)

    Dotychczasowy test sprawdzał tylko **prostopadłość** kresek, więc
    przepuścił błędny zwrot bez mrugnięcia. Dołożony test wprost na to:
    dla każdego typu każda kreska musi mieć `y2 > y1`. Zweryfikowane też
    wizualnie — symbole wyrenderowane w powiększeniu ×5 prosto z
    `switchGlyph`, żeby ocenić zwrot bez zgadywania ze skali planu.

    **Przy okazji utwardzony test e2e łączników.** Podczas robienia
    zrzutu wyszło, że rozwinięcie sekcji w bibliotece wydłuża lewą kolumnę,
    a Playwright przewija stronę, żeby dosięgnąć klikanych przycisków —
    przy przewinięciu `boundingBox()` płótna zwraca **ujemny** `y`, więc
    kliknięcia myszą lądują poza widokiem i po cichu nic nie stawiają.
    Test dostał powrót na górę strony przed pomiarem i przed każdym
    kliknięciem, asercję `box.y >= 0` oraz jawne sprawdzenie, że na planie
    wylądowało dokładnie pięć elementów o oczekiwanych typach. Wcześniej
    pusty plan objawiłby się tylko mylącym „nie znaleziono komórki" w
    kosztorysie zamiast jasnej informacji, że kliknięcia nie trafiły.
    (Sam test nie przechodził pusto — pozycje kosztorysu pojawiają się
    wyłącznie przy ilości > 0 — ale był wrażliwy na stan przewinięcia.)

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` **167/167**
    (+1), `npx playwright test` 16/16, `npx vite build` bez błędów.

37. **Kreski przy dolnych dźwigniach w górę + skrócenie nazwy schodowego.**
    Doprecyzowanie po kroku 36: kreski mają schodzić w dół tylko przy
    dźwigniach idących w górę; przy dolnych ramionach schodowego i
    krzyżowego mają się podnosić.

    Reguła przestała więc zależeć od tego, czy dźwignia idzie w lewo czy w
    prawo (`Math.sign(ux)`), a zaczęła od jej **pionowego** zwrotu:
    prostopadła wybierana jest przeciwnie do niego, więc haczyk zawsze
    zawraca ku poziomowi zamiast przedłużać dźwignię w jej własną stronę.
    Znak liczony z `Math.sign(ux * uy)`, z zabezpieczeniem na dźwignię
    poziomą lub pionową (iloczyn 0), gdzie „przeciwnie do pionu" nie jest
    zdefiniowane i dowolna prostopadła jest równie dobra — bez tego
    dołożenie kiedyś dźwigni pod 0° lub 90° dałoby kreskę o zerowej długości.

    **Test z kroku 36 musiał ustąpić.** Wymuszał zwrot w dół dla
    *wszystkich* kresek, więc po tej zmianie blokowałby poprawne
    zachowanie. Zastąpiony testem relacji — kreska ma zwrot przeciwny do
    swojej dźwigni (wiązanie kreski z dźwignią po kącie od środka) — plus
    osobnym, wprost pod zgłoszenie: dolne dźwignie schodowego i krzyżowego
    mają kreski skierowane w górę.

    Nazwa „Łącznik zmienny (schodowy)" skrócona do **„Łącznik schodowy"**
    w katalogu elementów i w kosztorysie. W mapie importu cen „zmienny"
    zostaje jako alias obok „schodow", bo cenniki bywają opisane jedną
    albo drugą nazwą i nie ma powodu tracić dopasowania.

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` **168/168**
    (+1), `npx playwright test` 16/16, `npx vite build` bez błędów.

38. **Usunięta kropka przy łączniku grupowym.** Na prośbę użytkownika.
    Kropka była jedynym elementem `SwitchGlyph` używanym przez dokładnie
    jeden typ, więc razem z nią zniknęło całe pole `dot` z interfejsu i
    jego obsługa w obu rendererach — zostawianie pola, które zawsze jest
    `null`, tylko sugerowałoby, że coś jeszcze może go wypełnić.

    **Uwaga na skutek uboczny:** grupowy i schodowy mają po dwie dźwignie,
    więc po usunięciu kropki odróżnia je wyłącznie ich układ — grupowy ma
    obie w górę (steruje dwoma obwodami), schodowy jedną w górę i jedną w
    dół (przełącza między torami). Dotychczasowy test sprawdzał obecność
    kropki, czyli dokładnie to, czego już nie ma; zastąpiony testem tej
    różnicy w układzie dźwigni, żeby rozróżnialność obu symboli była
    czymś sprawdzanym, a nie tylko widocznym na zrzucie.

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` 168/168,
    `npx playwright test` 16/16, `npx vite build` bez błędów.

39. **Wgrywanie podkładu przeniesione na górę kolumny.** Kontrolka „Wgraj
    rzut / zdjęcie" wisiała POD biblioteką elementów, czyli ok. 1000 px
    poniżej zgięcia strony — użytkownik musiał się do niej doscrollować,
    zanim w ogóle dowiedział się, że taka opcja istnieje. To ta sama
    obserwacja, która padła w audycie z kroku 28 („upload oderwany od
    płótna, na które działa"), tam nieprzeniesiona do naprawy.

    Blok stoi teraz na samej górze lewej kolumny, nad zakładkami
    Elementy/Pomieszczenia, i **zmienia się zależnie od stanu**:
    - bez podkładu — przerywana ramka w kolorze miedzi, jedno zdanie
      wyjaśnienia i pełnowymiarowy przycisk akcji; blok ma być pierwszą
      rzeczą, którą widać po wejściu w zakładkę;
    - po wgraniu — zwija się do jednego wiersza („Podkład wgrany · Zmień ·
      Usuń"), bo przez resztę pracy miejsce jest potrzebne bibliotece.

    Świadomie **nie** nazwałem tego „Krokiem 1": pasek nawigacji ma już
    własną numerację etapów (1 Zaprojektuj → 2 Rozdzielnica/Schemat →
    3 Kosztorys, krok 20) i druga, równoległa numeracja wewnątrz jednego
    z nich tylko by ją rozmyła. Ekspozycję niesie sama forma bloku.

    Nowy test e2e (`plan-upload.spec.ts`) sprawdza nie tylko to, ŻE
    kontrolka działa, ale też GDZIE stoi: mieści się w pierwszym ekranie
    (`y + height <= wysokość okna`) i leży nad biblioteką elementów. To
    akurat łatwo cofnąć przy przestawianiu JSX, a objawia się wyłącznie
    tym, że nowy użytkownik nie znajduje punktu startowego — czyli
    dokładnie tak, jak było do tej pory. Test pokrywa też oba stany bloku
    i powrót do wezwania po usunięciu podkładu.

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` 168/168,
    `npx playwright test` **17/17** (+1), `npx vite build` bez błędów.

40. **Grupy sterowania oświetleniem — automatyczne kojarzenie łączników z
    punktami świetlnymi.** Nowy moduł `lib/lightGroups.ts` plus numery
    rysowane przy elementach i ręczna zmiana w oknie edycji.

    **Numer JEST tożsamością grupy.** To najważniejsza decyzja
    projektowa: zamiast ukrytego identyfikatora i osobnego interfejsu do
    „przenoszenia między grupami", elementy z tym samym numerem po prostu
    tworzą jedną grupę. Cała reguła, którą użytkownik musi znać, brzmi
    „wpisz numer, do którego chcesz dołączyć" — i to samo, co widzi na
    planie, wpisuje w polu edycji.

    **Reguły automatu:**
    - grupy liczone osobno dla każdej kondygnacji i pomieszczenia —
      łącznik nie steruje światłem w innym pokoju, tym bardziej na innym
      piętrze; elementy bez przypisanego pomieszczenia (`NO_ROOM`) są
      pomijane, bo wrzucenie wszystkich nieprzypisanych do jednej grupy
      byłoby przypadkowe;
    - każdy zwykły łącznik zakłada własną grupę, ale **wszystkie schodowe
      i krzyżowe w pomieszczeniu zakładają jedną wspólną** — one z
      definicji sterują tym samym punktem z kilku miejsc, więc traktowanie
      ich jako konkurencyjnych byłoby błędem merytorycznym;
    - każdy punkt świetlny dołącza do **najbliższego** łącznika w
      pomieszczeniu: przy jednym łączniku daje to oczywiste „wszystko w
      pokoju", a przy kilku dzieli światła zgodnie z tym, jak użytkownik
      rozmieścił je na planie (a plan jest tu jedyną informacją o
      zamiarze);
    - grupa musi mieć i łącznik, i światło — sam łącznik albo samo
      światło nie dostaje numeru, bo numer ma znaczyć „to steruje tamtym",
      a nie „to istnieje";
    - termostat ma rolę `control`, ale steruje ogrzewaniem, więc jest
      świadomie wyłączony z grup świetlnych.

    **Stabilność numeracji** jest wymogiem, nie ozdobą: skoro użytkownik
    ręcznie wpisuje numery, nie mogą one skakać przy każdym dorysowanym
    elemencie. Grupy sortowane są deterministycznie (pomieszczenie, potem
    położenie pierwszego łącznika), co pokrywa osobny test.

    **UI:** numer rysowany jako mała cyfra w kółku przy prawym górnym rogu
    symbolu, w kolorze elementu, obrócony przeciwnie do niego — dzięki
    czemu po obróceniu symbolu klawiszem „R" cyfra dalej stoi prosto.
    Ręczna zmiana w oknie edycji, jako pole liczbowe z podpowiedzią
    `auto: N`; puste pole przywraca automat, więc da się cofnąć decyzję
    bez zgadywania. Pole pokazuje się tylko przy elementach, których
    dotyczy — przy gniazdku czy puszce byłoby bez sensu.

    17 testów jednostkowych na samą logikę (podział na pomieszczenia i
    kondygnacje, najbliższy łącznik, wspólna grupa schodowych, stabilność
    numeracji, pierwszeństwo ręcznego numeru, scalanie przez wpisanie
    cudzego numeru) i 3 e2e na spięcie warstw. Test e2e czyta cyfry z
    **faktycznie narysowanych węzłów Konvy**, a nie z samej logiki —
    inaczej przechodziłby nawet gdyby etykiety w ogóle nie były
    renderowane. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest
    run` **185/185** (+17), `npx playwright test` **20/20** (+3), `npx
    vite build` bez błędów.

41. **Etykiety grup obok symbolu + dwa obwody łącznika grupowego.** Dwie
    uwagi użytkownika do kroku 40: cyfry nachodziły na rysunek i miały
    zbędną obwódkę, a łącznik grupowy powinien mieć cyfrę **przy każdej
    dźwignii**, bo steruje dwiema różnymi lampami.

    Druga uwaga wymusiła zmianę modelu, nie tylko rysunku: element może
    teraz należeć do **wielu** grup, więc `computeLightGroups` zwraca
    `Map<string, number[]>` zamiast pojedynczej liczby. Łącznik grupowy
    rozbijany jest na dwa niezależne obwody (`seedsForControl`), a każdy
    dostaje własny numer.

    **Jak dzielone są lampy między dźwignie.** Oba obwody siedzą fizycznie
    w tym samym punkcie, więc reguła „najbliższy łącznik" nie miałaby ich
    czym rozróżnić. Punkt odniesienia każdego obwodu jest więc odsunięty
    o 50 jednostek w stronę jego dźwigni — dzięki temu lampy z lewej
    trafiają do lewego obwodu, a z prawej do prawego, co pokrywa się z tym,
    co widać na rysunku, i nie wymaga żadnej nowej reguły w interfejsie.

    **Wyjątek od zasady „grupa musi mieć łącznik i światło":** oba obwody
    łącznika grupowego są numerowane, nawet jeśli jeden nie ma jeszcze
    przypisanej lampy — dwie dźwignie to dwa realnie istniejące obwody i
    użytkownik ma je widzieć, także puste. Sam łącznik grupowy w
    pomieszczeniu bez żadnego światła nadal nie dostaje numerów.

    **Rysunek:** pozycje etykiet liczy `groupLabelAnchors` w `glyphs.ts` —
    dla zwykłych elementów jedna pozycja obok obrysu (`w/2 + 8`), dla
    łącznika grupowego dwie, na przedłużeniu każdej dźwigni. Kółko/obwódka
    usunięte, została sama cyfra w kolorze elementu.

    **Ręczna zmiana pozostaje jednowartościowa** i to jest świadome:
    `lightGroup` to jedna liczba, więc dla łącznika grupowego nie dałoby
    się nią wyrazić obu obwodów. Nie jest to jednak utrata możliwości —
    skoro numer JEST tożsamością grupy, wystarczy ustawić numer *lampie*,
    żeby trafiła do wybranego obwodu łącznika. Kierunek „przypisz lampę
    do obwodu" pokrywa ten sam przypadek użycia bez dwuznacznego pola.

    Pięć nowych testów jednostkowych na sam łącznik grupowy (dwa różne
    numery, numerowanie pustego obwodu, podział lamp wg strony, brak
    numerów bez żadnej lampy, brak wpływu na zwykłe łączniki). Pełny
    zestaw: `npx tsc --noEmit` czysto, `npx vitest run` **190/190** (+5),
    `npx playwright test` 20/20, `npx vite build` bez błędów.

42. **Dwa pola grupy dla łącznika grupowego — naprawa błędu z kroku 41.**
    Przy okazji pytania użytkownika „w jaki sposób ręcznie zmieniać
    grupy?" wyszło, że opisałem w kroku 41 zachowanie, którego w kodzie
    nie było: twierdziłem, że przy łączniku grupowym ręcznej zmiany się
    nie oferuje. Pole tam jednak było, a wpisanie w nie numeru **po cichu
    gubiło drugi obwód** — łącznik zostawał z jedną cyfrą zamiast dwóch.

    Użytkownik wybrał naprawę przez dwa pola, po jednym na dźwignię. To
    wymusiło zmianę modelu: ręczne nadpisanie jest teraz **per obwód**, a
    nie per element (`lightGroup?: (number | null)[]`), więc da się
    ustawić jedną dźwignię i zostawić drugą automatowi. `null` na pozycji
    oznacza „ten obwód dobierz sam".

    W `computeLightGroups` z automatu wypada teraz **konkretny obwód**, a
    nie cały element — wcześniej ręczne przypisanie wyłączało element w
    całości, co przy dwóch dźwigniach byłoby niepoprawne. Wynik to
    `Map<string, (number | undefined)[]>` z zachowanymi dziurami: pozycja
    w tablicy to numer obwodu i zarazem indeks etykiety na rysunku, więc
    zsunięcie dziur wrzuciłoby numer prawej dźwigni pod lewą.

    Dodana tolerancja starego zapisu (`lightGroup` jako pojedyncza
    liczba) w `manualGroups` — funkcja żyła jedną turę, ale zdążyła
    trafić do autozapisu w przeglądarce użytkownika i bez tego jego
    ręczne ustawienia zniknęłyby po tej zmianie.

    **Dwa błędy w testach e2e znalezione po drodze**, oba tej samej
    natury: pomiar płótna przed akcją, która zmienia układ strony.
    Wejście w tryb „Pomieszczenie" **dokłada** do paska wybór kształtu i
    zsuwa płótno o ~46 px, a wybór elementu z biblioteki ten pasek
    **zwija** i podnosi je z powrotem. Helpery mierzyły `boundingBox()`
    przed tymi zmianami, więc kliknięcia lądowały 46 px niżej niż
    zamierzone: elementy wypadały poza narysowane pomieszczenie i —
    zgodnie z regułą `NO_ROOM` — traciły grupę. Objawiało się to
    „0 etykiet" i wyglądało jak błąd funkcji, a nie testu. Oba helpery
    mierzą teraz płótno po zmianie narzędzia; `drawRoom` dostał dodatkowo
    asercję, że przeciągnięcie mieści się w oknie — inaczej drag poza
    ekran kończył się cichym timeoutem na oknie „Nazwij pomieszczenie"
    zamiast komunikatem o przyczynie.

    Trzy nowe testy jednostkowe (nadpisanie jednej dźwigni, obu, oraz
    tolerancja starego zapisu) i nowy e2e sprawdzający, że łącznik
    grupowy ma dwa pola i że ustawienie samej prawej daje `[null, 42]`.
    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run`
    **193/193** (+3), `npx playwright test` **21/21** (+1), `npx vite
    build` bez błędów.

43. **Suwak rozmiaru symboli, stopka i wyeksponowany nagłówek.**

    **43a — suwak rozmiaru elementów.** Skaluje SAME symbole na planie, a
    nie widok: `Ctrl+scroll` przybliża cały rysunek razem z podkładem,
    więc nie da się nim zmienić proporcji symboli do rzutu — a to właśnie
    ona bywa zła, bo przy gęstym rzucie symbole się zlewają, a przy
    rzadkim giną. Zakres 0,6–2,0×, przycisk „reset" pojawia się dopiero
    po zmianie. Skala trafia na grupę Konvy elementu, więc obejmuje też
    obwódkę zaznaczenia, cel trafień i etykietę grupy — wszystko rośnie
    razem, zamiast rozjeżdżać się względem symbolu. Stan lokalny w
    `DesignTab`, jak `snapOn` i `showZones`: to ustawienie widoku, a nie
    dana projektu, więc nie ma powodu wozić go w zapisie.

    **43b — stopka.** Poza domknięciem strony niesie zastrzeżenie, którego
    w aplikacji do projektowania instalacji brakować nie powinno: dobór
    zabezpieczeń, przekrojów i kosztorys są **orientacyjne**, nie
    zastępują projektu ani odbioru przez osobę z uprawnieniami, a prace
    pod napięciem może wykonywać wyłącznie uprawniony elektryk. Przy
    aplikacji adresowanej głównie do laików (krok 20) to musi być widoczne
    na stronie, a nie schowane w regulaminie — stąd też test e2e, żeby nie
    zniknęło przy porządkach w układzie.

    **43c — nagłówek.** Logo miało `text-lg`, czyli tyle samo co etykiety
    przycisków obok, i ginęło w pasku; hasło było wyszarzone na
    `slate-500`. Teraz: znak graficzny (miedziany kwadrat z ikoną) jako
    punkt zaczepienia dla oka, nazwa w `text-2xl font-bold`, hasło w
    `text-[15px]` i kolorze tekstu zamiast szarości. Nazwa projektu
    przesunięta pod hasło, żeby hierarchia szła od najważniejszego.

    Trzy testy e2e (`shell-ui.spec.ts`). Ten od suwaka sprawdza rzecz,
    którą łatwo zepsuć niezauważenie: skala symbolu rośnie, ale
    **współrzędne elementu zostają te same** — czyli suwak powiększa
    rysunek, a nie przesuwa instalację po planie. Test nagłówka mierzy
    realny `font-size` z `getComputedStyle`, więc złapie ciche cofnięcie
    wielkości logo. Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest
    run` 193/193, `npx playwright test` **24/24** (+3), `npx vite build`
    bez błędów.

44. **Tag obwodu (F1, F2…) przeniesiony znad symbolu na bok, do pary z
    wartością zabezpieczenia.** Zgłoszenie użytkownika: tag wisiał osobno
    nad glifem MCB, a wartość (B10/B16…) osobno obok — nie czytało się
    ich jako jednej pary, tag wyglądał jak podpis SYMBOLU, nie OBWODU.

    Obie linie stoją teraz razem z prawej strony glifu, tag nad wartością
    — dokładnie ten sam wzorzec co przy pozostałych aparatach
    (`RcdBranch`, `SpdBranch`, `MainSwitch`), gdzie tag i wartość od
    zawsze były parą w tym samym miejscu. Odsunięcie od osi przewodu
    zostaje to samo (`MCB_LABEL_DX`, liczone z najszerszego punktu glifu
    — krok 26), więc obie linie nadal omijają strzałkę wyzwalacza.

    Skutek uboczny do sprzątnięcia: tag przestał leżeć na przewodzie
    (był wyśrodkowany na jego osi), więc biała „poświata" pod spodem
    (`paintOrder="stroke"`, krok 25 — naprawiała czytelność „B16" mylonego
    z „B6", gdy kreska przewodu przebijała się przez cyfry) straciła rację
    bytu i została usunięta z obu linii, razem z powodującym ją opisem w
    komentarzu.

    Pełny zestaw: `npx tsc --noEmit` czysto, `npx vitest run` 193/193,
    `npx playwright test` 24/24, `npx vite build` bez błędów.

45. **Elastyczny obszar planu + aktualizacja Vite 5 → 8.** Dwie pozycje
    wybrane przez użytkownika z listy „co dalej".

    **45a — obszar planu.** Plan miał sztywne 1000×700 i po cichu
    przycinał współrzędne: kliknięcie poza nim (możliwe po oddaleniu
    widoku) stawiało element przy krawędzi, bez śladu, że coś poszło nie
    tak. Naprawione trzema rzeczami:
    - `planPoint` zwraca teraz `null` poza obszarem zamiast przycinać, a
      `DesignTab` pokazuje krótką podpowiedź, dlaczego nic nie powstało.
      Do TRWAJĄCEGO przeciągania został osobny `clampedPlanPoint` —
      tam przycinanie jest poprawne, bo figura i tak ma zostać w planie;
    - obszar planu jest widocznie obrysowany, więc po oddaleniu widoku
      wiadomo, dokąd wolno rysować;
    - rozmiar planu przeniesiony do projektu (`planSize` w store) i
      **dopasowywany do proporcji wgranego rzutu**.

    To ostatnie naprawia przy okazji błąd, którego nie było na liście:
    podkład był dotąd rozciągany do 1000×700 niezależnie od swoich
    proporcji, więc zdjęcie 16:9 lądowało ściśnięte. To nie kwestia
    estetyki — kalibracja skali mierzy odcinek na obrazie, a przy
    zniekształceniu przelicznik metrów wychodzi inny w poziomie niż w
    pionie, i od niego zależą strefy ochronne oraz długości tras.
    Dopasowanie zachowuje zbliżone pole powierzchni (żeby nie zmieniać
    gęstości siatki) i zaokrągla wymiary do wielokrotności `GRID`.
    Dzieje się **tylko przy wgrywaniu podkładu**, czyli świadomej akcji
    użytkownika — istniejący plan z rozstawionymi elementami nigdy nie
    przeskakuje sam z siebie.

    **45b — Vite 5 → 8, Vitest 2 → 4.** Zamyka 5 podatności zgłaszanych
    przez `npm audit` (`npm audit` po aktualizacji: **0 vulnerabilities**),
    odłożonych od kroku 16 jako zbyt ryzykowne. Przy okazji build
    przyspieszył z ~3,5 s do **~1,05 s**. Konieczna była czysta instalacja
    (`rm -rf node_modules package-lock.json`) — npm nie potrafił
    przeliczyć drzewa w miejscu i zgłaszał konflikt peer-dependency na
    `@vitejs/plugin-react`, mimo że deklarowane zakresy były zgodne.
    `vite.config.ts` przeszedł z `__dirname` na `import.meta.dirname`,
    bo Vite 8 ostrzega, że natywne ładowanie konfiguracji (domyślne w
    kolejnej wersji głównej) nie da już zmiennych CommonJS.

    **Dwie fałszywe diagnozy po drodze, obie moje.** (1) Po aktualizacji
    cała aplikacja przestała się renderować z błędem
    `__SERVER_FORWARD_CONSOLE__ is not defined` — wyglądało to na problem
    z Vite 8. W rzeczywistości na porcie 5173 wisiał serwer deweloperski
    uruchomiony PRZED czystą instalacją, któremu usunąłem `node_modules`
    spod nóg; Playwright podpinał się pod niego przez
    `reuseExistingServer`. Po ubiciu procesu wszystko działało.
    (2) Dwa nowe testy `plan-area` padały na `window.Konva is undefined` —
    to nie regresja, tylko wyścig: `DesignTab` (razem z Konvą) ładuje się
    leniwie, a ja czytałem scenę zaraz po wejściu w zakładkę. Wcześniej
    ratował mnie przypadek, bo inne testy klikały po drodze więcej rzeczy.
    Helper czeka teraz jawnie na powstanie sceny.

    Nowy plik `e2e/_png.ts` generuje poprawne PNG-i do testów zamiast
    wklejonego base64 — pierwszą wersję fikstury skleiłem ręcznie tak, że
    nagłówek deklarował właściwe wymiary, ale dane pikseli były
    uszkodzone; obraz się nie ładował i wyglądało to, jakby aplikacja nie
    reagowała na wgranie podkładu.

    Pełny zestaw po aktualizacji: `npx tsc --noEmit` czysto, `npx vitest
    run` **198/198** (+5), `npx playwright test` **26/26** (+2), `npx
    vite build` bez błędów, `npm audit` bez podatności, `eslint` bez
    błędów (2 wcześniejsze ostrzeżenia o fast-refresh bez zmian).

46. **Domyślny rozmiar symboli 0,7× bazowej geometrii, suwak dalej pokazuje
    1,0×.** Bazowa geometria glifów okazała się za duża w skali planu —
    przy gęściej rozstawionych punktach symbole zaczynały się zlewać.
    Pierwsze podejście zeszło z domyślną wartością SUWAKA z 1,0 na 0,7 —
    ale to sprawiało, że suwak przy starcie pokazywał „0.7×", czyli
    mylące „już coś zmieniono", mimo że użytkownik niczego nie ruszał.

    Docelowo rozdzielone na dwie stałe w `DesignTab.tsx`:
    `BASE_ELEMENT_SCALE = 0.7` — stały mnożnik geometrii, niewidoczny dla
    użytkownika — i `DEFAULT_ELEMENT_SCALE = 1` — wartość suwaka. Render
    dostaje `elementScale * BASE_ELEMENT_SCALE`, więc realny rozmiar na
    planie zostaje taki sam (70% bazowej geometrii), ale suwak przy
    starcie i po „reset" pokazuje „1.0×" — punkt odniesienia „bez zmian",
    a nie mylącą wartość ułamkową. Dolny kraniec zakresu suwaka wrócił z
    0,4 na pierwotne 0,6 (zakres wartości WZGLĘDEM bazy, nie bezpośredni
    rozmiar renderu).

    Wartość `DEFAULT_ELEMENT_SCALE` nadal występuje w trzech miejscach:
    stanie początkowym, warunku pokazania przycisku „reset" i samym
    resecie — przy poprzednim podejściu (0,7 jako wartość suwaka)
    złapałem tu niekompletną podmianę testem; przy tym refaktorze
    wszystkie trzy miejsca zostały, zmienił się tylko sens stałej.

    Test w `shell-ui.spec.ts` sprawdza teraz REALNĄ skalę w Konvie
    (`elementScale × BASE_ELEMENT_SCALE = 0,7`) przy starcie i po
    resecie, niezależnie od tego, co pokazuje suwak — a osobno, że
    wpisanie „2" w suwak daje wyświetlone „2.0×" i realną skalę
    `2 × 0,7 = 1,4`.

    `npx tsc --noEmit` czysto, `npx vitest run` 198/198, `npx playwright
    test` 26/26, `npx vite build` bez błędów.

47. **Dobór obwodów liczony z normy zamiast wpisany na sztywno.** Do tej pory
    `computeCircuits` przypisywał obwodom stałe stringi — każdy obwód gniazdowy
    dostawał `"YDYp 3x2,5 mm²"` i `"B16"` niezależnie od mocy, długości trasy
    i sposobu ułożenia. Trzy braki blokujące: `ELEMENT_TYPES` nie miał żadnej
    mocy, `Circuit` nie miał żadnej wielkości elektrycznej, a długość kabla
    w kosztorysie to `elements.length * 5 + 10`, czyli zgadywanie wprost.

    Nowa warstwa obliczeniowa, cztery moduły w `src/lib/panel/`:

    - `norms.ts` — same tablice PN-HD 60364-5-52: obciążalność (metody
      odniesienia A1/A2/B1/B2/C × 2 i 3 żyły obciążone), współczynnik
      temperaturowy k1 z interpolacją liniową, współczynnik grupowania k2
      schodkowo, szereg prądów znamionowych, krotności B/C/D. Wydzielone jako
      czyste dane, żeby dały się sprawdzić z normą w ręku bez czytania logiki.
    - `sizing.ts` — dobór iterujący po przekrojach tak, by JEDNOCZEŚNIE spełnić
      Ib ≤ In ≤ Iz i limit spadku napięcia (3% oświetlenie, 5% reszta). Celowo
      nie dwa niezależne dobory: przekrój dobrany tylko pod obciążalność
      potrafi nie przejść spadku na długiej trasie i odwrotnie.
    - `loads.ts` — moce typowe punktów, współczynnik jednoczesności i szacowanie
      trasy po obrysie (Manhattan) z naddatkiem pionowym. Trasa po przekątnej
      zaniża długość o ~40%.
    - `project.ts` — spina rysunek z doborem, bilans faz i rezerwę modułów.

    Dwie decyzje warte zapamiętania, bo obie są nieoczywiste:

    **Bilans faz liczony po prądzie obliczeniowym, nie po prądzie znamionowym
    zabezpieczenia.** Dwa obwody B16 wyglądają identycznie „po zabezpieczeniu",
    ale jeden może ciągnąć 3 A, a drugi 15 A. Bilansowanie po In rozkłada równo
    APARATY, nie OBCIĄŻENIE — a to obciążenie płynie w przewodzie neutralnym.
    Stary `computePhaseLoad` (po In) został, bo opisuje rozkład modułów, ale
    `computeSelectivity` przyjmuje teraz opcjonalny `phaseLoadOverride`, żeby
    obie sekcje w zakładce nie pokazywały dwóch różnych liczb dla tej samej rzeczy.

    **Zabezpieczenie wymiarowane pod docelową obsadę, nie pod podpiętą moc.**
    Obwód z dwiema lampkami LED po 8 W dostaje B10, a nie B6 — za rok wisi tam
    pięć opraw. `PREFERRED_RATING_FOR` ustawia podłogę (B10 oświetlenie,
    B16 gniazda); dobór schodzi niżej tylko gdy obciążalność nie pozwala,
    i wtedy zgłasza to jako `IN_PONIZEJ_TYPOWEGO`.

    Braki danych dają ostrzeżenie, nie domyślną wartość: bez kalibracji skali
    planu nie ma długości trasy, więc spadek napięcia zwraca `null` z kodem
    `BRAK_DLUGOSCI` zamiast liczby policzonej z długości wziętej z sufitu.

    Wpięcie w UI: zakładka Rozdzielnica dostała kartę „Dobór obwodów wg
    PN-HD 60364" z tabelą (Ib, przekrój, aparat, Iz, ΔU, Zs max, typ RCD),
    listą ostrzeżeń per obwód i wymaganym zastrzeżeniem prawnym. Bilans faz
    pokazuje teraz też udział procentowy.

    Testy: 47 nowych jednostkowych (`sizing.test.ts`, `loads.test.ts`,
    `project.test.ts`) — każde oczekiwanie ma obok rachunek, z którego wyszło —
    oraz 3 e2e w `panel-sizing.spec.ts` sprawdzające samo WPIĘCIE: że obwód
    gniazdowy i oświetleniowy dostają RÓŻNE wartości (gdyby dobór nie działał,
    oba miałyby tę samą stałą) i że brak skali daje kreskę zamiast liczby.

    Jeszcze nie zrobione: render SVG rozdzielnicy wg specyfikacji oraz
    przepisanie długości w kosztorysie na policzone zamiast `n*5+10`.

    `npx tsc --noEmit` czysto, `npx vitest run` **245/245** (+47),
    `npx playwright test` **29/29** (+3), `npx vite build` bez błędów.

48. **Render SVG rozdzielnicy + jedno źródło obwodów + metraż z planu.**
    Trzy rzeczy, które wyszły z jednego ciągu pracy.

    **Render.** Nowy `PanelRender.tsx` — widok czołowy w SVG, świadomie BEZ
    przewodów: żadnych żył, wiązek ani szyn grzebieniowych. Na zdjęciu gotowej
    rozdzielnicy przewody zasłaniają połowę aparatów, a rysunek ma służyć do
    rozpoznania, CO gdzie siedzi i jakie ma nastawy. Przynależność obwodu do
    różnicówki pokazuje KLAMRA nad grupą — informacja logiczna, nie fizyczna
    trasa. Kolory faz siedzą na etykietach jako kropki, bo przewodów nie ma.
    SVG, a nie Konva jak w `PanelCanvas`, bo widok ma się skalować z szerokością
    strony i zachować tekst jako tekst (wydruk, eksport, telefon) — płótno
    rastrowe nie daje żadnej z tych rzeczy.

    Przy okazji `PHASE_COLORS` zmieniło się z czerwony/czarny/fioletowy na
    **brązowy/czarny/szary** wg PN-HD 308 S2. Poprzednie kolory były ładne, ale
    niezgodne z tym, co elektryk zobaczy w puszce.

    Dwie poprawki wyszły dopiero ze zrzutu ekranu (Playwright robi screenshot,
    panel przeglądarki w tym środowisku nie): kółko kasowania lądowało na pasie
    oznaczeń i klamrze różnicówki (przeniesione na lico aparatu), a podpisy pod
    aparatami 1-modułowymi (36 px) zlewały się w nieczytelny ciąg — nazwa obwodu
    idzie teraz PIONOWO, jak na realnych legendach rozdzielnic.

    **Jedno źródło obwodów.** Zrzut ujawnił realny błąd: lico aparatu pokazywało
    `B10` (stała z `computeCircuits`), a etykieta pod nim `3x2,5 mm²` (z doboru)
    — dwie różne odpowiedzi na tym samym aparacie. Powód: `buildPanelDevices`
    czytał `c.breaker`, którego dobór nie dotykał. Nowe `applySizing` nadpisuje
    w obwodach kabel i zabezpieczenie wynikiem doboru, a `computeSizedCircuits`
    jest teraz JEDNYM wejściem dla Rozdzielnicy, Schematu i Kosztorysu — wcześniej
    każda z tych zakładek wołała `computeCircuits` osobno i pokazywała stare stałe.
    Sufiks `" 3-faz."` musi przetrwać podmianę, inaczej aparat 3-biegunowy zwęża
    się do jednego modułu; jest na to test.

    **Metraż.** `computeCosts` przyjmuje opcjonalne `routeLengthsM` i liczy kabel
    z realnych tras po planie zamiast ryczałtu `elements.length * 5 + 10`. Obwód
    z pięcioma gniazdami tuż przy rozdzielnicy i taki sam na drugim końcu domu
    dostawały dotąd identyczne 35 mb. Bez kalibracji skali albo bez rozdzielnicy
    na rysunku ryczałt zostaje, ale wynik niesie `cableLengthSource`, a Kosztorys
    mówi wprost, skąd wzięły się metry — kosztorys nie ma udawać policzonego,
    kiedy jest zgadnięty.

    Uwaga: `PanelCanvas.tsx` (202 linie, Konva) nie jest już nigdzie używany.
    Zostawiony świadomie — projekt nie jest repozytorium git, więc skasowanie
    byłoby nieodwracalne. Do usunięcia przy okazji, jeśli render SVG się obroni.

    `npx tsc --noEmit` czysto, `npx vitest run` **253/253** (+8),
    `npx playwright test` **29/29**, `npx vite build` bez błędów,
    `eslint` bez błędów (2 znane ostrzeżenia o fast-refresh).

49. **Onboarding „Zacznij w 3 krokach".** Przewodnik dla właściciela domu, nie dla
    elektryka: od wgranego rzutu do pierwszego postawionego elementu.

    Kluczowe: onboarding jest WARSTWĄ nad istniejącymi narzędziami, a nie drugą
    ich implementacją. Kalibracja skali, rysowanie pomieszczeń i biblioteka
    elementów działały wcześniej — przewodnik tylko do nich prowadzi.

    **Ukończenie kroku wynika z FAKTÓW, nie z klikania w kartę.** `reconcile`
    w `lib/onboarding.ts` porównuje zapisane flagi ze stanem projektu (czy jest
    skala, nazwane pomieszczenie, element), więc ktoś, kto pominął przewodnik
    i sam sięgnął po linijkę z paska, dostaje krok odhaczony automatycznie.
    Flagi są przy tym LEPKIE: skasowanie jedynego pomieszczenia miesiąc później
    nie wskrzesza przewodnika komuś, kto dawno umie obsługiwać aplikację.

    **Skala 1:50 sama w sobie nie wystarcza do przeliczenia.** Mówi, ile razy
    rysunek jest mniejszy od rzeczywistości, ale nie mówi, jak duży jest rysunek.
    Szybka ścieżka pyta więc dodatkowo o format arkusza (A4/A3/A2/A1) — dopiero
    to daje wymiar fizyczny. Wynik pokazujemy do potwierdzenia („rzut ma wtedy
    ok. 42,0 m szerokości"), bo założenie „rysunek wypełnia szerokość arkusza"
    jest założeniem, nie pomiarem. W stopce skalę pokazujemy jako szerokość rzutu
    w metrach, a nie jako „1:50" — laik może zweryfikować pierwsze, nie drugie.

    Blokowanie jest miękkie: bez skali biblioteka dostaje przygaszony blok
    „Dostępne po kalibracji" z linkiem „Pomiń / ustawię później", a praca bez
    skali jest możliwa — z trwałym banerem o niedokładnych długościach.

    **Pozycjonowanie karty kosztowało dwa nieudane podejścia, oba wykryte testami:**
    - Pływająca w prawym dolnym rogu ZASŁANIAŁA PŁÓTNO i przechwytywała kliknięcia
      — `plan-area.spec` zaczął padać, a `document.elementFromPoint` w miejscu
      kliknięcia zwracał akapit z karty. Początkujący dostałby martwy róg rysunku
      dokładnie wtedy, gdy przewodnik każe mu klikać na planie.
    - Zadokowana w kolumnie narzędzi zepchnęła bibliotekę o ~200 px, przez co klik
      w bibliotekę przewijał stronę i wynosił płótno poza ekran (`box.y = -349`).
      Padło 11 testów, w tym `plan-upload.spec`, który pilnuje, że „Wgraj rzut"
      jest widoczne BEZ scrollowania — to zabezpieczenie z wcześniejszego kroku,
      gdy przycisk był zakopany i nikt go nie znajdował.
    - Docelowo: `fixed` w lewym dolnym rogu, NAD kolumną narzędzi. Nie zmienia
      układu (więc nie rusza niczego pod spodem) i nie dotyka płótna.

    W obu przypadkach diagnoza wyszła z POMIARU (`elementFromPoint`, `boundingBox`),
    a nie z teorii — pierwsza hipoteza (przerysowanie kasuje skalę sceny Konvy)
    była błędna i pomiar obalił ją w jednym przebiegu.

    Stan onboardingu żyje w `ProjectPayload`, więc jedzie z projektem do chmury;
    migawki sprzed tej zmiany dostają `pominiety: true`, żeby przewodnik nie
    wyskoczył komuś w projekcie prowadzonym od miesięcy. Osobna flaga w
    localStorage („widział kiedykolwiek") włącza wersję skróconą.

    Dostępność: karta to `<aside>` z `aria-label`, kroki mają status czytany przez
    czytnik ekranu, pasek postępu ma `role="progressbar"`, coach-mark to `role="dialog"`
    zamykany Escape. Świadomie BEZ focus trapu — ma podpowiadać, gdzie kliknąć,
    a nie odbierać kontrolę. Animacje wyłączane przy `prefers-reduced-motion`.

    Komponenty: `OnboardingChecklist`, `CoachMark`, `ScaleCalibrationTool`
    (wyciągnięty z `DesignTab` razem z walidacją zakresu 0,1–100 m), hook
    `useOnboardingProgress`. Rolę „OnboardingProvider" pełni slice store'a plus
    hook — dokładanie Contextu tylko dla nazwy rozjechałoby konwencję projektu.

    `npx tsc --noEmit` czysto, `npx vitest run` **274/274** (+21),
    `npx playwright test` **35/35** (+6), `npx vite build` bez błędów,
    `eslint` bez błędów.

50. **Wielokondygnacja: dziedziczenie skali (domknięcie przypadku brzegowego 4).**
    `addFloor` przepisuje na nową kondygnację skalę bieżącej, a gdy ta jej nie ma —
    pierwszej skalibrowanej w projekcie. Piętro rysuje się w tej samej skali co
    parter, więc kazanie użytkownikowi kalibrować każdą kondygnację osobno to nie
    tylko powtarzanie tej samej czynności, ale i ryzyko, że ten sam budynek dostanie
    dwa różne przeliczniki. Bez żadnej skalibrowanej kondygnacji nowa też skali nie
    dostaje — nic nie zmyślamy.

    Pomieszczenia zostają WŁASNE: bez nich elementy nie trafią do właściwych pokoi,
    a strefy mokre i obwody kuchenne nie zadziałają. Pełna karta przewodnika się nie
    powtarza (jest projektowa, nie per kondygnacja) — kolejne kondygnacje dostają
    tylko krótką prośbę „ma już skalę z parteru, ale nie ma jeszcze pomieszczeń".

    Test e2e sprawdza jedno i drugie naraz: że wskaźnik szerokości rzutu na piętrze
    ma DOKŁADNIE tę samą wartość co na parterze i że przewodnik nie cofa się do
    kroku 1. Pierwsza wersja asercji („karta znika") była błędna — krok 3 nie był
    jeszcze zrobiony, więc karta słusznie wisiała.

    `npx tsc --noEmit` czysto, `npx vitest run` **278/278** (+4),
    `npx playwright test` **36/36** (+1), `npx vite build` bez błędów.

51. **Przebudowa UI wg makiety.** Układ powłoki i edytora zbliżony do przesłanej
    makiety, bez usuwania funkcji.

    **Powłoka.** Kalkulatory i Protokoły przeniesione z paska etapów do nagłówka —
    nie są krokami projektowania domu, tylko niezależnymi narzędziami (patrz
    „Decyzje produktowe"), więc mieszanie ich z 01→02→03 mylnie sugerowało, że są
    częścią tej samej ścieżki. Etapy dostały kafle z numerem, tytułem i podtytułem
    („Rozdzielnica / Dobór i schemat"), bo samo słowo „Rozdzielnica" nic laikowi
    nie mówi. Numer, plakietka `auto` i podtytuł są `aria-hidden`, żeby nazwą
    dostępnościową przycisku został sam tytuł etapu.

    **Edytor.** Narzędzia rysowania wyjęte z poziomego paska do pionowego
    `ToolRail` przy krawędzi płótna: to dwie różne rzeczy — CZYM rysuję (pasek
    pionowy) i JAK patrzę (pasek poziomy: podkład, siatka, rozmiar symboli,
    strefy, cofnij/ponów, powiększenie) — a wcześniej stały w jednym rzędzie.
    Kondygnacje zeszły z powłoki do paska edytora (`FloorBar`), bo dotyczą
    wyłącznie rysowania planu; przy okazji zniknął zdublowany nagłówek
    „Zaprojektuj instalację", który powtarzał to, co mówi kafel etapu.

    Nowy `EditorStatusBar` pod płótnem: kondygnacja, powierzchnia obrysowanych
    pomieszczeń, liczba elementów, skala, pozycja kursora i stan zapisu. Wymagało
    to dwóch rzeczy, których nie było: `polygonArea`/`polygonAreaM2` w `geometry.ts`
    (wzór Gaussa; skala przelicza się KWADRATOWO — jest na to test) oraz
    raportowania pozycji kursora przez `DesignCanvas`.

    **Powiększenie** przestało być wyłącznie imperatywne na scenie Konvy i stało
    się sterowanym propem, bo pasek musi mieć skąd wziąć aktualną wartość do
    pokazania. Wcześniej zoom był dostępny tylko przez Ctrl+scroll, czyli
    praktycznie niewykrywalny.

    **Świadome odstępstwa od makiety:**
    - Hasło strony zostaje w nagłówku (makieta go nie ma) — aplikacja jest dla
      laików i to jedyne zdanie mówiące od razu, co ona robi.
    - „Schemat" dostał WŁASNY kafel 03 z plakietką `auto` (Kosztorys przesunął się
      na 04). Wcześniej wisiał jako mały przycisk w kaflu etapu 02 — po
      usamodzielnieniu podtytuł etapu 02 zszedł z „Dobór i schemat" na „Dobór
      zabezpieczeń", bo obiecywanie schematu w kaflu, który go już nie otwiera,
      wprowadzałoby w błąd co do tego, gdzie go szukać.
    - Narzędzie nazywa się „Pomieszczenie" (poj.), nie „Pomieszczenia" — rysuje
      JEDNO pomieszczenie naraz. Zmiana na l. mnogą wywaliła 12 testów i była
      po prostu niepoprawna: makietowa etykieta opisuje panel z listą, nie narzędzie.
    - Skala pokazywana jako „1 jedn. = X cm", a nie „1:50" — sam mianownik nie
      wystarcza bez formatu arkusza (patrz krok 49).

    Zmiana nazwy etapu 1 („Zaprojektuj instalację" → „Instalacja") pociągnęła
    aktualizację 21 odwołań w testach e2e. Symbole elementów NIE były ruszane.

    **Cztery regresje wyszły z testów, nie z oglądania ekranu** — wszystkie były
    skutkiem przestawiania układu i żadnej nie widać na zrzucie:
    - pasek narzędzi przełączał też panel boczny, więc po obrysowaniu pomieszczenia
      znikała biblioteka elementów — dokładnie wtedy, gdy typowo się jej używa
      (stawianie gniazdek w świeżo narysowanym pokoju). Pasek wybiera NARZĘDZIE,
      panel zostaje pod kontrolą użytkownika;
    - coach-mark stracił kotwicę razem ze starym paskiem i przestał się renderować;
    - po przypięciu do paska PIONOWEGO dymek wychodził poza dolną krawędź okna
      (szósta pozycja paska), więc „Rozumiem" był nieklikalny — teraz staje OBOK
      narzędzia, z przycięciem obu współrzędnych do widocznego obszaru;
    - sterowanie podkładem zdublowało się między paskiem a kolumną (dwa „Zmień").

    Uwaga warsztatowa: przy tej zmianie TRZY RAZY z rzędu backtick w `node -e`
    zjadł fragment wstawianego tekstu (ten sam błąd co w kroku 45). Treści
    zawierające znaczniki kodu wstawiać narzędziem Edit, nie skryptem w powłoce.

    `npx tsc --noEmit` czysto, `npx vitest run` **284/284** (+6),
    `npx playwright test` **37/37**, `npx vite build` bez błędów, `eslint` bez błędów.

52. **Brakująca klasa `.pe-btn-copper` — osiem niewidocznych przycisków.**
    Zgłoszone jako „przycisk »Zatwierdź skalę« nie ma obramowania", ale problem
    był szerszy: klasa zniknęła z arkusza przy migracji na komponent `Button`
    (jego warianty ją zastąpiły), a OSIEM surowych `<button>` w aplikacji nadal
    się do niej odwoływało — renderowały się jako goły tekst, bez tła i bez
    obramowania. Poza kalibracją skali dotyczyło to m.in. „Eksportuj CSV"
    w Kosztorysie, przycisku w Protokołach, wszystkich CTA w karcie onboardingu
    i przycisku „Rozumiem" w coach-marku.

    Klasa dodana z powrotem, zgodnie z wariantem `copper` komponentu `Button`
    (tło #C1793F, biały tekst, przyciemnienie na hover, wygaszenie przy
    `:disabled`).

    Test regresyjny w `shell-ui.spec.ts` sprawdza, że przycisk akcji głównej ma
    NIEPRZEZROCZYSTE tło. To klasa błędu, której nie złapie żaden test
    funkcjonalny: przycisk cały czas DZIAŁAŁ, tylko wyglądał jak etykieta —
    i właśnie dlatego przeżył kilka kroków niezauważony.

    `npx tsc --noEmit` czysto, `npx vitest run` **284/284**,
    `npx playwright test` **37/37** (+1), `npx vite build` bez błędów.

53. **Auto-detekcja ścian i pomieszczeń z wgranego rzutu.**

    **Wybór narzędzia.** Czysty TypeScript w Web Workerze, bez OpenCV.js. Ta
    biblioteka to ~8 MB WASM przy bundlu 354 kB — dwudziestokrotny wzrost dla
    funkcji, której część użytkowników nigdy nie odpali, na urządzeniu, na którym
    laik ogląda rzut z telefonu. Odpadło też API w chmurze (rzut czyjegoś domu
    wychodzi na zewnątrz, wymaga backendu, nie działa offline) i model ML
    w przeglądarce (brak gotowego modelu dla rzutów). Jedyna dołożona zależność to
    `pdfjs-dist`, ładowana DYNAMICZNIE — trafia do bundla dopiero przy pierwszym PDF-ie.

    **Dwie decyzje algorytmiczne.** Ściany szukane jako ciągi tuszu wzdłuż
    kierunków dominujących, nie transformatą Hougha po krawędziach: ściana na
    rzucie to wypełniony pasek, więc detektor krawędzi zwraca DWIE równoległe
    linie na jedną ścianę i trzeba je potem sklejać zgadując, która z którą.
    Pomieszczenia przez odwrócenie problemu — zalanie tła od krawędzi obrazu, a co
    zostanie, jest otoczone ścianami; odporne na niedbale narysowany obrys.

    **Kontrakt danych.** `DetectedGeometry` jest wspólny dla detekcji i rysowania
    ręcznego (różni je tylko pole `zrodlo`), a sesja trzyma OSOBNO wersję „wykrytą"
    i „zatwierdzoną" — bez tego nie da się policzyć metryki „odsetek rzutów
    zatwierdzonych bez większych poprawek".

    **Świadome „nie wiem".** Typ pomieszczenia NIE jest zgadywany: bez skali nie
    znamy metrażu, bez rozpoznania armatury nie mamy przesłanek. Wpisanie
    „Łazienka" na chybił trafił usypia czujność przy weryfikacji, a to właśnie
    weryfikacja jest tu sednem. Pomieszczenia dostają numery, typ wybiera człowiek.

    **Test odsłonił błąd wag pewności.** Idealnie prostokątna wysepka o powierzchni
    0,025% rzutu dostawała 0,72 — powyżej progu niepewności, więc szczelina między
    ścianami trafiłaby do projektu jako element „pewny". Wielkość BRAMKUJE teraz
    wynik (mnożenie), zamiast tylko go współtworzyć (suma ważona): ładny kształt
    nie jest argumentem za tym, że coś tak małego jest pokojem.

    **Fallback.** Podkład ląduje w projekcie ZANIM analiza wystartuje. Awaria
    workera, brak wsparcia dla workerów, anulowanie i zerowy wynik kończą się
    identycznie — pustą geometrią i pełnym edytorem. Weryfikacja UKRYWA edytor
    (dwa równoległe widoki planu myliły co do tego, na którym się pracuje), ale
    „Pomiń — narysuję sam" jest na każdym ekranie.

    Detekcja nie zastępuje kalibracji: po zatwierdzeniu geometrii przełączamy od
    razu na linijkę, bo bez skali nie ma metrów.

    84 testy jednostkowe warstwy detekcji (obraz, ściany, pomieszczenia, pipeline,
    edycja i przekazanie) + 6 e2e na ścieżkę end-to-end.

    `npx tsc --noEmit` czysto, `npx vitest run` **368/368** (+84),
    `npx playwright test` **43/43** (+6), `npx vite build` bez błędów,
    `eslint` bez błędów.

54. **Korekta przez obrysowywanie pomieszczeń zamiast rysowania ścian.**

    W warstwie weryfikacji narzędziem ręcznym było „Dodaj ścianę" (dwa kliknięcia
    = odcinek). Zamienione na „Zaznacz pomieszczenie" (klikanie narożników,
    domknięcie klikiem w pierwszy punkt albo przyciskiem).

    **Dlaczego to lepsze narzędzie:** w tej aplikacji ściany są wyłącznie
    rysunkiem — nie wchodzą do `computeCircuits` ani do żadnej reguły. Znaczenie
    niosą POMIESZCZENIA: decydują o przypisaniu stawianych elementów
    (`detectRoomName`), o strefach ochronnych w łazience i o grupowaniu obwodów
    kuchennych. Poprawianie ścian po jednym odcinku było więc najdroższą
    czynnością o najmniejszym wpływie na wynik.

    Wykryte ściany nadal są pokazywane i da się je usuwać — pomagają się
    zorientować na rzucie. Zniknęło tylko ich RYSOWANIE.

    **Błąd, który wyszedł z testu e2e:** w trybie obrysowywania klik nad wykrytym
    pomieszczeniem trafiał w jego `onClick` (ze `stopPropagation`) i zaznaczał je
    zamiast postawić wierzchołek. Nowego pokoju nie dałoby się narysować tam,
    gdzie detekcja już coś znalazła — czyli dokładnie w najczęstszym scenariuszu
    poprawiania. Nakładka ma teraz `pointerEvents: none` na czas rysowania.

    Dwie pomyłki w samym teście, obie z katalogu znanego już projektowi: pomiar
    płótna zrobiony RAZ, choć pasek instrukcji zmienia treść po każdym wierzchołku
    i przesuwa SVG; oraz klik w dolnej części rzutu wypadający poza okno
    przeglądarki. Diagnoza w obu przypadkach z `elementFromPoint`, nie z domysłu.

    `npx tsc --noEmit` czysto, `npx vitest run` **375/375** (+7),
    `npx playwright test` **45/45** (+2), `npx vite build` bez błędów,
    `eslint` bez błędów.

55. **Domykanie przejść drzwiowych — bez tego detekcja pomieszczeń nie działała.**

    Zgłoszone przez użytkownika: pomieszczenie na rzucie NIGDY nie jest zamkniętym
    wielokątem, bo ma drzwi i okna. Zalanie tła od krawędzi przeciekało przez każde
    przejście i sklejało wszystkie pokoje w jedną bryłę. Miałem nawet test
    utrwalający to zachowanie („pokój z dziurą w ścianie nie jest raportowany"),
    opisany jako poprawny — a to był GŁÓWNY scenariusz porażki na realnym rzucie.
    Sonda potwierdziła też, że rozlana wyspa dławi obrysowywanie: przebieg wisiał
    ponad 2 minuty zamiast się skończyć.

    **Czy AI by pomogło:** do TEGO problemu nie. Modele parsowania rzutów
    (CubiCasa5K, DeepFloorplan) wygrywają przy rzutach odręcznych i rozpoznawaniu
    armatury, ale przerwa drzwiowa ma strukturę geometryczną, którą da się domknąć
    deterministycznie i przetestować — a model kosztowałby dziesiątki MB i nie dałby
    się zweryfikować testem jednostkowym.

    **Czemu nie zamknięcie morfologiczne:** drzwi mają ok. 90 cm, ściana ok. 12 cm.
    Jądro dość duże, by zasypać przejście, zlepiłoby ścianki działowe i połączyło
    pokoje — jeden błąd zamieniony na drugi.

    **Rozwiązanie:** domykanie przerw OSOBNO w wierszach i kolumnach
    (`domknijPrzerwy`). Drzwi w ścianie pionowej to przerwa wzdłuż kolumny;
    wypełnienie jej nie pogrubia ściany w poziomie, więc cienka ścianka nadal
    rozdziela sąsiednie pokoje — jest na to osobny test. Przerwy od KRAWĘDZI obrazu
    są pomijane, inaczej domknęlibyśmy budynek do ramki rzutu.

    Próg wyprowadzony z MEDIANY GRUBOŚCI ścian (drzwi ≈ 8× mur), nie ze stałej
    w pikselach — metoda kalibruje się sama niezależnie od rozdzielczości skanu
    i nie wymaga znajomości skali. Musi być większy od drzwi, ale mniejszy od
    najwęższego pomieszczenia, żeby nie wypełnić korytarza.

    Maskę budujemy z OBRAZU, nie z wykrytych odcinków ścian: pierwsze podejście
    mostkowało końce współliniowych odcinków i przewróciło się, bo detektor ścian
    gubił pół ścianki działowej — błąd detekcji propagowałby się na pomieszczenia.
    Funkcje mostkowania (`mostkiOtworow`, `maskaOdcinkow`) zostały, przetestowane,
    jako uzupełnienie.

    **Dwie pomyłki po drodze, obie moje:** drugi przebieg detekcji ścian z dużym
    progiem przerwy dawał 40 odcinków, w tym ukośne śmieci (odrzucone); a rzekomy
    błąd algorytmu okazał się błędem FIXTURE'A testowego — `srodek - szerokosc/2`
    dawało 92,5, pętla inkrementowała o 1 i `tusz()` pisał pod ułamkowe indeksy,
    więc dolna połowa ścianki nigdy nie powstała. Diagnoza z sondy drukującej
    wykryte odcinki, nie z domysłu.

    `npx tsc --noEmit` czysto, `npx vitest run` **395/395** (+20),
    `npx playwright test` **45/45**, `npx vite build` bez błędów, `eslint` bez błędów.

56. **Proporcje UI: rozdzielnica, logo jako powrót, pustka na dużych ekranach.**

    **Rozdzielnica.** SVG miał `width: 100%`, więc rozciągał się do szerokości
    kontenera — naturalne ~484 px puchło na szerokim ekranie do 900+, a razem
    z nim każdy detal w środku. Aparat modułowy ma REALNY rozmiar (17,5 mm),
    więc rozdmuchany do szerokości monitora wygląda jak makieta, a nie jak sprzęt.
    Dodane `maxWidth: svgW` trzyma rozmiar naturalny, `width: 100%` nadal pozwala
    zmaleć na wąskim ekranie. Moduł 36→30 px, wysokość aparatu 158→124 px.
    Kolumna z rysunkiem dostała `flex-none`, bo rozciągnięta zostawiała obok pas
    pustki — miejsce przejęła lista aparatów.

    **Logo.** Cały blok marki jest przyciskiem wracającym do etapu 01. Przycisk,
    nie link: to nawigacja wewnątrz aplikacji, bez przeładowania strony.

    **Pustka.** Dwie przyczyny. Powiększenie było zabetonowane na 100%, więc plan
    1000×700 tonął w szarym tle — teraz dopasowuje się do dostępnego miejsca,
    a `⛶` wraca do trybu automatycznego (wcześniej tylko ustawiał 100%). Gdy
    użytkownik sam ruszy zoom, automat się wyłącza: widok zmieniający sobie skalę
    po zmianie okna irytuje bardziej niż pustka. Wysokość płótna liczy się z okna
    zamiast stałych 640 px.

    **Trzy błędy po drodze, z czego jeden realny:**
    - `okno − 300` z podłogą 420 px dawało przy oknie 720 px płótno 420 px, czyli
      o 220 px MNIEJSZE niż dotychczas — zmniejszenie widoku na laptopie przy
      zadaniu „wypełnij puste miejsce". Podłogą jest teraz dotychczasowe 640,
      więc rośniemy wyłącznie tam, gdzie jest z czego rosnąć. Padło na tym 9 testów.
    - `ResizeObserver` obserwował kolumnę: dopasowanie zmieniało wysokość płótna,
      to wysokość kolumny, a to budziło obserwatora — pętla zwrotna przeskalowująca
      rzut w trakcie pracy. Obserwujemy teraz wyłącznie szerokość.
    - Pierwsze podejście do wyśrodkowania (`flex justify-center` na kontenerze)
      rozjechało obramowanie z płótnem: ramka obejmowała pusty margines, w który
      użytkownik mógł kliknąć bez efektu. `w-fit mx-auto` sprawia, że karta
      przylega do rzutu i centruje się jako całość.

    Dwie poprawki w testach wynikły z tego, że scena Konvy jest teraz SKALOWANA:
    helper czytający jej wymiary dostawał jednostki planu razy zoom (dzieli je
    z powrotem), a dwuklik celujący w zapamiętany offset ekranowy chybiał o jedną
    jednostkę — przy skali ułamkowej symbol to cienka kreska, więc to wystarczy.
    Test liczy teraz pozycję z rzeczywistych danych elementu. Symbole nietknięte.

    Lekcja procesowa: po pierwszej serii zmian ogłosiłem sukces na podstawie
    JEDNEGO pliku testów (`shell-ui`), a pełny przebieg pokazał 9 błędów.

    `npx tsc --noEmit` czysto, `npx vitest run` **395/395**,
    `npx playwright test` **46/46** (+1), `npx vite build` bez błędów,
    `eslint` bez błędów.

57. **Bezpiecznik przedlicznikowy zdjęty z automatu.** Razem z ogranicznikiem
    przepięć wstawiał się dotąd „F0 / gG 63A" opisany jako zabezpieczenie
    przedlicznikowe. Zgłoszone jako „nie powinno załączać się za każdym razem",
    ale problem był głębszy: **„przedlicznikowe" znaczy PRZED licznikiem**, czyli
    w plombowanej szafce operatora — poza zakresem rozdzielnicy mieszkaniowej,
    którą rysuje ta aplikacja. Rysowanie go w każdym schemacie było błędem co do
    zasady, nie tylko nadgorliwością.

    Niezależnie od tego sam bezpiecznik pod SPD jest potrzebny wyłącznie wtedy,
    gdy wytrzymałość zwarciowa ogranicznika jest niższa od spodziewanego prądu
    zwarcia i nie pokrywa jej zabezpieczenie nadrzędne — a to wynika z karty
    katalogowej konkretnego aparatu, nie z niczego, co aplikacja wie.

    Funkcja nie została skasowana, tylko przeniesiona tam, gdzie jest decyzją
    człowieka: „Bezpiecznik pod SPD" (gG 25–80 A) trafił do `MANUAL_DEVICE_TYPES`.

    Zmiana w `buildPanelDevices` działa JEDNOCZEŚNIE na schemat jednokreskowy
    i na front rozdzielnicy, bo oba widoki jadą z tego samego źródła (zasada
    z kroku 48). Rozjechanie ich znaczyłoby, że schemat pokazuje inną instalację
    niż rozdzielnica.

    Test sprawdza, że przy każdym wariancie SPD (`T1`, `T2`, `T1+T2`) bezpiecznik
    NIE pojawia się automatycznie, ale nadal jest dostępny w katalogu ręcznym.

    `npx tsc --noEmit` czysto, `npx vitest run` **396/396** (+1),
    `npx playwright test` **46/46**, `npx vite build` bez błędów, `eslint` bez błędów.

58. **Pasek narzędzi scalony z panelem w jedną kartę.** Zgłoszone jako „pasek po
    lewej skrajnej wydaje się niewłaściwy — może przenieść go na prawo?".

    Diagnoza ze zrzutu: problemem nie była STRONA, tylko to, że pasek był TRZECIĄ
    niezależną wysepką w rzędzie (pasek | panel | płótno), kończącą się w połowie
    wysokości i zostawiającą pod sobą pustkę. Przeniesienie tej samej wysepki na
    prawo przełożyłoby wrażenie oderwania na drugą stronę, a przy okazji zajęło
    miejsce zwyczajowo należące do właściwości zaznaczonego obiektu — czyli to,
    czego aplikacja może jeszcze potrzebować (dziś edycja otwiera się modalnie).
    Lewa strona dla wyboru narzędzia to zresztą konwencja Photoshopa, Illustratora,
    AutoCAD-a, Figmy i VS Code.

    Pasek jest teraz LEWĄ KRAWĘDZIĄ wspólnej karty z biblioteką (wzorzec activity
    baru z VS Code): własne, delikatnie inne tło i pionowa kreska oddzielająca go
    od zawartości panelu, ale pełna wysokość karty i wspólna ramka. W rzędzie stoją
    dwa obiekty zamiast trzech.

    Konceptualnie to jedno: pasek wybiera, CZYM pracuję, panel pokazuje opcje dla
    tego wyboru. Traktowanie ich jako osobnych kafelków było zaszłością po
    wyciągnięciu narzędzi z poziomego paska w kroku 51.

    Scalenie jest WYŁĄCZNIE wizualne — panel nadal nie przełącza się automatycznie
    za paskiem. To świadoma decyzja z kroku 51: automatyczne przełączanie chowało
    bibliotekę dokładnie wtedy, gdy się jej używa (zaraz po obrysowaniu pokoju).

    `npx tsc --noEmit` czysto, `npx vitest run` **396/396**,
    `npx playwright test` **46/46**, `npx vite build` bez błędów, `eslint` bez błędów.

59. **Grupy sterowania oświetleniem wpływają na dobór obwodów — domknięcie
    luki z kroku 40.** Numer grupy przy łączniku i lampie był dotąd tylko
    adnotacją na rysunku; `computeCircuits` dzielił oprawy po 10 „na ślepo",
    nie oglądając się na to, który łącznik czym steruje.

    **Powód nie jest kosmetyczny, tylko fizyczny.** Łącznik jest włączony
    SZEREGOWO w przewód fazowy obwodu zasilającego sterowane nim lampy —
    nie da się jednym łącznikiem przełączać dwóch różnych obwodów pod dwoma
    zabezpieczeniami. Stare dzielenie „po N" mogło więc rozerwać jedną grupę
    (łącznik + jego lampy) między dwa obwody, czyli zaprojektować instalację,
    której nie da się fizycznie wykonać.

    Nowy `chunkLightsByGroup` w `lib/panel/circuits.ts` pakuje światła w
    obwody tak, że GRUPA JEST NIEPODZIELNA: limit modułowy (10 dla świateł
    wewnętrznych, 8 dla zewnętrznych — bez zmian) jest respektowany MIĘDZY
    grupami, nigdy wewnątrz nich. Grupa większa niż limit trafia sama, w
    jednym przekroczonym obwodzie — lepiej przekroczyć zalecaną liczbę
    punktów niż narysować obwód niemożliwy do wykonania. Bucket key to
    `floor::grupa` (nie sam numer grupy!) — numeracja w `computeLightGroups`
    liczy się osobno na każdej kondygnacji, więc grupa „1" na parterze i
    grupa „1" na piętrze to dwie różne grupy; test na to złapałby regresję,
    gdyby ktoś kiedyś uprościł klucz do samego numeru.

    Światła bez grupy (brak łącznika w pobliżu, `NO_ROOM`) trafiają do paczek
    jak dotychczas, każde jako grupa o rozmiarze 1 — przy zerowej liczbie
    grup na planie zachowanie jest identyczne z dawnym `chunk(lights, N)`,
    więc istniejące projekty bez świadomie ustawionych grup nie widzą zmiany.

    Zastosowane RÓWNIEŻ do oświetlenia zewnętrznego (`lightsOut`), bo ten sam
    fizyczny warunek (łącznik = jeden obwód) dotyczy go tak samo — świadomie
    NIE ograniczone tylko do wnętrza, żeby nie zostawiać tej samej luki
    w drugim miejscu.

    Zmiana wpływa naraz na front rozdzielnicy, schemat jednokreskowy i
    kosztorys, bo wszystkie trzy jadą z tego samego `computeCircuits`
    (zasada z kroku 48) — to był właśnie powód, dla którego wcześniej
    zostawiono to jako „otwarte, nierozstrzygnięte": jedna zmiana rusza
    trzy widoki naraz.

    8 nowych testów: 5 na sam algorytm pakowania (`chunkLightsByGroup` w
    izolacji od geometrii) i 2 integracyjne przez `computeCircuits` z
    prawdziwym `computeLightGroups` — w tym test dowodzący wprost, że stary
    kod rozrywał grupę (dwa pokoje po 6 lamp, limit 10 → musi wyjść 2×6,
    nie 10+2).

    `npx tsc --noEmit` czysto, `npx vitest run` **404/404** (+8),
    `npx playwright test` **46/46**, `npx vite build` bez błędów, `eslint` bez błędów.

60. **Zaznaczanie elementów wewnątrz narysowanego pomieszczenia nie działało.**
    Zgłoszone jako „nie da się zaznaczyć elementów wewnątrz pomieszczenia".

    **Diagnoza wymagała pomiaru, nie czytania kodu.** Pojedynczy klik dokładnie
    w element działał (dwuklik otwierał edycję), co pozornie przeczyło zgłoszeniu
    — dopiero sprawdzenie przez `Konva.Stage.getIntersection()` w pustym miejscu
    WEWNĄTRZ pomieszczenia pokazało, że hit-test zwraca tam obrys pomieszczenia
    (`Line`), nie scenę. Po drodze złapałem też własny błąd w skrypcie
    diagnostycznym: 400 ms po naciśnięciu „R" to za mało na 600–900 ms debounce
    autozapisu z tego projektu — pierwszy przebieg pokazywał fałszywie ujemny
    wynik, zanim poprawiłem czas oczekiwania.

    **Przyczyna:** obrys pomieszczenia to wypełniony, zamknięty `<Line>` bez
    `listening={false}`, rysowany NA WIERZCHU siatki i PODCZAS gdy elementy
    renderują się później (są nad nim w z-order). To wystarczało dla
    pojedynczego kliknięcia PROSTO w element (mniejszy kształt na wierzchu
    wygrywa hit-test w tym samym punkcie), ale `handleStageMouseDown` uruchamia
    zaznaczanie obszarem TYLKO gdy `e.target === stage`. Przeciąganie zaczęte
    z pustego miejsca wewnątrz pomieszczenia trafiało w wypełniony obrys, więc
    `e.target` nigdy nie był sceną i marquee-select w ogóle się nie zaczynał —
    a to jedyny sposób na zaznaczenie kilku elementów naraz albo elementu bez
    celowania idealnie w jego mały symbol.

    **Poprawka:** `listening={false}` na `<Group>` obrysu pomieszczenia w
    `DesignCanvas.tsx`. Bezpieczne, bo obrys nie ma ŻADNEJ obsługi kliknięcia
    na płótnie — edycja (kolor, usunięcie) dzieje się wyłącznie przez listę
    w `RoomPanel`, sprawdzone przed zmianą. Ten sam wzorzec (`listening={false}`
    dla czysto wizualnego podkładu) już wcześniej stosowany dla siatki, tła
    i stref ochronnych w tym samym pliku — obrys pomieszczenia był jedynym
    warstwowym elementem, który go nie dostał.

    Nowy e2e w `room-drawing.spec.ts` odtwarza dokładnie zgłoszony scenariusz:
    marquee zaczęty w pustym miejscu wewnątrz narysowanego pomieszczenia musi
    zaznaczyć element w środku — dowód przez skrót „R" (obrót), nie przez klik
    wprost w element, żeby test nie omijał przypadkiem tej samej ścieżki kodu,
    którą naprawiono.

    `npx tsc --noEmit` czysto, `npx vitest run` **404/404**,
    `npx playwright test` **47/47** (+1), `npx vite build` bez błędów,
    `eslint` bez błędów.

61. **Edycja pomieszczeń na planie: przeciąganie narożników, dwuklik w nazwę
    do zmiany, PPM na krawędzi do usunięcia.** Do kroku 60 obrys narysowanego
    pomieszczenia był czysto wizualny — jedyna edycja (kolor, nazwa, usunięcie)
    szła przez listę w `RoomPanel`, bo krok 60 właśnie z tego powodu dostał
    `listening={false}` na całym obrysie: naprawiał regresję zaznaczania
    obszarem, w której wypełniony `<Line>` przechwytywał hit-test w swoim
    wnętrzu. Nowe zgłoszenie chce dokładnie odwrotnie — klikalności na
    obrysie — więc oba wymagania trzeba było pogodzić w jednym kształcie.

    **Rozwiązanie: rozbicie jednego `<Line>` na trzy osobne kształty Konvy**
    w `DesignCanvas.tsx`, każdy z jedną odpowiedzialnością:
    - wypełnienie — czysto wizualne, wciąż `listening={false}`, więc krok 60
      zostaje nietknięty;
    - „krawędź" — osobny, niewidoczny `<Line>` (bez wypełnienia widocznego,
      `stroke="transparent"`, `hitStrokeWidth={14}` dla wygodniejszego trafienia
      niż piksel w piksel) wyłącznie do `onClick`/`onContextMenu`;
    - uchwyty narożników — `<Circle>` renderowane TYLKO gdy pomieszczenie jest
      zaznaczone, `draggable`, z `onDragMove` aktualizującym oba powyższe
      kształty IMPERATYWNIE (ten sam wzorzec co przeciąganie elementów wyżej
      w tym pliku) i dopiero `onDragEnd` zapisującym do store'a — jeden wpis
      historii cofania na cały ruch, nie jeden na klatkę animacji.

    **Pułapka, złapana dopiero pomiarem, nie czytaniem kodu (jak w kroku 60):**
    sam brak `fill` na kształcie „krawędź" NIE wystarczył. Dla `<Line closed>`
    Konva ma domyślnie `fillEnabled={true}` NIEZALEŻNIE od tego, czy prop
    `fill` jest w ogóle ustawiony — na hit-canvasie i tak maluje całe wnętrze
    unikalnym kolorem, więc klik w pustym miejscu WEWNĄTRZ pomieszczenia i tak
    trafiał w ten kształt (dokładnie ta sama choroba co w kroku 60, tylko na
    nowym kształcie). Zweryfikowane przez `Stage.getIntersection()` w e2e —
    zanim poprawka, zwracał `Line` z `attrs.closed: true`; po dodaniu jawnego
    `fillEnabled={false}` zwraca `null`, czyli przechodzi na wylot do sceny.
    Dopisany osobny e2e („kliknięcie WEWNĄTRZ pomieszczenia... nie otwiera
    menu") pilnuje tego konkretnie, żeby regresja nie wróciła po cichu.

    Dwuklik w nazwę pomieszczenia na planie otwiera pływający `<input>` w
    miejscu kliknięcia (ten sam trik nakładki co istniejące menu kontekstowe —
    Konva nie ma natywnego pola tekstowego), commit na Enter/blur woła
    istniejące `renameRoomShape`, które już wcześniej kaskadowo aktualizowało
    `element.room` — żadnej nowej logiki w store poza jedną nową akcją,
    `moveRoomShapePoint`, do zapisu przesuniętego narożnika.

    5 nowych e2e w `room-editing.spec.ts`: usunięcie przez PPM na krawędzi,
    brak menu przy PPM wewnątrz (regresja opisana wyżej), zmiana nazwy
    dwuklikiem, przeciąganie narożnika, i powtórka testu z kroku 60 (marquee
    zaczęte wewnątrz pomieszczenia) — teraz z dodatkowym kształtem klikalnym
    na krawędzi w grze, więc regresja stamtąd miała nową okazję wrócić.

    `npx tsc --noEmit` czysto, `npx vitest run` **404/404**,
    `npx playwright test` **52/52** (+5), `npx vite build` bez błędów,
    `eslint` bez błędów.

62. **Konto przestaje być tylko przełącznikiem „zalogowany/nie" — dostaje realną
    treść: reset hasła, menu konta i AUTOMATYCZNY zapis w chmurze.** Do tego
    kroku zapis w chmurze wymagał pamiętać o ręcznym kliknięciu „Zapisz w
    chmurze" za każdym razem — jedyna różnica względem projektu lokalnego była
    kosmetyczna (chip „Synchronizacja: online").

    **Panel logowania:** doszedł reset hasła (`supaRecover` →
    `/auth/v1/recover`) jako trzeci tryb `AuthModal` obok logowania/rejestracji.
    Komunikat po wysłaniu jest CELOWO identyczny niezależnie od tego, czy konto
    z podanym e-mailem istnieje — inaczej pole stałoby się sposobem na
    sprawdzanie cudzych adresów.

    **Wygląd po zalogowaniu:** rząd czterech osobnych przycisków (e-mail jako
    zwykły tekst, „Moje projekty", „Zapisz w chmurze", ikona wylogowania) zastąpiony
    jednym menu konta (nowy `components/ui/dropdown-menu.tsx` na
    `@radix-ui/react-dropdown-menu`, już był w zależnościach, tylko bez
    wrappera) — avatar z pierwszą literą e-maila, w środku e-mail, „Moje
    projekty", „Zapisz teraz", „Wyloguj". Chip „Synchronizacja: online" zniknął
    (był czystą deklaracją faktu bycia zalogowanym) na rzecz nowego
    `CloudSaveIndicator` — odpowiednik istniejącego `SaveIndicator` (autozapis
    lokalny), ale pokazujący PRAWDZIWY status chmury: „Zapisywanie w chmurze…",
    godzinę ostatniego udanego zapisu albo błąd.

    **Zapis w chmurze — z ręcznego na automatyczny.** `saveToCloud`/`loadFromCloud`
    przeniesione z lokalnych funkcji w `App.tsx` wprost do store'a (ten sam wzorzec
    co `setDraft`/`renameRoomShape` itd.), bo automatyczny zapis w tle musiał wołać
    dokładnie tę samą ścieżkę co przycisk „Zapisz teraz" — inaczej dwie kopie tej
    samej logiki rozjechałyby się przy pierwszej poprawce. Mechanizm to bezpośrednia
    kalka lokalnego autosave'u (`useProjectStore.subscribe` + debounce + porównanie
    JSON-em, krok z wcześniejszej migracji): różnica to dłuższy debounce (2,5 s
    zamiast 600 ms, bo to żądanie sieciowe, nie zapis do `localStorage`) i warunek
    `session && SUPABASE_CONFIGURED` — bez konta projekt nadal ma WYŁĄCZNIE
    autosave lokalny, nic się tu nie zmienia.

    Złapana pułapka: `loadFromCloud` musi ustawić „ostatnią znaną migawkę chmury"
    NATYCHMIAST po wczytaniu, zanim jakikolwiek re-render zdąży odpalić
    subskrybenta — inaczej wczytanie projektu z chmury odpalało własny, zbędny
    zapis z powrotem do tego samego wiersza od razu po wczytaniu (JSON „jeszcze
    nieznany" autosave'owi, mimo że identyczny z tym, co właśnie przyszło z serwera).

    `resetProject` („Nowy projekt") czyści też `lastCloudSaveAt`/`cloudSaveError`
    i lokalną migawkę porównawczą chmury — bez tego automatyczny zapis w tle
    nadpisałby STARY wiersz w chmurze pustym draftem zamiast założyć nowy,
    niezauważalnie dla użytkownika.

    4 nowe e2e w `account-menu.spec.ts`: menu konta pokazuje avatar i e-mail,
    otwiera „Moje projekty", wylogowanie realnie kasuje sesję (nie tylko
    wizualnie), i przepływ „Zapomniałeś hasła?" w panelu logowania. Supabase nie
    jest skonfigurowany w tym środowisku, więc prawdziwego logowania nie da się
    przetestować e2e — stan zalogowany seedowany wprost przez `localStorage`
    pod kluczem, którego używa `loadStoredSession()`, żeby przetestować samo UI
    niezależnie od backendu.

    `npx tsc --noEmit` czysto, `npx vitest run` **404/404**,
    `npx playwright test` **62/62** (+4), `npx vite build` bez błędów,
    `eslint` bez błędów.

63. **Panel konta dostaje dwie zakładki: „Profil" i „Ustawienia" — te same
    podstawowe narzędzia, co na typowych stronach z kontem.** Do tego kroku
    menu konta (krok 62) prowadziło tylko do „Moje projekty" i wylogowania —
    żadnego miejsca na dane samego konta.

    Nowy `AccountModal.tsx`, otwierany z menu konta w nagłówku, z dwoma
    zakładkami na nowym `components/ui/tabs.tsx` (`@radix-ui/react-tabs`, ten
    sam wzorzec cienkiego wrappera co `dialog.tsx`/`dropdown-menu.tsx`):

    **Profil** — tożsamość i bezpieczeństwo:
    - e-mail i data założenia konta (z `session.user.created_at`, jeśli Supabase
      go zwraca);
    - **Dane wykonawcy** (imię i nazwisko, nr uprawnień, przyrząd pomiarowy, nr
      fabryczny, świadectwo wzorcowania) — CELOWO podzbiór pól `docHeader`, nie
      kopia: to TEN SAM stan store'a co formularz w Protokołach (krok 4), więc
      edycja w Profilu widać natychmiast w Protokołach i odwrotnie, jedno źródło
      prawdy. Reszta `docHeader` (obiekt, adres, data pomiaru) zostaje wyłącznie
      w Protokołach — to dane KONKRETNEGO zlecenia, nie konta;
    - zmiana hasła przez nowy `supaUpdateUser` (`PUT /auth/v1/user` z tokenem
      sesji) — działa na zwykłym kluczu `anon`, nie wymaga `service_role`.

    **Ustawienia** — dane i „strefa zagrożenia":
    - eksport bieżącego projektu jako JSON (`getProjectPayload()` + istniejący
      `downloadBlob`/`projectFileName` z silnika PDF, krok 4 — zero nowego kodu
      do pobierania plików);
    - usunięcie WSZYSTKICH projektów w chmurze (`supaListProjects` +
      pętla `supaDeleteProject`), za potwierdzeniem `confirm()` — jawnie NIE
      rusza lokalnego autozapisu, tylko kopie w chmurze.

    Świadomie pominięte: usunięcie samego KONTA (Auth usera). REST z kluczem
    `anon` tego nie potrafi — wymaga `service_role`, którego nie wolno trzymać
    w kodzie frontendu. Fałszywy przycisk „Usuń konto", który i tak by nie
    zadziałał, byłby gorszy niż jego brak.

    Złapane w trakcie pisania e2e (nie w kodzie): pierwszy zrzut ekranu po
    kliknięciu zakładki pokazywał WIZUALNIE starą aktywną zakładkę, mimo że
    `aria-selected` w DOM-ie już mówiło co innego — to artefakt
    `transition-colors` (CSS jeszcze się nie domalował), nie błąd przełączania;
    zweryfikowane przez odczyt `aria-selected` wprost, nie przez sam zrzut.

    7 nowych e2e w `account-modal.spec.ts`: otwieranie panelu na właściwej
    zakładce z menu konta, przełączanie zakładek, zapis danych wykonawcy i ich
    widoczność w Protokołach, walidacja zmiany hasła (za krótkie / niezgodne —
    obie ścieżki BEZ wywołania sieci), pobranie pliku JSON, i potwierdzenie
    przed usunięciem projektów z chmury.

    `npx tsc --noEmit` czysto, `npx vitest run` **404/404**,
    `npx playwright test` **69/69** (+7), `npx vite build` bez błędów,
    `eslint` bez błędów.

64. **Silnik detekcji pomieszczeń zalewany fałszywymi „ścianami" z tabelki
    legendy na profesjonalnych rzutach architektonicznych.**

    Zgłoszone jako „silnik nie działa prawidłowo, jak dalej tak będzie to
    trzeba go usunąć". Wszystkie testy jednostkowe (111 w `src/lib/detect/`)
    przechodziły, więc problem musiał leżeć poza tym, co te testy w ogóle
    próbowały — żaden nie używał realnego pliku, tylko syntetycznych,
    idealnie czystych prostokątów.

    **Diagnoza wymagała prawdziwego pliku, nie kolejnych syntetycznych
    testów.** Użytkownik przesłał gotowy projekt domu (PDF z biura
    projektowego HOMEKONCEPT) — wgrany przez prawdziwy formularz w
    przeglądarce (Playwright, nie reimplementacja parsowania PDF), wynik:
    **500 „ścian" i widoczne na zrzucie niebieskie linie „ścian" narysowane
    wprost na tekście stopki i tabelce z metrażem pomieszczeń.** Taki arkusz
    ZAWSZE ma obok rzutu tabelkę/legendę — dla `biegiWzdluz` (który szuka po
    prostu długiego, ciągłego, cienkiego tuszu) gęsty tekst wygląda dokładnie
    jak ściana.

    **Rozwiązanie: budynek to jedna spójna bryła ścian stykających się ze
    sobą, legenda stoi przestrzennie osobno.** Nowa `najwiekszyKlaster` w
    `walls.ts` łączy wykryte odcinki w skupiska po STYKU — koniec jednego
    blisko DOWOLNEGO punktu drugiego (nowa `odlegloscOdOdcinka`, dystans do
    odcinka, nie do nieskończonej prostej jak istniejąca `odlegloscOdProstej`
    — inaczej ścianka działowa dochodząca do ŚRODKA ściany zewnętrznej, a nie
    do jej narożnika, nigdy by się nie połączyła) — i zostawia skupisko o
    NAJWIĘKSZYM POLU prostokąta otaczającego, odrzuca resztę. Próg styku
    wyprowadzony z mediany grubości ścian (ten sam pomysł co przy domykaniu
    drzwi w kroku 55), nie ze stałej w pikselach.

    Sam filtr ścian nie wystarczył — szukanie POMIESZCZEŃ w `pipeline.ts`
    dalej działało na CAŁYM obrazie (`bin`), więc legenda nadal mogłaby
    tworzyć fałszywe „pokoiki" po stronie pomieszczeń. Nowa `przytnijDoObszaru`
    w `image.ts` zeruje tusz poza prostokątem głównego klastra (z marginesem
    w wielokrotności grubości muru, żeby nie odciąć czegoś tuż przy ścianie
    zewnętrznej) — maska szukania pomieszczeń jest przycinana PRZED
    `wykryjPomieszczenia`, nie po.

    **Wynik na tym samym realnym pliku: 500 → 192 ściany, legenda całkowicie
    czysta na podglądzie** (zero linii „ścian" na tekście). Nowe ostrzeżenie
    w UI wprost mówi, co pominięto: „Pominęliśmy fragmenty rysunku z dala od
    głównego budynku... jeśli to była osobna część planu, dorysuj ją ręcznie" —
    szczery koszt metody (osobna, fizycznie niepołączona dobudówka na tym
    samym arkuszu zostanie odrzucona tak samo jak legenda), zgodnie z zasadą
    „AI proponuje, człowiek potwierdza", nie cichym gubieniem danych.

    **Świadomie NIE naprawione w tym kroku:** liczba wykrytych pomieszczeń na
    tym samym realnym pliku (6 z ~15 pokoi) dalej jest zaniżona — część
    prawdziwych pokoi z szerokimi oknami nie domyka się w pełni zamknięty
    obrys (próg domykania z kroku 55 kalibruje się na SZEROKOŚĆ DRZWI, a
    nowoczesne okna bywają szersze), więc ich wnętrze zostaje „połączone z
    zewnętrzem" i nigdy nie trafia do wyniku jako wyspa. To ODDZIELNY problem
    od zanieczyszczenia legendą — zgłoszony użytkownikowi wprost, nie ukryty
    pod pozorem pełnej naprawy.

    2 nowe testy w `pipeline.test.ts` (integracyjny, na tym samym kształcie co
    realny plik: budynek + gęsty blok tekstu z dala od niego) i 4 nowe w
    `walls.test.ts` (`najwiekszyKlaster` w izolacji: styk narożnikowy, styk ze
    środkiem ściany, odrzucanie odległego skupiska mimo większej liczby
    odcinków, pusta lista).

    `npx tsc --noEmit` czysto, `npx vitest run` **410/410** (+6),
    `npx playwright test` **69/69**, `npx vite build` bez błędów,
    `eslint` bez błędów.

65. **Ręczne przycinanie wgranego rzutu + próba (nieudana, wycofana) naprawy
    zaniżonej liczby pomieszczeń + naprawiony próg klastrowania ścian, który
    okazał się za ciasny na PRAWDZIWYM pliku z kroku 64.**

    **Próba naprawy okien szerszych niż drzwi — WYCOFANA, bo pogorszyła wynik
    na realnym pliku.** Krok 64 zostawił otwarty problem: pokoje z szerokimi
    oknami nie domykają się (próg domykania kalibruje się na szerokość drzwi).
    Spróbowałem: drugi, szerszy przebieg domykania (`KROTNOSC_OTWORU_ZEWNETRZNY
    = 20`), zastosowany TYLKO w wąskim pasie wzdłuż obwodu głównego budynku
    (nowa `domknijPasObwodowy`), żeby nie zasypać korytarzy w środku. Testy
    jednostkowe przeszły — ale sprawdzone na TYM SAMYM realnym pliku z kroku 64
    wynik spadł z 6 do **3** pomieszczeń, z widocznym błędnym sklejaniem
    sąsiednich pokoi. Przyczyna: założenie „okna są tylko na obwodzie" jest
    fałszywe dla typowego rzutu — WIĘKSZOŚĆ pokoi w domu jednorodzinnym styka
    się ze ścianą zewnętrzną, więc pas „blisko obwodu" pokrywa niemal cały
    budynek, a nie tylko prawdziwe ściany zewnętrzne. Kod w całości wycofany
    (`domknijPasObwodowy`, `KROTNOSC_OTWORU_ZEWNETRZNY`) — lepiej nic nie zrobić
    niż zostawić coś, co pogarsza wynik na prawdziwym materiale. Problem
    pozostaje otwarty (patrz „Pozostałe" niżej); poprawne rozwiązanie
    wymagałoby odróżniać ścianę zewnętrzną od wewnętrznej po topologii zalania
    tła, nie po odległości od prostokąta otaczającego.

    **Nowe narzędzie: przycinanie rzutu PRZED analizą.** Zgłoszone wprost przez
    użytkownika jako uzupełnienie automatycznego odrzucania legendy (krok 64):
    czasem użytkownik wie lepiej niż algorytm, co jest „resztą planu", i chce to
    po prostu wyciąć. Nowy krok `przycinanie` w `useFloorPlanDetection`
    (między wczytaniem pliku a analizą, POMIJALNY) i `CropTool.tsx` — SVG z tym
    samym trikiem konwersji współrzędnych co `DetectionReview`, przeciągnięcie
    zaznacza obszar do zachowania, reszta jest wycinana z SAMEGO PODKŁADU (nowa
    `przytnijRzut` w `source.ts`, canvas `drawImage` z przesunięciem), nie tylko
    z wyniku analizy — więc nie trzeba przycinać ponownie przy każdej kolejnej
    próbie na tym samym pliku.

    **Przy weryfikacji nowego narzędzia na PRAWDZIWYM pliku z kroku 64 (ręcznie
    wycięta legenda) wyszła na jaw kolejna, poważniejsza wada progu klastrowania
    z kroku 64: 785 wykrytych odcinków ścian, z czego przy progu 3× mediany
    grubości zostawały tylko 4 (!).** Kreskowane wypełnienie ściany (typowe dla
    rysunku architektonicznego, w przeciwieństwie do litej ściany w testach
    syntetycznych) nie daje ciągłego, gładkiego tuszu — wykryte odcinki mijają
    się o więcej niż kilka pikseli nawet w miejscach, które na oko są jedną
    ścianą, więc prawie CAŁY budynek rozpadał się na mikroskopijne, wzajemnie
    niestykające się skupiska. Naprawione podniesieniem progu z 3× do **10×**
    mediany grubości — sprawdzone na tym samym pliku: 784/785 odcinków w jednym
    skupisku (budynek), a legenda na TYM SAMYM pliku (bez ręcznego przycięcia)
    nadal poprawnie odrzucona (odstęp między nią a budynkiem jest rzędu setek
    pikseli, wielokrotnie większy od nowego progu). Metodologicznie: wartość
    3× nie była zgadnięta — pochodziła z tego samego rozumowania co próg
    domykania drzwi (krok 55), tylko nigdy nie zweryfikowana na kreskowanym
    materiale, bo wszystkie testy jednostkowe rysują ściany jako lite prostokąty.

    **Wynik końcowy na realnym pliku (dom, ~15 pomieszczeń):** samo odrzucanie
    legendy (krok 64) plus nowy próg 10× → 6 pomieszczeń, 290 ścian (z 500
    fałszywych w kroku 64). Z DODATKOWYM ręcznym przycięciem legendy przez
    nowe narzędzie → **23 pomieszczenia**, w tym prawidłowo rozdzielone
    sypialnie, łazienki, garaż i kuchnia — najbliżej realnej liczby ze
    wszystkich dotychczasowych prób. Przycinanie i lepszy próg klastrowania
    to więc DWIE OSOBNE, uzupełniające się poprawki, obie zweryfikowane na tym
    samym pliku źródłowym, nie na syntetycznych przykładach.

    4 nowe e2e w `crop-tool.spec.ts`: krok przycinania pokazuje się po wgraniu
    pliku, pominięcie analizuje pełny rozmiar, zaznaczenie i przycięcie
    realnie zmniejsza obraz przekazywany do analizy, przycięty podkład
    zastępuje pełny rzut w edytorze. `detection.spec.ts` i trzy inne pliki
    e2e (`onboarding`, `plan-area`, `plan-upload`) zaktualizowane o nowy krok
    pośredni w przepływie wgrywania.

    `npx tsc --noEmit` czysto, `npx vitest run` **410/410**,
    `npx playwright test` **73/73** (+4), `npx vite build` bez błędów,
    `eslint` bez błędów.

66. **Automatyczne rozpoznawanie ścian i pomieszczeń CAŁKOWICIE USUNIĘTE
    z aplikacji — mimo trzech rund napraw (kroki 55, 64, 65) działało zbyt
    zawodnie na realnych rzutach.** Decyzja użytkownika wprost: „Wyrzuć ją
    z aplikacji". Nowy przepływ: **wgraj plik → przytnij → narysuj ręcznie
    ściany/pomieszczenia (już istniejące narzędzia) → rozłóż elementy** —
    zero silnika w tle, zero ekranu weryfikacji AI.

    **Co zostało, co zniknęło.** Wgrywanie pliku (obraz i PDF, `source.ts`:
    `wczytajRzut`) i przycinanie (`CropTool.tsx`, krok 65) NIE zależały od
    silnika detekcji — przeżyły bez zmian. Usunięte w całości: `pipeline.ts`,
    `walls.ts`, `rooms.ts`, `openings.ts`, `image.ts`, `edit.ts`,
    `handoff.ts`, `types.ts`, `detect.worker.ts` (cały `lib/detect/` poza
    `source.ts`), `DetectionReview.tsx`, `DetectionProgress.tsx`,
    `useFloorPlanDetection.ts`, `e2e/detection.spec.ts` — razem z sześcioma
    plikami testów jednostkowych tych modułów (117 testów).

    Nowy, dużo prostszy `useFloorPlanUpload.ts` zastępuje dawny hook detekcji:
    cztery stany zamiast sześciu (`bezczynny | wczytywanie | przycinanie |
    blad` — bez `analiza`/`weryfikacja`), żadnego workera, żadnej sesji z
    wersją „wykrytą" i „zatwierdzoną" do porównywania. Po przycięciu (albo
    jego pominięciu) `DesignTab` od razu przełącza narzędzie na kalibrację
    skali i pokazuje coach-mark — to samo domknięcie przepływu „podkład →
    skala", które wcześniej robiło zatwierdzenie wyniku AI.

    **Dlaczego nie kolejna naprawa.** Trzy rundy (55, 64, 65) poprawiały
    kolejne, coraz głębsze warstwy tego samego problemu — domykanie drzwi,
    odrzucanie legendy, próg klastrowania ścian — każda naprawiając jeden
    realny błąd, ale odsłaniając kolejny pod spodem. Wynik na jedynym
    dostępnym realnym pliku testowym (dom, ~15 pomieszczeń) NAWET po
    wszystkich trzech poprawkach wymagał ręcznego przycięcia od użytkownika,
    żeby wyjść poza 6 z 15 pokoi. Silnik oparty na progach geometrycznych
    (grubość ściany × mnożnik) ma twardy sufit jakości na kreskowanych,
    zaśmieconych wymiarowaniem rzutach architektonicznych — to nie jest błąd
    do złapania kolejnym testem jednostkowym, tylko granica samej metody.
    Zobacz niżej („Czym zastąpić — rekomendacja") co realnie podniosłoby
    jakość, gdyby temat wrócił.

    `npx tsc --noEmit` czysto, `npx vitest run` **293/293** (−117, usunięte
    testy silnika), `npx playwright test` **63/63** (−10, usunięty
    `detection.spec.ts`), `npx vite build` bez błędów (bundle `DesignTab`
    mniejszy o ~17 kB gzip, zniknął osobny chunk `detect.worker`), `eslint`
    bez błędów.

67. **Rysowanie ścian dostaje to, co pomieszczenia dostały w kroku 61: gumowy
    podgląd z etykietą wymiaru na żywo i edycję przeciąganiem narożnika PO
    zapisie.** Zgłoszenie: „chciałbym żeby ściana rysowała się wraz z
    przesuwaniem kursora, żeby był widoczny aktualny wymiar i żeby była
    możliwość edycji ściany po zapisie". Do tego kroku rysowanie ściany
    renderowało tylko już postawione odcinki — trzeba było kliknąć na oko i
    dopiero po fakcie sprawdzać w pasku stanu, czy wyszła właściwa długość —
    a po `finishWall()` ściana była zamrożona: jedyna edycja szła przez
    usunięcie z menu kontekstowego i narysowanie od nowa.

    **Podgląd na żywo** to ten sam wzorzec „gumowego" odcinka co przy
    wieloboku pomieszczenia (krok wcześniejszy w `handleStageMouseMove`):
    `wallCursor` śledzi pozycję kursora tylko gdy `toolMode === "sciany"` i
    jest już przynajmniej jeden postawiony punkt, a render dokłada kreskowany
    odcinek od ostatniego punktu do kursora plus `<Text>` z bieżącą długością
    w środku odcinka. Formatowanie etykiety (`formatDlugosc`) świadomie
    powiela wybór z `EditorStatusBar`: metry z dwoma miejscami po przecinku,
    gdy skala jest skalibrowana (`metersPerUnit`), inaczej same jednostki
    planu — więc liczby w aplikacji mówią jednym językiem niezależnie od tego,
    czy patrzy się na pasek stanu czy na płótno. `metersPerUnit` trzeba było
    dociągnąć do `DesignCanvas` jako nowy prop — wcześniej canvas w ogóle nie
    znał skali, bo nie było potrzeby liczyć niczego na jego własnym render'ze.

    **Edycja po zapisie** to ten sam imperatywny wzorzec przeciągania co
    narożniki pomieszczenia (krok 61): `onDragMove` na uchwycie `<Circle>`
    aktualizuje `.points()` Konvy bezpośrednio przez ref (`wallLineNodesRef`),
    bez dotykania store'a — dopiero `onDragEnd` woła `onMoveWallPoint`, więc
    historia cofania dostaje jeden wpis na cały ruch, nie jeden na klatkę.
    Uchwyty renderują się TYLKO gdy `isSel && toolMode === "zaznacz"` — w
    trybie „ściany" klik na płótnie dokłada nowy punkt (patrz niżej), więc
    uchwyty by z tym kolidowały.

    **Odkryta przy okazji niespójność ze store'em:** pomieszczenia mają własne
    akcje (`moveRoomShapePoint`, `renameRoomShape`...), ściany — nie. Cały ich
    cykl życia (dodanie w `finishWall`, usunięcie w menu kontekstowym) zawsze
    szedł wprost przez `setDraft` w `DesignTab.tsx`. Zamiast wprowadzać nową,
    niespójną z resztą akcję w store, `moveWallPoint` poszedł tą samą drogą —
    plain `setDraft` obok pozostałych dwóch operacji na ścianach.

    **Bug znaleziony przy pisaniu testów, nie zgłoszony przez użytkownika:**
    zmiana narzędzia w trakcie rysowania ściany (np. klik w „Zaznacz") NIE
    czyściła `drawingWall` — dla pomieszczeń taki reset już istniał
    (`if (id !== "pomieszczenie") setDrawingRoomPoints([])`), dla ścian go
    brakowało. Efekt: porzucone punkty potrafiły „ożyć" po powrocie do
    narzędzia ściany. Naprawione dopisaniem analogicznej linii w handlerze
    `ToolRail`.

    **Świadomie NIE naprawione w tym kroku:** `finishWall()` nie przełącza
    narzędzia z powrotem na „zaznacz" po kliknięciu „Zakończ" — to jest
    zachowanie sprzed tej zmiany (przydatne przy rysowaniu wielu ścian pod
    rząd) i test w `wall-editing.spec.ts` explicite je dokumentuje: trzeba
    kliknąć „Zaznacz" ręcznie, zanim da się przeciągnąć narożnik świeżo
    ukończonej ściany.

    Dwa nowe pliki e2e: `wall-drawing.spec.ts` (5 testów — gumowy odcinek z
    etykietą, etykieta rosnąca z odległością, przełączenie na metry po
    kalibracji, zapis wszystkich punktów po „Zakończ", porzucenie rysowania
    przy zmianie narzędzia) i `wall-editing.spec.ts` (2 testy — przeciągnięcie
    narożnika zmienia kształt zapisanej ściany, klik po „Zakończ" zaczyna
    nową ścianę zamiast przeciągać starą). Etykieta wymiaru żyje na płótnie
    Konvy, nie w DOM, więc asercje idą przez
    `window.Konva.stages[0].find("Text").map(t => t.text())`, nie przez
    `page.getByText()`. Złapana po drodze pułapka pomiarowa: kontener planu
    PRZESUWA SIĘ w pionie, gdy nad canvasem pojawia się pasek „Rysowanie
    ściany: N pkt." (layout nad nim rośnie) — bounding box trzeba pobierać na
    nowo tuż przed każdym kliknięciem, nie raz na cały test, inaczej kolejne
    kliknięcia lądują kilkadziesiąt pikseli obok zamierzonego miejsca.

    `npx tsc --noEmit` czysto, `npx vitest run` **293/293** (bez zmian — cała
    logika w tym kroku żyje w komponentach Konvy, nietestowalnych bez
    prawdziwego kursora), `npx playwright test` **70/70** (+7), `npx vite
    build` bez błędów, `eslint` bez błędów (0 nowych ostrzeżeń).

68. **Rysowanie ścian, runda druga: zatwierdzanie Enterem i PPM, oraz regulowana
    grubość ściany (z opcją rysowania ortogonalnego dorzuconą w trakcie).**
    Zgłoszenie doszło w dwóch częściach tej samej rozmowy: najpierw „dodaj
    zatwierdzenie ściany po naciśnięciu ENTER oraz PPM→zatwierdź, dodaj opcję
    ustawiania grubości ściany", a w trakcie pracy nad tym — „dodaj też opcję
    ustawiania, że rysowanie ścian jest ortogonalne". Do tego kroku jedyną drogą
    zatwierdzenia ściany był przycisk „Zakończ" w pasku narzędzi, a grubość
    każdej ściany była wpisana na sztywno (`strokeWidth={isSel ? 7 : 5}` wprost
    w JSX) — nie dało się jej w ogóle zmienić.

    **Enter i PPM→„Zatwierdź ścianę"** to dwie NIEZALEŻNE drogi do tego samego
    `finishWall()`, każda podpięta tam, gdzie użytkownik naturalnie jej szuka:
    Enter w globalnym handlerze klawiatury w `DesignTab.tsx` (obok istniejącej
    obsługi Delete/R/Escape), PPM przez nowy handler `onContextMenu` na samym
    `<Stage>` w `DesignCanvas.tsx`, otwierający ten sam floating-menu co PPM na
    elemencie/ścianie/pomieszczeniu (nowy wariant `contextMenu.kind ===
    "wallDraw"`). Obie drogi mają próg `drawingWall.length >= 2` — z jednego
    punktu `finishWall` i tak nic by nie zapisał (patrz jego własny warunek),
    więc nie ma sensu straszyć menu, które i tak nic nie zrobi.

    **Złapany w trakcie pisania testów bug w samej bibliotece zdarzeń, nie w
    kodzie aplikacji:** Konva syntetyzuje własne zdarzenie „click" na parze
    mousedown+mouseup na tym samym celu NIEZALEŻNIE od tego, który przycisk
    myszy został użyty — w odróżnieniu od natywnego DOM-owego `click`, który
    dla prawego przycisku w ogóle się nie odpala. Efekt: PPM otwierające menu
    zatwierdzenia (`onContextMenu`) odpalało RÓWNOCZEŚNIE `onClick`, więc
    `handleStageClick` dokładał dodatkowy punkt ściany w miejscu kliknięcia
    prawym przyciskiem, zanim menu zdążyło się w ogóle pokazać — zatwierdzona
    ściana miała o jeden punkt więcej niż faktycznie postawiono, a z jednym
    punktem menu pokazywało się mimo warunku `>= 2` (bo `onClick` zdążył dobić
    licznik do 2 tuż przed sprawdzeniem). Naprawione strażą `if (e.evt.button
    === 2) return;` na wejściu do `handleStageClick` — złapane wyłącznie przez
    e2e (`page.mouse.click(..., { button: "right" })` i odczyt zapisanych
    punktów), bo na poziomie typów i jednostek wszystko wyglądało poprawnie.

    **Grubość ściany** to nowe opcjonalne pole `thickness?: number` na `Wall`
    (jednostki planu, jak wszystko inne w geometrii ściany) — opcjonalne
    świadomie, żeby zapisy sprzed tej zmiany nie wymagały migracji; każdy
    odczyt spada na `DEFAULT_WALL_THICKNESS` (nowa stała w `lib/design.ts`,
    ustawiona na dawną sztywną wartość 5, żeby istniejące ściany wyglądały
    IDENTYCZNIE jak przed zmianą). Dwa miejsca do ustawienia grubości, bo dwa
    różne momenty cyklu życia ściany: pole w pasku narzędzi widoczne przez cały
    czas trybu „Ściany" (stan `wallThickness` w `DesignTab`, trafia na ścianę
    dopiero w `finishWall` — więc podgląd „gumowego" odcinka w trakcie
    rysowania od razu pokazuje DOCELOWĄ grubość, nie stałą 3 jak wcześniej) i
    drugie pole widoczne przy zaznaczonej już zapisanej ścianie w trybie
    „zaznacz" (edycja wprost przez `setDraft`, ten sam wzorzec co
    `moveWallPoint` z poprzedniego kroku — ściany nadal nie mają własnych akcji
    w store). Pole samo przełącza jednostkę: centymetry, gdy skala jest
    skalibrowana (ten sam wybór co etykieta długości z poprzedniego kroku),
    inaczej jednostki planu — bez skali użytkownik i tak nie ma punktu
    odniesienia dla centymetrów.

    **Rysowanie ortogonalne** (dopisane w trakcie, nie w pierwotnym zgłoszeniu)
    to checkbox obok pola grubości, też widoczny przez cały tryb „Ściany", nie
    tylko w trakcie rysowania — włącza się PRZED pierwszym kliknięciem.
    Mechanizm: `orthoSnap(last, p)` porównuje `|dx|` i `|dy|` względem
    OSTATNIEGO postawionego punktu i zamraża oś, wzdłuż której ruch był
    MNIEJSZY, na jego wartości, więc odcinek wychodzi idealnie poziomy albo
    pionowy —
    zastosowane symetrycznie w podglądzie na żywo (`handleStageMouseMove`) i
    przy faktycznym dodaniu punktu (`handleStageClick`), więc gumowy odcinek
    ZAWSZE pokazuje dokładnie to, co wyląduje po kliknięciu.

    5 nowych e2e w `wall-drawing.spec.ts` (Enter zatwierdza, PPM pokazuje menu
    i zatwierdza, PPM z jednym punktem menu NIE pokazuje, grubość z paska
    trafia na zapisaną ścianę, ortho wymusza wspólną współrzędną) i 1 w
    `wall-editing.spec.ts` (zmiana grubości już zaznaczonej ściany). Złapana od
    razu pułapka z poprzedniego kroku: nowe pole „Grubość zaznaczonej ściany"
    DOKŁADA KOLEJNY wiersz nad płótnem, gdy ściana jest zaznaczona — więc test
    przeciągania narożnika (z poprzedniego kroku) zaczął migać, bo pobierał
    bounding box PRZED zaznaczeniem ściany, a przeciągał już PO. Poprawione
    pobraniem boxa na nowo zaraz po zaznaczeniu, nie wcześniej.

    `npx tsc --noEmit` czysto, `npx vitest run` **293/293** (bez zmian — cała
    nowa logika żyje w komponentach Konvy i handlerach zdarzeń, nietestowalnych
    bez prawdziwego kursora), `npx playwright test` **76/76** (+6), `npx vite
    build` bez błędów, `eslint` bez błędów (0 nowych ostrzeżeń).

69. **Rysowanie domu od zera dostaje status RÓWNOLEGŁEJ ścieżki startu obok
    wgrania rzutu, ze standardową skalą i miejscem w onboardingu.** Zgłoszenie:
    „opcja narysowania ścian/całego domu ma być opcją równoległą z wgrywaniem
    rzutu. Ustal standardową skalę rysowania, aby dom o wymiarach 20×20m
    zmieścił się na panelu. Okienko »Zacznij w 3 krokach« powinno w pierwszym
    kroku sugerować wgranie rzutu lub rysowanie domu samodzielnie". Do tego
    kroku narzędzie „Narysuj Ścianę" istniało, ale nic nie prowadziło do niego
    jako do ALTERNATYWY dla wgrania rzutu — trzeba było wiedzieć, że siatka bez
    podkładu w ogóle nadaje się do rysowania, i samemu ustawić sensowną skalę
    przez kalibrację (dwa punkty + długość), co bez fizycznego odniesienia na
    ekranie jest zgadywanką.

    **Standardowa skala: `MANUAL_DRAW_SCALE_MPU = 0.05`** (`lib/design.ts`) —
    1 jednostka planu = 5 cm, więc jedno oczko siatki (`GRID` = 20 jedn.)
    wychodzi RÓWNO na 1 metr. To nie jest arbitralne: przy domyślnym
    `DEFAULT_PLAN_SIZE` (1000×700 jedn.) daje obszar roboczy 50×35 m, więc dom
    20×20 m mieści się z dużym zapasem w OBU orientacjach (nawet 20 m wzdłuż
    krótszego, 35-metrowego boku zostaje 15 m marginesu) — a przy okazji siatka
    sama w sobie staje się linijką: użytkownik widzi na oko, ile metrów ma
    ściana, bez kalkulatora.

    **Nowa, RÓWNOLEGŁA droga startu** (`startManualDrawing` w `DesignTab.tsx`)
    robi trzy rzeczy naraz: ustawia `MANUAL_DRAW_SCALE_MPU` przez istniejące
    `setScale` (żadnej nowej logiki store'a), przełącza narzędzie na „Ściany",
    i pokazuje coach-mark z podpowiedzią klikania. Dostępna z DWÓCH miejsc,
    zawsze obok — nie zamiast — wgrania rzutu: (1) panel „Plan / szkic" w
    kolumnie narzędzi, jako drugi przycisk pod „albo"; (2) krok 1 karty
    „Zacznij w 3 krokach", jako druga CTA obok „Wgraj rzut" (nowy opcjonalny
    prop `secondary` na `StepRow` w `OnboardingChecklist.tsx` — jedyne miejsce,
    które go używa, więc nie ma potrzeby uogólniać reszty kroków). Krok 1
    odhacza się SAM z chwilą wywołania `setScale` — `facts.maSkale` (patrz
    `lib/onboarding.ts`, niezmienione) nie rozróżnia skali z kalibracji od
    skali standardowej, więc żadna nowa logika onboardingu nie była potrzebna.

    **Coach-mark dostał drugi wariant.** Wcześniej `coachMark` był `boolean`
    (jeden popover, jeden anchor — linijka kalibracji). Teraz to `"skala" |
    "sciany" | null`, z osobnym `wallToolRef` obok istniejącego `scaleToolRef`
    i dwoma blokami `<CoachMark>` zamiast jednego. Ręczny wybór narzędzia z
    paska (poza CTA karty) chowa dymek niezależnie od tego, KTÓRY akurat wisiał
    — jeden `setCoachMark(null)` w `onChange` ToolRaila, zamiast dwóch
    osobnych warunków.

    **Złapany przy pisaniu testów: BROWSER, nie kod aplikacji, przewijał
    stronę.** Klik w przycisk zmieniający narzędzie (np. „Narysuj Ścianę",
    „Gniazdo 230 V" w bibliotece) potrafi doscrollować całą stronę o
    500–750 px — zaobserwowane na WSZYSTKICH tego typu przyciskach, nie tylko
    nowych, więc to nie regresja z tego kroku, tylko od dawna utajona
    właściwość środowiska (Chromium/Playwright), która dotąd nie miała jak
    zaszkodzić. Zaszkodziła dopiero teraz: dodatkowa treść w panelu „Plan /
    szkic" i w karcie onboardingu (widoczna akurat w stanie „świeży projekt,
    bez podkładu" — czyli dokładnie tym, na którym startuje KAŻDY e2e test)
    powiększyła stronę na tyle, że przewinięcie zaczęło wypychać płótno POZA
    widoczny obszar (ujemna współrzędna Y), więc kliknięcia z bounding boxa
    zmierzonego PRZED wyborem narzędzia lądowały poza ekranem. Naprawione w
    `wall-drawing.spec.ts` i `wall-editing.spec.ts`: box mierzony PO kliknięciu
    zmieniającym narzędzie, zawsze poprzedzony jawnym `window.scrollTo(0, 0)`
    — dokładnie ten wzorzec, który `zoomAndBox` w `room-editing.spec.ts` już
    miał (i dlatego ten plik nigdy na to nie chorował). **13 innych,
    NIEZWIĄZANYCH testów** (`design-panel`, `floors`, `panel-sizing`,
    `project-lifecycle`, `protocols-schema-costs`, `room-editing` jeden
    przypadek, `account-nudges`) choruje na TO SAMO od strony ich własnych,
    starszych helperów, które box mierzą przed klikiem — odłożone jako osobne
    zadanie (task „Fix pre-existing e2e click-scroll fragility"), bo to
    poprawka testowa w plikach spoza zakresu tego zgłoszenia, nie coś, co
    ten krok popsuł.

    **Świadomie nie zaimplementowane w tym kroku — patrz rekomendacja niżej.**
    Zgłoszenie pytało wprost, czy przy samodzielnym rysowaniu domu powinno
    pojawić się dodatkowe menu z drzwiami/oknami/meblami. To pytanie
    otwierające, nie żądanie — odpowiedź (rekomendacja: otwory tak, w osobnym
    kroku; meble nie) poszła do użytkownika bez implementacji, żeby nie
    budować czegoś, czego nie potwierdził.

    `npx tsc --noEmit` czysto, `npx vitest run` **293/293** (bez zmian — cała
    nowa logika to UI i orkiestracja stanu, nietestowalna bez prawdziwego
    kursora), `npx vite build` bez błędów, `eslint` bez błędów (0 nowych
    ostrzeżeń). `npx playwright test` (pełny pakiet, 78 testów): **65
    zielonych**, w tym wszystkie pliki dotknięte w tym kroku
    (`wall-drawing.spec.ts`, `wall-editing.spec.ts`, `onboarding.spec.ts`) —
    **13 czerwonych to pre-existing usterka testów opisana wyżej**, w plikach
    spoza zakresu tego zgłoszenia, odłożona jako osobne zadanie zamiast
    naprawiana przy okazji.

70. **Naprawione 13 testów e2e, które chorowały na TO SAMO co diagnoza w kroku
    69 — box mierzony przed kliknięciem, które zmienia stan aplikacji.** Odłożone
    poprzednio jako osobne zadanie; użytkownik poprosił wprost o naprawę teraz.
    Dotknięte pliki: `design-panel.spec.ts`, `floors.spec.ts`,
    `panel-sizing.spec.ts` (3 testy), `project-lifecycle.spec.ts`,
    `protocols-schema-costs.spec.ts` (wspólny helper `placeThreeSockets`,
    4 testy), `room-editing.spec.ts` (1 test), `account-nudges.spec.ts`
    (3 testy).

    **Diagnoza poszła głębiej niż w kroku 69.** Tam winą obarczony był wyłącznie
    klik zmieniający NARZĘDZIE (`toolMode`). Przy naprawie `floors.spec.ts`
    wyszło na jaw drugie źródło tego samego objawu: postawienie PIERWSZEGO
    elementu/ściany/pomieszczenia na całym projekcie samo w sobie odsłania
    trwały baner ryzyka („Ten projekt istnieje tylko w tej przeglądarce...",
    `DesignTab.tsx`, gated na `elements.length > 0 || walls.length > 0 || …`) —
    a to NOWA treść NAD płótnem, więc płótno się przesuwa DOKŁADNIE w trakcie
    tej samej pętli kliknięć, która to pierwsze umieszczenie wykonuje. Test z 3
    kliknięciami 50 px od siebie kończył się z JEDNYM elementem: klik #1 stawiał
    go poprawnie i przy okazji odsłaniał baner, klik #2 i #3 (liczone od tego
    samego, już nieaktualnego boxa) lądowały nad płótnem, nie na nim.

    **Naprawa: box mierzony na nowo PRZED KAŻDYM kliknięciem na płótnie**, nie
    tylko raz na test i nie tylko raz na serię — z jawnym `window.scrollTo(0, 0)`
    tuż przed pomiarem (ten sam wzorzec co `zoomAndBox` w
    `room-editing.spec.ts`, który jako jedyny plik nigdy na to nie chorował,
    właśnie dlatego). Tam, gdzie seria kliknięć stawia kolejne elementy w
    pętli, pomiar boxa przeniesiony DO ŚRODKA pętli, nie przed nią.

    Efekt: **`npx playwright test` 78/78, dwa razy z rzędu** (39,1 s drugi
    przebieg — dla porównania, przed tą naprawą pełny pakiet z tymi samymi 13
    testami czerwonymi trwał ponad 5 minut, bo część nieudanych kliknięć i tak
    czekała na swój pełny timeout zanim test się poddał). `npx tsc --noEmit` i
    `eslint e2e/` czysto — poprawki wyłącznie w plikach testowych, zero zmian
    w kodzie aplikacji.

71. **Otwory — drzwi i okna na ścianach — jako lekkie narzędzie „przyklejające"
    otwór do najbliższego miejsca kliknięcia, bez podziału geometrii ściany.**
    Zgłoszenie było własną rekomendacją z poprzedniego kroku, potwierdzoną przez
    użytkownika wprost: „do fix the e2e test and then doors/windows". Świadomie
    NIE zaimplementowane: meble — rekomendacja z poprzedniego kroku argumentowała,
    że nie wpływają na żadne obliczenie w tej aplikacji (elektrycznej, nie
    architektonicznej), więc koszt biblioteki ikon bez funkcjonalnego zysku się
    nie opłaca. Otwory NATOMIAST mają realny wpływ — gniazdko/łącznik postawiony
    na framudze drzwi to błąd projektowy, który to narzędzie pozwala unikać.

    **Model danych: `Opening`** (`types/index.ts`) — `wallId` (do której ściany
    należy), gotowy punkt świata `x`/`y` (a NIE indeks segmentu + parametr t),
    `angle` (kierunek ściany w tym miejscu, radiany — do rysowania glifu),
    `width` (jedn. planu), `kind: "drzwi" | "okno"`. Świadomy kompromis:
    przesunięcie narożnika ściany (`moveWallPoint` z kroku 68) NIE przesuwa już
    postawionych otworów. To ten sam poziom „lekkości" co reszta narzędzia ścian —
    otwory, jak ściany, nie mają własnych akcji w store, wszystko idzie przez
    `setDraft` wprost w `DesignTab.tsx`.

    **Ściana pod spodem zostaje NIETKNIĘTA — otwór to czysto wizualne przykrycie.**
    Zamiast dzielić geometrię ściany na segmenty przed/po otworze (co
    skomplikowałoby KAŻDĄ istniejącą operację na ścianach — przeciąganie
    narożnika, zmianę grubości, usuwanie), otwór renderuje się jako osobna
    warstwa NAD ścianą: prostokąt w kolorze tła planu (`#F7F9FB`, ten sam, co
    tło `Layer` w `DesignCanvas.tsx`) „wycina" wizualną dziurę, a na niej glif —
    łuk skrzydła (Konva `Arc`, promień = szerokość otworu, 90°, `innerRadius
    === outerRadius` żeby dostać samą linię łuku, nie wypełnioną wycinkę) dla
    drzwi, dwie cienkie linie „szyby" dla okna. Efekt uboczny tej decyzji:
    edycja ściany (krok 68) działa bez ŻADNYCH zmian — otwór po prostu narysuje
    się w innym miejscu, jeśli użytkownik nie przesunie GO osobno.

    **Geometria „przyklejania": `nearestPointOnPolyline`** (nowa funkcja w
    `lib/geometry.ts`) — rzutuje punkt kliknięcia prostopadle na KAŻDY segment
    łamanej ściany, obcina rzut do granic segmentu (żeby nie „wystawał" poza
    koniec ściany), wybiera segment z najmniejszą odległością. Klik rzadko
    trafia idealnie w linię (grubość ściany to kilka pikseli), więc otwór ma
    stanąć na najbliższym miejscu ściany, nie dosłownie pod kursorem. Liczone w
    `DesignCanvas.tsx` (nie w `DesignTab.tsx`) — ten sam podział odpowiedzialności
    co reszta geometrii planu: canvas zna piksele/jednostki planu, tab tylko
    zapisuje gotowy wynik.

    **Domyślna szerokość zależy od skali, jak grubość ściany w kroku 68.**
    `defaultOpeningWidth(kind, metersPerUnit)` w `lib/design.ts`: 90 cm dla
    drzwi, 120 cm dla okna (realne wymiary stolarki) przeliczone na jednostki
    planu, gdy skala jest znana — inaczej stały fallback w jednostkach planu
    (rzadka ścieżka: tryb „Otwory" wymaga najpierw narysowanej ściany, a ściana
    zwykle idzie w parze z jakąś skalą, choćby standardową z kroku 69).

    **Nowe narzędzie w pasku: „Drzwi / Okno"** (`ToolRail.tsx`, ikona `DoorOpen`),
    z minipickerem „Drzwi"/"Okno" w kontrolkach kontekstowych — ten sam wzorzec
    co wybór kształtu pomieszczenia (`ROOM_MODES`). Kliknięcie w ścianę w tym
    trybie NIE zaznacza jej (jak we wszystkich pozostałych trybach) — dokłada
    otwór. Zaznaczanie/usuwanie otworów (PPM → „Usuń otwór") działa jak przy
    ścianach/pomieszczeniach, z jednym dodatkowym wymogiem: usunięcie ściany
    (z menu kontekstowego I z `deleteSelection`, Delete/Backspace) kasuje też
    JEJ otwory — inaczej zostałyby osierocone (`wallId` wskazujący donikąd).
    Backward-compat: `openings: Opening[]` to NOWE pole `Draft` — stare zapisy w
    localStorage go nie mają, więc `loadProjectPayload` dostało
    `{...emptyDraft, ...payload.draft}` zamiast gołego `payload.draft`.

    **Złapana przy pisaniu testów pułapka, ta sama rodzina co w kroku 70:**
    zaznaczenie ściany PPM od razu (bez wcześniejszego lewego kliknięcia)
    zawodziło notorycznie — kontekstowe menu otwierało się i od razu znikało.
    Przyczyna: PPM na jeszcze NIEZAZNACZONEJ ścianie zaznacza ją W TYM SAMYM
    geście, co odsłania nowy wiersz „Grubość zaznaczonej ściany" nad płótnem —
    layout przesuwa się MIĘDZY mousedown a mouseup tego samego kliknięcia, więc
    natywne zdarzenie „click" (liczone dla ELEMENTU POD KURSOREM W MOMENCIE
    mouseup) trafiało w backdrop menu (który zdążył się już zamontować),
    zamykając je natychmiast. Naprawione w `openings.spec.ts` przez rozbicie na
    DWA osobne kliknięcia — najpierw lewe (zaznaczenie, layout się stabilizuje),
    dopiero potem PPM — zamiast jednego PPM na niezaznaczonym elemencie.

    9 nowych testów jednostkowych (`geometry.test.ts`: `nearestPointOnPolyline`
    — rzut prostopadły, obcinanie do końców segmentu, wybór najbliższego z kilku
    segmentów, kąt segmentu pionowego, łamana bez segmentów; `design.test.ts`:
    `defaultOpeningWidth` — fallback bez skali, przeliczenie cm→jedn. ze skalą,
    okno szersze niż drzwi, nieprawidłowa skala też spada na fallback) i 3 nowe
    e2e w `openings.spec.ts` (klik w ścianę dodaje otwór w najbliższym miejscu,
    PPM→„Usuń otwór" kasuje, usunięcie ściany kasuje jej otwory).

    `npx tsc --noEmit` czysto, `npx vitest run` **302/302** (+9), `npx
    playwright test` **81/81** (+3), `npx vite build` bez błędów, `eslint` bez
    błędów (0 nowych ostrzeżeń).

72. **Obrót drzwi o 180°, wybór Drzwi/Okno przeniesiony nad płótno, i zaznaczanie
    przycinania rzutu bez trzymania LPM.** Trzy niezależne poprawki UX zgłoszone
    razem. Pierwsze dwie dotyczą otworów z kroku 71; trzecia to osobny ekran
    przycinania (`CropTool.tsx`, krok 65).

    **Obrót o 180°** — nowe opcjonalne pole `flip?: boolean` na `Opening`
    (`types/index.ts`). Zamiast przeliczać osobno cały glif dla obróconego
    wariantu, `DesignCanvas.tsx` liczy `effAngle = o.angle + (flip ? Math.PI :
    0)` i podstawia go WSZĘDZIE tam, gdzie wcześniej był `o.angle` (dir/perp/
    edge1/edge2/rotacja tła) — obrót o π daje dokładnie te same wzory z
    zamienionymi końcami, więc żadna gałąź renderowania nie musiała się
    zdublować. Włącza się klawiszem „R" na zaznaczonym otworze (ten sam klawisz
    co obrót elementu o 90° — `onKey` w `DesignTab.tsx` dostał gałąź `else if
    (selected?.kind === "opening")`) i przyciskiem „Obróć o 180°" w menu
    kontekstowym otworu (nad „Usuń otwór", ten sam wzorzec co „Edytuj"/„Obróć
    o 90°" przy elementach). Działa dla obu rodzajów, choć wizualnie widoczne
    tylko przy drzwiach — glif okna jest symetryczny względem środka, więc
    `flip` na oknie to no-op wizualny, ale nieszkodliwy (nie było powodu
    dublować logiki gałęzią `kind === "drzwi"` tylko po to, żeby zablokować
    coś, co i tak nic nie zmienia).

    **Wybór Drzwi/Okno przeniesiony** z ogólnego paska „kontrolki kontekstowe"
    (dzielonego z „Kształt:" pomieszczenia, „Grubość:" ściany — pasek NAD całym
    układem: kolumna narzędzi + płótno) do kolumny płótna, bezpośrednio nad
    `<DesignCanvas>`. Czysto kosmetyczna zmiana miejsca w drzewie JSX (`toolMode
    === "otwory"` blok przeniesiony w całości), zero zmian w logice — ale teraz
    wybór stoi wizualnie PRZY narzędziu, którego dotyczy, zamiast w ogólnym
    pasku dzielonym z niepowiązanymi kontrolkami.

    **Przycinanie rzutu: klik-klik zamiast przeciągania.** `CropTool.tsx`
    dostał ten sam wzorzec „klik-ruch-klik" co rysowanie ściany/wieloboku
    pomieszczenia na głównym płótnie: LPM stawia pierwszy róg, ruch myszy BEZ
    trzymania przycisku ciągnie gumowy prostokąt, LPM stawia drugi róg. Gdy
    prostokąt jest już gotowy, KOLEJNY LPM (gdziekolwiek na obrazie) albo Enter
    zatwierdza go od razu — bez sięgania po przycisk „Przytnij zaznaczenie",
    który zostaje jako trzecia, równoległa droga. PPM/Escape w dowolnym
    momencie rysowania anulują i pozwalają zacząć od nowa. Trzy stany
    (`idle`/`drawing`/`drawn`) zamiast dawnego `mousedown`/`mousemove`/
    `mouseup` na przytrzymanym przycisku.

    **Złapany w trakcie pisania testów realny bug, nie tylko testowy: listener
    Escape/Enter potrafił NIGDY się nie odpalić.** `useEffect` bez tablicy
    zależności (wzorzec z `DesignTab.tsx`, tam działający bez zarzutu na
    Delete/Escape) w `CropTool.tsx` re-subskrybował się na KAŻDYM renderze —
    a podczas rysowania gumowego prostokąta każdy ruch myszy to nowy render.
    Naciśnięcie Escape/Enter w niefortunnym momencie trafiało dokładnie w okno
    między zdjęciem starego listenera a podpięciem nowego i ginęło bez śladu —
    100% reprodukowalne w e2e (zweryfikowane surowym `window.addEventListener`
    dodanym z zewnątrz testu: RAW listener zawsze łapał zdarzenie, REACT-owy
    prawie nigdy). To nie był tylko problem testów — realny użytkownik trafiłby
    w to samo okno czasowe równie łatwo. Naprawione przejściem na wzorzec z
    refami: `startRef`/`rectSensownyRef`/`onPrzytnijRef` aktualizowane przy
    każdym renderze (zwykłe przypisanie, nie efekt), listener podpięty RAZ
    (`useEffect(..., [])`) i czytający zawsze najświeższe wartości przez te
    refy — zero re-subskrypcji, więc zero okna na zgubienie zdarzenia.

    **Druga pułapka, ta sama rodzina co w krokach 69/70/71: surowe
    współrzędne STRONY nie trafiały w duży, przeskalowany obraz.** Obraz w
    kolumnie edytora renderuje się z CSS `width: 100%`, więc dla szerokiej
    kolumny (~1200 px) skaluje się znacznie ponad swój naturalny rozmiar —
    zmierzony w testach `boundingBox()` dawał ok. 1200×900 px, czyli WYŻSZY niż
    cały viewport testu (720 px). `page.mouse.click(x, y)` na surowych
    współrzędnych STRONY nie scrolluje niczego — punkt w dolnej części takiego
    obrazu był po prostu poza fizycznie renderowanym viewportem i klik trafiał
    w nic. Naprawione przejściem na `locator.click({ position })`: liczy punkt
    WZGLĘDEM samego elementu (nie strony) i sam wykonuje potrzebny scroll.

6 nowych testów: 2 w `openings.spec.ts` (pozycja wyboru Drzwi/Okno nad płótnem,
    obrót o 180° przez menu i przez „R") i 4 w `crop-tool.spec.ts` (PPM anuluje,
    Escape anuluje i pozwala zacząć od nowa, Enter zatwierdza, trzeci klik na
    gotowym prostokącie zatwierdza) — plus dotychczasowe 4 testy przycinania
    przepisane z przeciągania na klik-klik, bez zmiany liczby.

    `npx tsc --noEmit` czysto, `npx vitest run` **302/302** (bez zmian — cała
    nowa logika to UI/interakcje, nietestowalne bez prawdziwego kursora), `npx
    playwright test` **87/87** (+7 crop-tool, +2 openings), `npx vite build`
    bez błędów, `eslint` bez błędów (0 nowych ostrzeżeń).

73. **Obrót drzwi „nie działał" — realnie działał na poziomie danych/renderu
    (zweryfikowane osobno przez odczyt węzłów Konvy przed/po), ale świeżo
    postawiony otwór nigdy nie stawał się ZAZNACZONY.** `handleWallClickForOpening`
    (krok 71) dodawał otwór do `draft.openings`, ale nie wołał `setSelected` —
    `selected` wskazywał więc na cokolwiek było zaznaczone wcześniej, najczęściej
    nic. Naturalna kolejność działań użytkownika („postaw drzwi, od razu obróć")
    trafiała więc w klawisz „R"/PPM bez żadnego celu: `toggleOpeningFlip`
    wymaga `selected?.kind === "opening"`, a warunek nigdy nie był spełniony —
    wyglądało to jak brak działania funkcji, choć ta sama funkcja przez menu
    kontekstowe PO osobnym kliknięciu w otwór działała poprawnie (i tak właśnie
    wyszła zweryfikowana w e2e z kroku 72 — testy klikały w otwór PRZED próbą
    obrotu, więc nie złapały tej luki).

    Naprawione dopisaniem `setSelected({kind:"opening", id})` (plus
    `setMultiSelected([])`, dla spójności z resztą handlerów zaznaczania) od
    razu po dodaniu otworu — ten sam moment, w którym otwór dostaje swój `id`.
    Przy okazji poprawia to też informację zwrotną: świeżo postawiony otwór od
    razu podświetla się na pomarańczowo (kolor zaznaczenia), więc widać, że coś
    w ogóle powstało, zanim jeszcze dotknie się go ponownie.

    Nowy test w `openings.spec.ts` odtwarza dokładnie tę ścieżkę — „R" zaraz po
    postawieniu drzwi, BEZ pośredniego kliknięcia zaznaczającego — żeby ta
    konkretna luka nie wróciła po cichu.

    `npx tsc --noEmit` czysto, `npx vitest run` **302/302**, `npx playwright
    test` **88/88** (+1), `npx vite build` bez błędów, `eslint` bez błędów.

74. **Podmiana logo aplikacji na przesłany plik** (`lockup-horizontal.svg`) —
    ikona domku + napis „pomocnikelektryka.pl", osadzone jako surowy SVG przez
    `dangerouslySetInnerHTML` w komponencie `Logo` (`App.tsx`). Użyte w dwóch
    miejscach: w nagłówku (obok `sr-only` `<h1>` z tym samym tekstem — SVG jest
    tam `aria-hidden`, więc semantyka/SEO nie ucierpiały) i w stopce (bez
    `sr-only`-bliźniaka, więc tam SVG samo niesie `role="img"
    aria-label="pomocnikelektryka.pl"`). Plik źródłowy podmieniony ręcznie z
    dostarczonego SVG, potem osadzony jako string zamiast trzymany jako osobny
    plik pod `src/assets/` — bo `<img src="...">` okazał się mieć poniższy
    problem, a trzymanie samego markupu inline eliminuje jeszcze jeden poziom
    pośredni (import + fetch przez Vite) bez żadnej straty.

    **Znany, NIEROZWIĄZANY efekt uboczny mimo obszernego śledztwa**: dodanie
    JAKIEGOKOLWIEK wizualnego SVG do nagłówka — niezależnie od tego, czy jako
    `<img src="...svg">`, inline JSX `<svg>`, czy `dangerouslySetInnerHTML` —
    koreluje z RZADKĄ utratą zdarzenia dblclick na zupełnie niepowiązanym
    elemencie (kółku) na płótnie Konvy niżej na stronie. Złapane przez
    `light-groups.spec.ts`, test „ręczna zmiana grupy z okna edycji nadpisuje
    automat": z SVG w nagłówku test zawodzi w większości powtórzeń (typowo
    3-5 na 5), bez niego przechodzi za każdym razem — potwierdzone wielokrotnym
    A/B na świeżo odpalanym serwerze deweloperskim.

    Wykluczone jako przyczyna (każde sprawdzone eksperymentalnie, osobno):
    koszt rekoncyliacji Reacta (`dangerouslySetInnerHTML` zawodzi identycznie
    jak JSX, mimo że nie jest przez Reacta w ogóle rekoncyliowany po
    pierwszym renderze); sama obecność dodatkowego węzła DOM lub większa
    wysokość nagłówka (widoczny zwykły tekst tej samej wielkości bez SVG nie
    powoduje problemu); zbyt szybkie/syntetyczne kliknięcia w teście (dwa
    osobne `page.mouse.click()` z ręcznym opóźnieniem ~80ms między nimi
    zawodzą tak samo jak wbudowane `dblclick()`); nieaktualny stan
    dev-servera/HMR i zalegające procesy Chrome (świeżo wystartowany serwer
    nie pomaga). Odczyt źródła Konvy (`node_modules/konva/lib/Stage.js`)
    pokazuje, że `dblclick` wymaga referencyjnej równości `clickEndShape`
    między dwoma kliknięciami w oknie czasowym `dblClickWindow` — obie
    pojedyncze klikinięcia trafiają poprawnie w properties (`Circle`,
    zweryfikowane przez `stage.getIntersection`), ale coś sprawia, że Konva
    nie rozpoznaje ich jako tego samego elementu. Mechanizm łączący SVG w
    nagłówku z tą zmianą referencji NIE został ustalony.

    Decyzja: wysłać zmianę logo mimo to. Podwójne kliknięcie w prawdziwej
    przeglądarce przez człowieka ma zupełnie inny profil czasowy niż testowe
    (i pojedynczy powtórzony test e2e), więc ryzyko dla realnych użytkowników
    oceniam jako niskie — ale to ISTOTNA, udokumentowana niepewność, nie
    założenie. Test pozostaje w zestawie i może sporadycznie failować przy
    powtórzeniach; jeśli to się nasili albo znajdzie się realny raport od
    użytkownika o nieotwierającym się oknie edycji przez podwójne kliknięcie,
    zacząć śledztwo od dokładnie tego miejsca. Pojedynczy pełny przebieg
    zaraz po tej zmianie: `npx tsc --noEmit` czysto, `npx vitest run`
    **302/302**, `npx vite build` bez błędów, `eslint` bez błędów, `npx
    playwright test` **87/88** (opisany wyżej test „ręczna zmiana grupy..."
    failuje sporadycznie, reszta stabilna).

75. **Powiększenie napisu w nagłówku do rozmiaru poprzedniego logo + hasło pod
    napisem, na prawo od domku** — na prośbę użytkownika, że napis wygląda
    teraz na za mały względem tego, co było wcześniej (zwykły `<h1>
    text-[23px]`), a hasło stoi pod całym logo (czyli też pod ikoną), zamiast
    pod samym napisem. Zamiast skalować cały złożony SVG (`LOGO_SVG_MARKUP`,
    domek+tekst w jednym rysunku) i przeliczać, w którym pikselu zaczyna się
    w nim tekst, żeby podpiąć pod to hasło — co byłoby kruche przy każdej
    kolejnej zmianie rozmiaru — nagłówek dostał nowy układ: sama ikona
    (`ICON_SVG_MARKUP`, nowy mały SVG przycięty do samego domku, bez
    `<text>`) osobno po lewej, a po prawej zwykła kolumna flex: widoczny
    `<h1>` (te same klasy `text-[23px] font-bold`, co dawało poprzednie logo
    — więc rozmiar jest identyczny z definicji, nie przez dobieranie) i pod
    nim hasło. `sr-only` na `<h1>` zniknął — nie jest już potrzebny, bo napis
    jest teraz znowu zwykłym, widocznym tekstem, a nie zaszytym w SVG.

    **Efekt uboczny — przypadkiem rozwiązał zagadkę z kroku 74.** Ten układ
    usunął z nagłówka duży SVG z wpisanym `<text>` (`LOGO_SVG_MARKUP` został
    tylko w stopce, z dala od problemu). Po zmianie `light-groups.spec.ts`
    przeszedł **10 na 10** powtórzeń (wcześniej: 3-5 failów na 5 z tym samym
    SVG w nagłówku) — mocny sygnał, że winowajcą był konkretnie duży SVG z
    tekstem w nagłówku, a nie SVG jako taki (skoro `LOGO_SVG_MARKUP` nadal
    działa bez zarzutu w stopce). Zaktualizowano komentarz w `App.tsx` nad
    `LOGO_SVG_MARKUP`/`ICON_SVG_MARKUP`, żeby nie kłamał o „nierozwiązanym"
    problemie — mechanizmu formalnie nie potwierdzono, ale po 10/10 czystych
    przebiegach to już nie jest otwarte ryzyko warte ostrzegania w kodzie.

    `npx tsc --noEmit` czysto, `npx vitest run` **302/302**, `npx vite build`
    bez błędów, `eslint` bez błędów, `npx playwright test` **88/88**
    (potwierdzone dodatkowo 10 samodzielnymi powtórzeniami samego
    `light-groups.spec.ts`, wszystkie czyste).

76. **Uzupełniona zakładka „Pomoc"** — przycisk w nagłówku wcześniej przewijał do
    sekcji `id="pomoc"`, która nigdy nie istniała w drzewie DOM: klik nie robił
    literalnie nic, martwy link zostawiony po jakiejś wcześniejszej migracji.
    Zastąpiony oknem dialogowym (`HelpModal`, `src/components/help/HelpModal.tsx`)
    zbudowanym na tym samym `Dialog`/`DialogContent`, którego już używają
    `AccountModal`/`AuthModal`/`ProjectsModal` — ten sam wygląd, focus trap,
    zamykanie Escape i przywracanie fokusu za darmo z Radixa.

    Treść w środku (statyczna, bez zależności od store'a):
    - krótki opis, czym jest aplikacja i dla kogo,
    - sześć kroków „jak zacząć", nazwanych DOKŁADNIE tak jak narzędzia i zakładki
      w interfejsie (`Narysuj Ścianę`, `Kalibracja skali`, `Narysuj Pomieszczenie`,
      `Wstaw Element`, `Drzwi / Okno`, `Rozdzielnica`/`Schemat` auto, `Kosztorys`) —
      celowo bez parafrazowania, żeby laik odnalazł w tekście to, co widzi na
      ekranie, zamiast zgadywać, czy „narzędzie do rysowania ścian" to to samo,
      co przycisk „Narysuj Ścianę",
    - opis „Kalkulatorów" i „Protokołów" jako narzędzi niezależnych od projektu,
    - ściągawka skrótów klawiszowych (R, Delete, Enter, Esc, PPM),
    - przypomnienie o lokalnym zapisie projektu (ten sam komunikat co w banerze
      nad płótnem) i zachęta do założenia konta,
    - zastrzeżenie o konsultacji z uprawnionym elektrykiem — krótsza wersja tego
      samego zastrzeżenia co w stopce (`SiteFooter`), bo stopka jest zwykle poza
      ekranem, kiedy ktoś sięga po „Pomoc".

    Nowy test w `shell-ui.spec.ts` („przycisk Pomoc otwiera okno...") pilnuje, żeby
    okno się otwierało, zawierało kluczowe sekcje i zamykało Escape — i żeby nazwa
    kroku 1 („Narysuj Ścianę") nie rozjechała się cichcem z etykietą w `ToolRail.tsx`.

    `npx tsc --noEmit` czysto, `npx vitest run` **302/302**, `npx vite build` bez
    błędów, `eslint` bez nowych ostrzeżeń, `npx playwright test` **88/88** (+1 nowy).

77. **„Kalkulatory" przepięte na TEN SAM silnik doboru co Rozdzielnica** — audyt
    kalkulatorów wykazał, że „Dobór przewodu i zabezpieczenia", „Spadek napięcia"
    i „Impedancja pętli zwarcia" liczyły z osobnej, prostszej kopii logiki
    (`lib/electrical.ts`), podczas gdy zakładka Rozdzielnica od dawna ma dużo
    bogatszy, w pełni przetestowany silnik (`sizeCircuit()` w `lib/panel/sizing.ts`,
    tablice w `lib/panel/norms.ts`): metoda ułożenia (A1/A2/B1/B2/C), współczynniki
    poprawkowe temperatury i grupowania obwodów, osobne limity spadku napięcia dla
    oświetlenia (3%) i pozostałych obwodów (5%), automatyczny wybór charakterystyki
    C przy rozruchu silnikowym. Gorzej: `lib/electrical.ts` liczył spadek napięcia
    rezystywnością miedzi przy 20°C (`RHO_CU = 0,0175`), podczas gdy `norms.ts` ma
    wprost udokumentowane, że trzeba liczyć przy 70°C — temperaturze pracy żyły pod
    obciążeniem (`RHO_CU_70C = 0,0225`) — inaczej wynik jest zaniżony o ~28% i obwód
    przechodzi kontrolę spadku napięcia, której realnie nie spełnia. Dwa miejsca w
    tej samej aplikacji mogły więc dać RÓŻNY wynik dla tych samych danych, bez
    żadnego sposobu dla użytkownika, żeby się zorientować, które ma rację (to
    akurat silnik Rozdzielnicy).

    Zmiany:
    - `lib/panel/sizing.ts` dostał nową funkcję `zsMaxForBreaker(curve, inA)`
      (Zs max = U0 / (k·In)) — dotąd ta sama logika mieszkała osobno w
      `lib/electrical.ts` jako `zsMaxFor` i w `lib/panel/norms.ts` jako gołe stałe
      `CURVE_MULTIPLIER`/`U0`, teraz jest jedna funkcja korzystająca z tych stałych.
      Przyjmuje charakterystykę jako zwykły `string` (nie tylko `Curve`), bo
      wywołujący ją `lib/protocols.ts` (protokół pomiaru pętli zwarcia) czyta
      literę z zapisanego wiersza formularza, gdzie to dowolny tekst.
    - `lib/electrical.ts` stracił `calcCurrent`, `calcVoltageDrop`, `recommendCable`,
      `zsMaxFor`, `CABLE_TABLE` i `U0` — zostały tylko `calcPowerBalance` i
      `calcLighting` (bilans mocy budynku i dobór oświetlenia), bo te dwa
      zagadnienia nie mają odpowiednika w `sizing.ts` i zostają osobnymi,
      prostymi kalkulatorami.
    - `CalculatorsTab.tsx`: kalkulatory „Dobór przewodu i zabezpieczenia" oraz
      „Spadek napięcia" połączone w JEDEN („Dobór przewodu i zabezpieczenia",
      dopisany opis „przekrój, wyłącznik, spadek napięcia") — nie da się ich
      trzymać osobno przy wołaniu `sizeCircuit()`, bo cały sens tej funkcji to
      szukanie najmniejszego przekroju spełniającego OBA warunki naraz (patrz
      komentarz nad `sizeCircuit`). Nowe pola formularza: rodzaj obwodu
      (oświetlenie/gniazda/dedykowany — wpływa na minimalny przekrój, typowy
      prąd znamionowy i limit spadku), sposób ułożenia, temperatura otoczenia,
      liczba obwodów we wspólnej trasie, rozruch silnikowy. Wynik pokazuje też
      listę ostrzeżeń z `sizeCircuit` (ten sam wizualny język co tabela w
      Rozdzielnicy: kolor wg poziomu error/warn) zamiast statycznej notatki
      „to trzeba doliczyć samemu".
    - „Impedancja pętli zwarcia" przepięta na `zsMaxForBreaker` — formuła się nie
      zmieniła (stałe w `electrical.ts` i `norms.ts` były identyczne), zmienił się
      tylko import, więc to czysto porządkowa zmiana (jedno źródło prawdy).

    Nowe testy: `zsMaxForBreaker` w `lib/panel/sizing.test.ts` (przeniesione 1:1 ze
    starych testów `zsMaxFor`), `e2e/calculators.spec.ts` — sprawdza WPIĘCIE (nie
    matematykę, tę pokrywa już `sizing.test.ts`): domyślne dane w kalkulatorze dają
    ten sam wynik co `sizeCircuit` w testach jednostkowych, zmiana rodzaju obwodu
    realnie zmienia dobór, niemożliwy dobór pokazuje komunikat błędu, „Spadek
    napięcia" faktycznie zniknął jako osobna pozycja listy, a pętla zwarcia liczy
    z tych samych stałych co Rozdzielnica.

    `npx tsc --noEmit` czysto, `npx vitest run` **297/297** (−8 usuniętych testów
    martwych funkcji, +3 nowe dla `zsMaxForBreaker`), `npx vite build` bez błędów,
    `eslint` bez nowych ostrzeżeń, `npx playwright test` **94/94** (+5 nowych).

78. **Trwałość stanu Kalkulatorów** — wejścia wszystkich pięciu kalkulatorów
    (włącznie z ręcznie wpisaną listą odbiorników w „Bilansie mocy") żyły
    dotąd w zwykłym `useState` w `CalculatorsTab`, więc znikały przy każdym
    przejściu na inną zakładkę i przy odświeżeniu strony — mimo że reszta
    projektu jest zapisywana lokalnie od dawna (`useProjectStore`'owy
    autosave). Najbardziej bolało to przy „Bilansie mocy": ręczne wpisanie
    kilkunastu odbiorników z ich mocami, a potem jedno przypadkowe kliknięcie
    w „Instalacja" i z powrotem — i lista wracała do trzech domyślnych wierszy.

    Nowy `src/store/useCalculatorsStore.ts` — OSOBNY store od `useProjectStore`,
    bo te kalkulatory są jawnie opisane w samej zakładce jako narzędzia
    niezależne od projektu na planie: nie powinny wędrować do chmury razem z
    rzutem domu, resetować się przy „Nowy projekt" ani wymagać migracji schematu
    projektu zapisanego w Supabase. Użyty `persist` z `zustand/middleware`
    (biblioteka już jest zależnością, tylko nieużywany dotąd podmoduł) zamiast
    ręcznego mechanizmu jak przy autosave projektu — tam ręczny kod jest
    uzasadniony złożonością (debounce, scalanie z chmurą, migracja starego
    schematu), tu żadnej z tych złożoności nie ma, więc gotowe middleware w
    zupełności wystarcza. Zapisywany pod kluczem `pomocnikelektryka_kalkulatory`.

    Przy okazji zmieniony sposób nadawania id nowym odbiornikom w bilansie mocy:
    sekwencyjny licznik modułowy (`dev-1`, `dev-2`, ...) zerujący się przy każdym
    odświeżeniu strony zderzałby się z ID-kami już zapisanymi w localStorage z
    poprzedniej sesji (dwa wiersze o tym samym `dev-1` po dodaniu nowego
    odbiornika po odświeżeniu) — zamieniony na `crypto.randomUUID()`, tak samo
    jak przy tworzeniu otworów drzwi/okien (krok 71).

    Nowy test w `e2e/calculators.spec.ts` („wejścia kalkulatora... przetrwają
    zmianę zakładki i odświeżenie strony") — wpisuje nazwę odbiornika, przechodzi
    na Instalację i z powrotem (sprawdza pamięć W TRAKCIE sesji), potem odświeża
    stronę (sprawdza `localStorage`) i za każdym razem oczekuje tej samej wartości
    oraz zapamiętanego aktywnego kalkulatora.

    `npx tsc --noEmit` czysto, `npx vitest run` **297/297**, `npx vite build` bez
    błędów, `eslint` bez nowych ostrzeżeń, `npx playwright test` **95/95** (+1 nowy).

79. **„Wczytaj z projektu" w Bilansie mocy** — dotąd trzeba było ręcznie
    przepisywać nazwy i moce odbiorników do kalkulatora, mimo że aplikacja już
    zna wszystkie elementy rozstawione na planie. Nowy przycisk w Card „Bilans
    mocy budynku" (obok „Dodaj odbiornik") zastępuje listę odbiornikami
    wyliczonymi z `computeCircuits(draft.elements)` — te same obwody, które
    widać w Rozdzielnicy — przepuszczonymi przez `circuitDemand()` z
    `lib/panel/loads.ts` po `installedW` (moc zainstalowana, PRZED
    współczynnikiem jednoczesności — ten user i tak dobiera osobno suwakiem
    `ks` w tym samym kalkulatorze, nie ma sensu aplikować go dwa razy).
    `draft.elements` obejmuje CAŁY budynek (wszystkie kondygnacje), nie tylko
    aktywną — ten sam zakres, którego już używa Rozdzielnica (patrz komentarz
    przy `elements` w `PanelTab.tsx`), bo „Bilans mocy budynku" z definicji ma
    dotyczyć całego budynku, nie piętra.

    Przycisk jest wyłączony (`disabled`, z tytułem tłumaczącym dlaczego), gdy
    na planie nie ma jeszcze żadnych elementów dających się przeliczyć na moc
    (pusty projekt albo same łączniki/elementy niskoprądowe bez mocy typowej w
    `ASSUMED_POWER_W`) — inaczej klik wyczyściłby listę do zera bez żadnej
    korzyści. Kliknięcie samo w sobie NADPISUJE bieżącą listę, więc poprzedzone
    natywnym `confirm()` — ten sam wzorzec co przy kasowaniu projektów w
    chmurze w `AccountModal.tsx`/`ProjectsModal.tsx`, wystarczający dla akcji
    tej skali, bez budowania osobnego okna dialogowego.

    To świadomie tylko PUNKT STARTOWY, nie synchronizacja na żywo: użytkownik
    może dopisać ręcznie odbiorniki, których nie ma na planie (piekarnik
    podłączony na stałe bez widocznego gniazda, planowana klimatyzacja), a
    kolejne kliknięcie „Wczytaj z projektu" znowu nadpisze całość — to
    zachowanie jest jawnie opisane w `HowItWorks` pod kalkulatorem.

    Nowe testy w `e2e/calculators.spec.ts`: stawia gniazdko (300 W) i punkt
    sufitowy (60 W) na planie, klika „Wczytaj z projektu" i sprawdza, że lista
    dostała dokładnie te dwa obwody z poprawną mocą; osobny test pilnuje, że
    przycisk jest wyłączony na pustym projekcie.

    `npx tsc --noEmit` czysto, `npx vitest run` **297/297**, `npx vite build`
    bez błędów, `eslint` bez nowych ostrzeżeń, `npx playwright test` **97/97**
    (+2 nowe).

80. **Dwa nowe kalkulatory: „Dobór WLZ" i „Rezystancja uziemienia (układ TT)"**
    — domykają braki merytoryczne z audytu Kalkulatorów: dotąd nie dało się
    dobrać kabla zasilającego cały budynek (tylko pojedynczy obwód odbiorczy),
    a ochronę przeciwporażeniową dało się sprawdzić wyłącznie dla układu TN.

    **`sizeFeeder()`** (nowa funkcja w `lib/panel/sizing.ts`) dobiera przekrój
    i zabezpieczenie WLZ (kabla od licznika do rozdzielnicy głównej) na tych
    samych tablicach normatywnych z `norms.ts` co `sizeCircuit` — świadomie
    NIE przez rozszerzenie `sizeCircuit`/`CircuitKind` (te pojęcia opisują
    KOŃCOWY obwód odbiorczy: „oświetlenie"/„gniazda" nie mają sensu dla WLZ),
    tylko osobną funkcją, żeby nie ruszać dobrze przetestowanego, produkcyjnego
    kodu dla korzyści czysto porządkowej. Dwa jawnie opisane ZAŁOŻENIA
    (nie normy): minimalny przekrój WLZ 10 mm² i domyślny limit spadku
    napięcia 2% (węższy niż 3-5% obwodu odbiorczego, bo WLZ to tylko odcinek
    całej trasy — zostawia miejsce na spadek za rozdzielnicą; użytkownik może
    go nadpisać w formularzu). Kalkulator w `CalculatorsTab.tsx` ma przycisk
    „Wczytaj z bilansu mocy", który bierze prąd zapotrzebowany (Pz, dla
    wybranej tu liczby faz) wprost z kalkulatora „Bilans mocy budynku" —
    naturalna kontynuacja tego samego przepływu: policz bilans → dobierz WLZ
    na jego podstawie.

    UWAGA udokumentowana wprost w `sizing.ts` i w „Jak działa kalkulator":
    tablice `norms.ts` dotyczą przewodu w budynku (pod tynkiem/w rurce/
    natynkowo), NIE kabla ziemnego — typowego dla WLZ prowadzonej od złącza
    kablowo-pomiarowego na granicy działki. Świadomie niepokryty przypadek,
    nie cichy błąd: lepiej powiedzieć wprost „to się nie sprawdzi", niż podać
    przekrój policzony złą metodą odniesienia.

    **`maxGroundingResistance()`** (nowa funkcja w `lib/electrical.ts`, wzór
    już wcześniej WSPOMNIANY w notatce kalkulatora „RCD", ale nigdy nie dało
    się go policzyć interaktywnie) — RA max = UL / IΔn, warunek ochrony w
    układzie TT. Kalkulator „Rezystancja uziemienia" ma ten sam układ UI co
    „Impedancja pętli zwarcia" (próg + wartość zmierzona + baner
    spełniony/niespełniony), bo to dokładnie ten sam rodzaj zadania —
    weryfikacja pomiarowa, nie dobór — tylko dla przeciwnego układu sieci.

    Nowe testy: `sizeFeeder` (8 przypadków w `sizing.test.ts`, w tym minimalny
    przekrój, brak prądu, przekrój nie do dobrania, spadek napięcia wymuszający
    grubszy przekrój, współczynniki poprawcze) i `maxGroundingResistance`
    (3 przypadki w `electrical.test.ts`); w `e2e/calculators.spec.ts` — dobór
    WLZ dla danych domyślnych, wczytanie prądu z bilansu mocy, oraz warunek
    spełniony/niespełniony dla uziemienia TT.

    `npx tsc --noEmit` czysto, `npx vitest run` **308/308** (+11 nowych),
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń, `npx
    playwright test` **100/100** (+3 nowe).

81. **Ekran startowy mówi, CO POWSTANIE — plus projekt przykładowy i uczciwy
    pusty kosztorys** — przegląd strony startowej i zakładki „Instalacja" oczami
    kogoś, kto wchodzi tu pierwszy raz. Diagnoza: aplikacja mówiła wyłącznie, co
    użytkownik ma ZROBIĆ („wgraj rzut albo narysuj ściany"), a nigdy, co z tego
    BĘDZIE MIAŁ. Najmocniejsza rzecz w całym produkcie — że rozdzielnica, schemat
    i kosztorys wypełniają się same z rzutu — była widoczna tylko jako cztery
    wyszarzone kafle etapów, które czyta się jak nieaktywne zakładki. Do tego nie
    było ŻADNEJ drogi obejrzenia wyniku bez przejścia całej ścieżki: znajdź skan
    rzutu → wgraj → skalibruj skalę → obrysuj pokoje → ponazywaj → postaw
    elementy. Kto wszedł „zobaczyć, co to jest", odbijał się od pierwszego kroku.

    **Obietnica przed instrukcją** (`components/onboarding/CoPowstanie.tsx`).
    Na ekranie startowym, między nagłówkiem a przyciskami, rząd czterech miniatur
    etapów: rzut → rozdzielnica → schemat → kosztorys. Rysunki SVG, nie zrzuty
    ekranu — zrzut trzeba by odświeżać przy każdej zmianie wyglądu zakładek
    (a nikt o tym nie pamięta), waży kilkadziesiąt razy więcej i w tym rozmiarze
    i tak jest papką; rysunek pokazuje KSZTAŁT rzeczy („to jest tabelka, a tamto
    szyna z aparatami"), nie jej szczegóły. Miniatury są `aria-hidden`, bo niosą
    to samo co podpisy pod nimi. Sam nagłówek karty zszedł z polecenia („Zacznij
    projektować instalację") na zdanie o tym, czym ta strona jest.

    **Projekt przykładowy** (`lib/demoProjekt.ts` + `wczytajPrzyklad` w store).
    Trzeci, lżejszy przycisk pod dwiema drogami startu: „Zobacz gotowy przykład —
    mieszkanie 70 m²". Wczytuje kompletne mieszkanie (5 pomieszczeń, 38 punktów,
    drzwi, ściany) i po jednym kliknięciu WSZYSTKIE cztery zakładki są pełne —
    rozdzielnica dobrana z obwodów, schemat narysowany, kosztorys policzony
    z tras po planie. Decyzje:
    - **Bez podkładu** — podkład to data URL w `bgImages`, czyli setki kilobajtów
      base64 w paczce i w każdym autozapisie. Rysunek stoi na czystej siatce
      w `MANUAL_DRAW_SCALE_MPU`, dokładnie jak dom z „Narysuj dom samodzielnie".
    - **Dynamiczny `import()`** — nikt, kto przyszedł rysować własny dom, nie musi
      pobierać czterdziestu elementów wpisanych w kod. Osobny kawałek, 4,4 kB.
    - **Osprzęt doklejany tą samą funkcją co kliknięcie** (`przyklejDoScian` woła
      `snapElementToWall` z tymi samymi argumentami co `zPrzyciaganiemDoSciany`).
      Bez tego dane „mniej więcej przy ścianie" renderowały się okrakiem na murze
      — gniazdko wpisane 20 cm od osi jest niższe niż własny symbol. Przy okazji
      `WALL_SNAP_TOLERANCE_M` przeniosła się ze stałej lokalnej w `DesignTab`
      do `lib/design.ts`, obok bliźniaczej `ROOM_SNAP_TOLERANCE_M`.
    - **Własny `planSize` 240×180 jedn.** zamiast domyślnych 1000×700 —
      `dopasujZoom` mieści w oknie CAŁY obszar planu, a nie to, co na nim
      narysowano, więc na arkuszu 50×35 m mieszkanie otwierało się jako znaczek
      pocztowy w rogu szarego tła.
    - **Oprawy zsunięte ze środków pokoi**, bo dokładnie tam rysowana jest nazwa
      pomieszczenia i symbol ją zasłaniał.
    - **`projektPrzykladowy` w `ProjectPayload`**, nie w stanie komponentu: przykład
      jest normalnym projektem w store, więc przeżywa przełączanie zakładek i F5,
      i pasek „to jest przykład" ma z nim zostać. Gaśnie przy `resetProject`
      i przy wczytaniu czegokolwiek innego (żaden projekt użytkownika tego pola
      nie ma). Flaga robi jeszcze dwie rzeczy: **blokuje autozapis w chmurze**
      (inaczej samo obejrzenie przykładu zakładałoby zalogowanemu wiersz
      „Przykład: mieszkanie 70 m²" na liście projektów) i **gasi oba banery
      o koncie** — mówią o ryzyku utraty pracy, której tu nie ma, a próg drugiego
      z nich (>10 elementów) przykład przekracza od pierwszej sekundy.

    **Pasek przykładu** (`components/onboarding/PasekPrzykladu.tsx`) stoi w `App`,
    nad treścią KAŻDEJ zakładki i poza granicą błędu: cały sens przykładu jest
    w tym, żeby obejrzeć Rozdzielnicę, Schemat i Kosztorys — i to tam najłatwiej
    zapomnieć, że ogląda się cudze mieszkanie. Wyjście („Zacznij własny projekt")
    idzie przez `resetProject`, ale z KRÓTSZYM potwierdzeniem niż „Nowy projekt":
    przy kasowaniu przykładu nie ma czego żałować.

    **Pusty kosztorys przestał wystawiać rachunek za dom, którego nie ma.**
    `computeCosts` liczyło pomieszczenia jako `new Set(...).size || 1`; `|| 1` jest
    tam dla elementów bez przypisanego pokoju, ale na PUSTYM projekcie dawało jedną
    puszkę rozgałęźną i 6,15 zł brutto komuś, kto dopiero wszedł na stronę — razem
    z całym warsztatem (import cennika, eksport CSV, przycisk PDF, ostrzeżenie
    o metrach z ryczałtu). Teraz `elements.length ? … : 0`. Pusty ekran dla
    Kosztorysu ISTNIAŁ już wcześniej, tylko był nieosiągalny — ta jedna widmowa
    pozycja wystarczała, żeby lista nie była pusta; przeniesiony na wczesny powrót
    z całego widoku (wzorzec z `PanelTab`), z aktualną nazwą zakładki („Instalacja",
    nie „Zaprojektuj instalację") i przyciskiem prowadzącym tam, gdzie powstaje
    treść. Stary test jednostkowy ENSHRINOWAŁ ten błąd („brak elementów → same zera
    poza minimum jednej puszki", z uzasadnieniem „tak jak w oryginale") — to był
    przeniesiony z wersji JS skutek uboczny, nie decyzja.

    Dwadzieścia testów e2e rozpoznawało ekran startowy po napisie „Zacznij
    projektować instalację"; po zmianie nagłówka przestawiłem je na
    `getByRole("heading", …)` — nowy nagłówek powtarza hasło spod logo, więc samo
    `getByText` trafiałoby w dwa miejsca.

    Nowe testy: `demoProjekt.test.ts` (9 przypadków — metraż zgodny z nazwą
    projektu, każdy element w istniejącym pomieszczeniu i w obszarze planu,
    rozdzielnica na planie, wypełnione obwody i kosztorys, jawne typy pomieszczeń
    mokrych, brak podkładu, świeży obiekt przy każdym wywołaniu), dwa przypadki
    pustego projektu w `costs.test.ts`, oraz `e2e/projekt-przykladowy.spec.ts`
    (6 przypadków — obietnica na ekranie startowym, wypełnienie czterech zakładek,
    pasek na każdej z nich, brak zachęt do konta, wyjście do własnego projektu,
    pusty kosztorys).

    `npx tsc --noEmit` czysto, `npx vitest run` **1419/1419** (+11),
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń,
    `npx playwright test` **412/412** (+6).

82. **Kafle etapów pokazują STAN, a nie tylko nazwę** — cztery kafle paska
    przepływu (01 Instalacja → 02 Rozdzielnica → 03 Schemat → 04 Kosztorys)
    wyglądały identycznie i wszystkie były klikalne, więc nowy użytkownik obchodził
    je po kolei i trafiał w trzy puste ekrany. Nic na nich nie mówiło, że etapy
    02-04 nie są równoległymi zakładkami, tylko NASTĘPSTWEM tego, co powstanie
    na 01 — ani czego konkretnie im brakuje.

    Stała plakietka „auto" na etapach 02-03 ustąpiła ŻYWEJ, liczonej w
    `lib/postepKrokow.ts` (czysta funkcja, bez Reacta i bez store'a — stan etapu
    to wniosek z kilku liczb, więc domyka się testem bez montowania aplikacji):
    - 01 — „zacznij tutaj" / „5 pom." / „38 el.",
    - 02 — „czeka" / „9 obw." / „ręcznie",
    - 03 i 04 — „czeka" / „gotowy".

    Plakietka jest zielona, gdy etap ma treść, i szara, gdy czeka (ta sama zieleń
    co ukończony krok w przewodniku). Informacja, którą niosło „auto", nie zginęła:
    przejście „czeka" → „9 obw." pokazuje tę samą automatyczność na przykładzie,
    a `title` kafla mówi to wprost — i to on jest właściwą odpowiedzią na
    zgłoszony problem, bo plakietka mówi „czeka", a dopiero opis mówi NA CO
    („Wypełni się sama, gdy rozstawisz osprzęt na rzucie — albo złóż ją ręcznie").
    `title` pełni przy okazji rolę opisu przycisku dla czytnika ekranu; plakietka
    i podtytuł zostają `aria-hidden`, więc nazwą dostępnościową kafla nadal jest
    sam tytuł etapu — od tego zależy kilkanaście testów e2e.

    **Kafel „czeka" jest nadal w pełni klikalny** — świadomie. Odbieranie
    nawigacji byłoby gorsze niż problem, który naprawiamy: rozdzielnicę da się
    złożyć ręcznie, bez rzutu, a czasem po prostu chce się zajrzeć. Kafel ma
    mówić prawdę, nie stawiać bramek.

    Dwie rzeczy, które reguła musiała złapać, a których nie widać z samego
    „czy są elementy":
    - **Tryb ręczny rozdzielnicy** zapala 02 i 03 bez ani jednego punktu na
      rzucie (`panelTryb === "reczny"` albo aparaty z `manual`), bo dobór
      rozdzielnicy bywa zadaniem samym w sobie — próg liczony z zawartości rzutu
      mówiłby „czeka" komuś, kto ma pełną rozdzielnicę.
    - **Kosztorys NIE** zapala się od ręcznej rozdzielnicy: liczy się wyłącznie
      z rzutu, bo sama lista aparatów nie mówi, ile metrów kabla i ile puszek
      trzeba kupić.

    **Bundle.** `computeCircuits` wszedł do kawałka WEJŚCIOWEGO — świadome
    odstępstwo od podziału z kroku 62, bo liczba obwodów stoi na kaflu, a pasek
    etapów jest widoczny na każdej zakładce, więc nie da się go odłożyć do żadnej
    z nich. Cena zmierzona, nie zgadnięta: **+7,9 kB surowo / +2,8 kB po gzipie**.
    To tania połowa doboru — czyste grupowanie elementów w obwody, bez tablic
    normatywnych; `computeSizedCircuits` i `computeCosts` zostają tam, gdzie były.
    Odrzucona alternatywa: meldowanie liczby obwodów do store'a z zakładek, które
    i tak ją liczą — dawała stan „jeszcze nie wiadomo" na kaflu u kogoś, kto
    wszedł prosto w Kosztorys, plus drugie źródło prawdy do utrzymania.

    Przy okazji doszła odmiana liczebników (`odmianaElementow`/`-Pomieszczen`/
    `-Obwodow`) z pułapką 12-14, bo opisy czyta laik i „2 elementów" wygląda jak
    usterka.

    **Odrzucone z tego samego przeglądu:** podpisy tekstowe przy ikonach paska
    narzędzi (propozycja pomocy dla laika na czas onboardingu). Użytkownik
    rozstrzygnął, że przy symbolach nie ma być opisów — pasek narzędzi zszedł
    kiedyś z podpisów na same ikony właśnie dlatego, że siedem podpisów robiło
    ścianę tekstu (patrz komentarz w `ToolRail.tsx`), i tak ma zostać.

    Nowe testy: `postepKrokow.test.ts` (10 przypadków — pusty projekt, zaczęty
    rzut bez osprzętu, komplet, nieznana liczba obwodów jako `null` zamiast zera,
    tryb ręczny, długości plakietek, kolejność etapów, odmiana liczebników) oraz
    `e2e/kafle-etapow.spec.ts` (5 przypadków — plakietki w obu stanach, reakcja
    na zmianę projektu, klikalność kafla „czeka", ręczna rozdzielnica).

    `npx tsc --noEmit` czysto, `npx vitest run` **1429/1429** (+10),
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń,
    `npx playwright test` **417/417** (+5).

83. **Pasek edytora w jednym rzędzie — płótno odzyskuje 50 px** — pasek miał
    kilkanaście kontrolek i przy typowym oknie 1440×900 zawijał się na DWA rzędy.
    Zmierzone przed i po: **84 px → 46 px**, płótno **800×560 → 850×595**, jego
    górna krawędź **279 px → 241 px** od góry okna, udział powierzchni okna
    **35% → 39%**.

    Kontrolki rozdzielone wg CZĘSTOTLIWOŚCI użycia, nie wg tematu:
    - **w pasku** — zakładki kondygnacji (nawigacja, robiona w kółko), sześć
      przełączników warstw (jedno kliknięcie w ikonę), cofnij/ponów, powiększenie,
      pełny ekran, PDF i zapis;
    - **„Plan"** — dodawanie, duplikowanie i usuwanie kondygnacji, wysokość
      kondygnacji, podkład;
    - **„Rysunek"** — przyciąganie do siatki, przyciąganie osprzętu do ścian,
      rozmiar symboli.

    Przełącznik widoczności SIATKI został przy tej okazji odklejony od checkboxa
    „przyciągaj do siatki", obok którego stał od zawsze — i właśnie dlatego, że stały
    obok siebie, myliły się ze sobą. Pierwszy mówi, co WIDAĆ (warstwa rysunku, więc
    ikona zostaje w pasku), drugi — jak się RYSUJE (więc schodzi pod „Rysunek").

    **`PasekMenu`** (nowy komponent) to zwykły popover, a NIE `DropdownMenu`
    z Radiksa, którego aplikacja używa gdzie indziej: tamto jest menu POLECEŃ —
    pozycje przejmują nawigację strzałkami i zamykają się po wyborze. Tu w środku
    siedzą pola wyboru, suwak, pole liczbowe i przyciski otwierające własne okna
    dialogowe, czyli formularz. Zamyka się kliknięciem obok (`pointerdown`, nie
    `click` — inaczej kliknięcie w płótno pod panelem zamykało panel I stawiało
    element naraz), Escape'em i ponownym kliknięciem w przycisk. Okna otwierane
    z wnętrza panelu są wyjątkiem od zamykania (renderują się w portalu, poza
    pudłem), ale po ich zatwierdzeniu panel zamyka się sam przez
    `useZamknijPasekMenu` — bez tego zostawał otwarty NAD kolumną narzędzi
    i przechwytywał kliknięcia w bibliotekę elementów, czyli w to, co robi się
    zaraz po dodaniu kondygnacji.

    **To zastąpiło dawne „Ustawienia planu"** — zwijanie włączane WYŁĄCZNIE poniżej
    768 px. Tamto miało dwie wady: na monitorze nie robiło nic (a to tam stały te
    dwa rzędy), i dawało inny układ paska na telefonie niż na laptopie, czyli dwa
    zachowania do utrzymania zamiast jednego.

    **Telefon nie mógł na tym stracić** i to wyszło dopiero z pomiaru: sam podział
    na menu dał przy 375 px pasek na **118 px**, czyli WYŻSZY niż wyjściowe 84.
    Stąd dwie rzeczy sterowane `matchMedia` (`useSzerokieOkno`), a nie klasami CSS —
    wybór ma decydować o tym, co w ogóle TRAFIA do drzewa, bo dwie kopie tych samych
    kontrolek (jedna schowana `display:none`) dałyby dwa elementy o tej samej nazwie
    dostępnościowej i dwa trafienia w każdym `getByRole`:
    - przełączniki warstw stoją wprost w pasku od 768 px w górę
      (`rozwinNaSzerokim`), a niżej schodzą pod „Warstwy";
    - zakładki kondygnacji stoją w pasku na monitorze, a na telefonie przenoszą się
      na górę panelu „Plan".

    Po tym: **telefon 84 → 78 px**, monitor 84 → 46 px. `FloorBar` rozpadł się przy
    okazji na `FloorTabs` (przełączanie) i `FloorManagement` (zarządzanie) — to dwie
    różne częstotliwości i trafiają w dwa różne miejsca.

    **Testy e2e: 33 przypadki w 18 plikach** sięgały po kontrolki, które zeszły pod
    menu. Doszły dwa pomocniki w `_flow.ts` (`otworzMenuPaska`, `zamknijMenuPaska`)
    i wywołania przed tymi kontrolkami. Trzy testy trzeba było NAPISAĆ OD NOWA, bo
    zmieniło się ich założenie, a nie tylko selektor:
    - „ustawienia planu chowaja sie na telefonie, a na monitorze stoja odkryte" →
      dwa testy: o wysokości paska na obu szerokościach (z progami z POMIARU, nie
      z oka) i o tym, gdzie mieszkają zakładki kondygnacji;
    - „kondygnacje mieszkają w jednym pasku razem z podkładem i siatką" → to samo
      stwierdzenie, ale przez oba menu.

    Dwa testy w `fullscreen.spec.ts` namierzały pasek przez
    `getByLabel("Rozmiar elementów")` i jego przodka `rounded-card` — a ta kontrolka
    siedzi teraz w PANELU, który sam jest kartą `rounded-card`, więc przodek trafiał
    w panel zamiast w pasek. Kotwicą jest teraz przycisk „Plan", który stoi wprost
    w pasku i jest widoczny zawsze.

    **Nie zrobione, zgłoszone jako osobna sprawa:** strona nadal przewija się przy
    oknie 1440×900 (dokument 1233 px), bo kolumna z biblioteką elementów ma 820 px
    wysokości — o 260 px więcej niż płótno obok niej. Przycięcie jej do wysokości
    płótna zlikwidowałoby przewijanie, ale skróciłoby listę elementów z ~560 px do
    ~300 px i to jest decyzja produktowa, nie porządkowa.

    `npx tsc --noEmit` czysto, `npx vitest run` **1429/1429**,
    `npx vite build` bez błędów, `eslint` bez błędów (2 nowe ostrzeżenia
    `react-refresh` w `PasekMenu.tsx` — ta sama kategoria co siedem istniejących:
    plik eksportuje obok komponentu także hooka), `npx playwright test` **418/418**
    (+1: dwa nowe testy w miejsce jednego przepisanego).

84. **Panel boczny nie proponuje elementów, zanim jest gdzie je postawić** — panel
    startował ZAWSZE na katalogu osprzętu, także na zupełnie pustej kondygnacji.
    Pierwszą rzeczą do przeczytania w kolumnie narzędzi była więc lista gniazd
    trójfazowych, wypustów AGD i ładowarek EV — zamiast podpowiedzi, że plan zaczyna
    się od obrysowania pokoi. Od pomieszczenia zależy podział na obwody i strefy
    ochronne w kuchni i łazience, więc to nie jest kolejność obojętna.

    Reguła w `lib/panelBoczny.ts` (czysta funkcja, z testem): dopóki użytkownik sam
    nie kliknie zakładki, panel pokazuje „Pomieszczenia" na kondygnacji, która nie ma
    ANI pomieszczeń, ANI elementów — i „Elementy" w każdym innym przypadku. Dwie
    rzeczy, które ta reguła musi respektować:
    - **osprzęt postawiony BEZ pomieszczeń zdejmuje podpowiedź.** Praca bez obrysów
      jest dozwolona; kto już nią poszedł, minął moment, w którym „zacznij od pokoi"
      jest pomocne — teraz byłoby cofaniem go do punktu, który zostawił za sobą.
    - **ręczny wybór zakładki wygrywa zawsze.** Podpowiedź ma być podpowiedzią, a nie
      przestawianiem panelu pod palcami.

    Ręczny wybór jest zerowany przy ZMIANIE KONDYGNACJI, bo podpowiedź dotyczy tej,
    na którą się właśnie weszło: nowe, puste piętro ma poprosić o pomieszczenia tak
    samo jak parter, nawet jeśli na parterze panel stoi na elementach.

    Pusty stan `RoomPanel` przestał przy tej okazji być samym stwierdzeniem faktu.
    „Brak pomieszczeń na tej kondygnacji." nie mówiło ani po co je rysować, ani co
    się stanie bez nich — a to jest teraz pierwsze zdanie, jakie czyta nowy
    użytkownik w kolumnie narzędzi.

    **Napięcie z wcześniejszą decyzją, świadomie rozstrzygnięte:** nagłówek
    `panel-zwijanie.spec.ts` zapisuje odrzucony wariant „panel widoczny wyłącznie
    przy narzędziach Wstaw Element / Narysuj Pomieszczenie", z uzasadnieniem, że
    biblioteka jest punktem startu i nowy użytkownik zobaczyłby pusty plan bez śladu
    po katalogu. Ta zmiana tamtego nie cofa: panel jest rozwinięty tak samo jak był,
    obie zakładki stoją na wierzchu, a katalog jest JEDNO kliknięcie stąd. Zmienia
    się wyłącznie to, która zakładka jest otwarta, i tylko na kondygnacji, na której
    osprzętu nie ma jeszcze gdzie postawić.

    **Testy e2e: 59 przypadków w 18 plikach** klikało w katalog od razu na czystym
    rzucie. Doszedł pomocnik `otworzKatalogElementow` w `_flow.ts` — rusza WYŁĄCZNIE
    zakładkę panelu, nie narzędzie, w odróżnieniu od kliknięcia w „Wstaw Element"
    w pasku, które zmienia jedno i drugie i mogłoby po cichu zmienić sens testu.
    Trzy miejsca wymagały czegoś więcej niż wstawki:
    - `numer-obwodu.spec.ts` — jego `postaw` odsłaniał katalog, klikając w sekcję
      akordeonu. Po dołożeniu przełączenia zakładki sekcja bywała już otwarta i to
      kliknięcie ZWIJAŁO ją z powrotem; teraz oba lekarstwa stosuje się po kolei,
      ze sprawdzeniem między nimi.
    - `plan-upload.spec.ts` i `panel-zwijanie.spec.ts` sprawdzały „edytor jest
      widoczny" przez obecność katalogu — teraz sprawdzają PANEL (obie zakładki),
      bo to on jest tym, co ma być widoczne.
    - `przewodnik-karta.spec.ts` pilnował, żeby kolumna narzędzi kończyła się nad
      kartą przewodnika, z tolerancją 1 px. Wyszło 3 px zachodzenia i pogoń za tym
      doprowadziła do PĘTLI SPRZĘŻENIA sprzed tej zmiany: wysokość listy zależy od
      położenia karty, położenie karty od jej wysokości, a ta od szerokości okna —
      którą zmienia pasek przewijania strony, pojawiający się i znikający wraz
      z wysokością listy. Pętla ustala się na punkcie stałym, w którym pod kartę
      wchodzi kilka pikseli dolnego paddingu kolumny. Test pilnuje teraz tego, o co
      naprawdę chodziło — że karta nie zasłania LISTY, z której wybiera się element —
      a kolumnie zostawia 4 px luzu, z opisem dlaczego. Próba naprawy przez ponowny
      pomiar w następnej klatce została WYCOFANA: nie pomogła, więc byłaby
      niewyjaśnionym kodem.

    Nowe testy: `panelBoczny.test.ts` (4 przypadki — pusta kondygnacja, kondygnacja
    z pomieszczeniami, osprzęt bez pomieszczeń, wygrana ręcznego wyboru).

    `npx tsc --noEmit` czysto, `npx vitest run` **1433/1433** (+4),
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń,
    `npx playwright test` **418/418**.

85. **Kolumna narzędzi kończy się tam, gdzie rysunek** — kolumna rosła do wysokości
    swojej TREŚCI: zmierzone **820 px przy płótnie wysokim na 595**. To ona, a nie
    rysunek, ustalała wysokość strony, a dotarcie do dołu katalogu wymagało
    przewinięcia CAŁEJ STRONY — czyli wyniesienia rysunku poza okno dokładnie wtedy,
    gdy wybierało się element, żeby go na tym rysunku postawić.

    Teraz karta narzędzi dostaje na szerokim oknie `height: wysPlotna`, czyli tyle,
    ile płótno obok niej (zmierzone po zmianie: **595 = 595**), a panel w widoku
    zwykłym przewija się sam zamiast rozpychać dokument. Lista pomieszczeń dostała
    przy okazji własne przewijanie, z przyciskiem „Narysuj pomieszczenie" trzymanym
    na wierzchu — przy kilkunastu pokojach uciekał poza kolumnę.

    Na TELEFONIE nic się nie zmienia: tam kolumna stoi NAD rysunkiem, a nie obok
    niego, więc nie ma z czym się równać i wysokość zostaje z treści. Stąd
    `useSzerokieOkno` (ten sam hook co w pasku edytora, krok 83) zamiast klasy CSS.

    **UWAGA — to NIE kończy przewijania strony i obietnica była tu za mocna.**
    Dokument przy oknie 1440×900 zszedł z 1233 px na 1187 px, ale nadal przekracza
    okno. Kolumna nie była głównym powodem: pod edytorem stoją jeszcze zwijane karty
    „Sprawdzenie rzutu" i „Zestawienie elementów" (~98 px), odstęp `mt-10` i stopka
    z zastrzeżeniami (109 px) — razem ~250 px, które z kolumną nie mają nic wspólnego.
    Żeby strona przestała się przewijać, trzeba by ruszyć TE elementy, a to decyzja
    o zawartości strony, nie o układzie edytora.

    Co realnie się poprawiło: dół katalogu jest teraz osiągalny BEZ wynoszenia rysunku
    z oczu. Co się pogorszyło: widoczna część listy elementów jest krótsza (~330 px
    przy pokazanej karcie przewodnika, zamiast do 560 px) — to jest cena, którą ta
    zmiana świadomie płaci.

    **Dwie ślepe uliczki po drodze, obie wycofane:**
    - Włączenie `wypelnijWysokosc` (trybu z pełnego ekranu) w widoku zwykłym.
      Lista wypełniała wtedy kolumnę i przestawała skracać się pod kartę przewodnika
      — czyli łamała gwarancję, którą `przewodnik-karta.spec.ts` pilnuje od kroku,
      w którym karta zasłaniała listę z elementami do wybrania. Zostało
      `wypelnijWysokosc={pelnyEkran}`, a panel zamiast przycinać treść — przewija ją.
    - Wcześniej (krok 84) ponowny pomiar listy w następnej klatce, jako domniemane
      lekarstwo na 3 px zachodzenia. Nie pomagał, więc wypadł.

    `przewodnik-karta.spec.ts` pilnuje teraz tego, o co w nim naprawdę chodziło.
    Dawny pomiar „kolumna kończy się nad kartą" przestał być prawdą Z ZAŁOŻENIA:
    kolumna sięga dołu rysunku, więc karta pływa nad jej dolną, PUSTĄ częścią. Test
    sprawdza więc, że karta nie zasłania niczego, w co się klika — listy, szukajki
    ani zakładek panelu.

    `npx tsc --noEmit` czysto, `npx vitest run` **1433/1433**,
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń,
    `npx playwright test` **418/418**.

86. **Kosztorys przestał podawać ceny materiału jako ceny instalacji; pasek przykładu
    zszedł z Kalkulatorów i Protokołów** — dwa znaleziska z przeglądu całej aplikacji
    zrobionego po scaleniu kroków 81-85.

    **Suma mówi teraz, czym jest.** `robocizna` ma w `DEFAULT_PRICES` cenę **0** —
    tak samo oprawy, napędy rolet i szafka teletechniczna — więc na typowym projekcie
    do sumy nie wchodzi. Na przykładowym mieszkaniu 70 m² dawało to pod wielką,
    miedzianą liczbą podpis **„RAZEM brutto — 2621,74 zł"**, czyli kwotę za sam
    materiał, kilkakrotnie zaniżoną względem tego, co użytkownik faktycznie zapłaci.
    A to jest JEDYNA liczba, którą laik wynosi z całej aplikacji i pokazuje wykonawcy.

    Zastrzeżenie istniało, ale stało POD sumą, drobnym drukiem — kolejność odwrotna
    do ważności. Teraz:
    - `podsumowanieKosztorysu` (nowa czysta funkcja w `lib/costs.ts`) liczy sumy
      RAZEM z podpisem: „RAZEM brutto" przy komplecie cen, „RAZEM brutto — niepełny"
      przy braku dowolnej pozycji i **„RAZEM brutto — sam materiał"**, gdy brakuje
      właśnie robocizny. Ten trzeci przypadek jest wyróżniony, bo to on decyduje,
      czym ta suma w ogóle jest;
    - ostrzeżenie przeniosło się z pod tabeli DO STOPKI TABELI, tuż nad wiersz sumy,
      i w wariancie „brak robocizny" zaczyna się od zdania „To jest cena materiału,
      nie cena instalacji.";
    - ten sam podpis idzie do **eksportu CSV** i do **PDF-a**, a PDF dostał dodatkowo
      jawną notkę o tym, czego suma nie obejmuje. To akurat tam było najgorzej:
      dokument wysyłany wykonawcy podawał „RAZEM brutto" bez ŻADNEGO śladu po braku
      robocizny — czyli w jedynym miejscu, gdzie liczba przestaje mieć obok siebie
      aplikację, która mogłaby ją wytłumaczyć.

    Świadomie NIE wymyślamy stawki robocizny, żeby suma się „domknęła" — zmyślona
    liczba jest gorsza od jawnego pytania (ta sama zasada, na której stoją rzadkie
    przekroje w `DEFAULT_PRICES`). Zamiast tego suma przestaje udawać, że jest pełna.

    **Pasek „To jest projekt przykładowy" pokazuje się już tylko na czterech krokach
    przepływu.** Wisiał nad KAŻDĄ zakładką (krok 81), w tym nad Kalkulatorami
    i Protokołami — a te są z założenia NIEZALEŻNE od projektu (patrz „Decyzje
    produktowe"), więc nie miał tam czego opisywać. Gorzej: jego zdanie „nic z tego
    nie zapisuje się na Twoim koncie" było tam wprost NIEPRAWDZIWE — „Zapisz zestaw"
    w Protokołach zapisuje do chmury normalnie, bo protokoły mają własny, ręczny zapis
    i nie idą przez autozapis projektu (a to jego blokuje `projektPrzykladowy`).
    Zdanie zostało przy okazji zawężone do tego, o czym pasek naprawdę mówi: „ten
    projekt nie zapisuje się na Twoim koncie".

    Jeden istniejący test e2e zmienił oczekiwany tekst: trzy gniazdka to trzy punkty
    instalacyjne, więc `protocols-schema-costs.spec.ts` trafia teraz w MOCNIEJSZY
    wariant ostrzeżenia. Słabszy („Suma nie obejmuje wszystkiego") zostaje dla braków
    w pozostałych pozycjach.

    Nowe testy: cztery przypadki `podsumowanieKosztorysu` w `costs.test.ts` (brak
    robocizny, komplet cen, brak innej pozycji, pozycja o zerowej ilości jako NIE-luka)
    oraz dwa w `e2e/projekt-przykladowy.spec.ts` — pasek poza zakładkami przepływu
    i kolejność „ostrzeżenie nad sumą" mierzona z układu.

    `npx tsc --noEmit` czysto, `npx vitest run` **1437/1437** (+4),
    `npx vite build` bez błędów, `eslint` bez nowych ostrzeżeń,
    `npx playwright test` **420/420** (+2).

## Czym zastąpić auto-detekcję — rekomendacja (nie zaimplementowane)

Silnik oparty na progach geometrycznych (Otsu + śledzenie biegów tuszu +
zalewanie tła) sprawdza się na CZYSTYCH, wektorowych rzutach, ale rozjeżdża
się na wszystkim, co realne biuro projektowe faktycznie produkuje: kreskowane
wypełnienie ścian, tabelki z legendą na tym samym arkuszu, gęste wymiarowanie,
meble. To fundamentalne ograniczenie metody, nie usterka do złapania kolejnym
progiem. Jeśli temat kiedyś wróci, są dwa realne kierunki, poważnie różne
kosztem i jakością:

1. **Wyspecjalizowany model segmentacji rzutów (najlepsza jakość).**
   Modele jak **CubiCasa5K** (open source, wytrenowany na >5000 prawdziwych
   rzutach mieszkań) albo komercyjne API w rodzaju **Archilyse** czy
   **Reonic** rozpoznają ściany, drzwi, okna i pomieszczenia z rozsądną
   dokładnością nawet na kreskowanych, zaśmieconych rzutach — bo uczyły się
   na TAKICH danych, a nie na założeniu „ściana to jednolity pasek tuszu".
   Koszt: albo hosting własnego modelu (CubiCasa5K to PyTorch, kilkadziesiąt
   MB wag, wymaga backendu — GPU nie jest konieczne do inferencji, ale
   backend jest, bo modelu tej wielkości nie da się rozsądnie uruchomić w
   przeglądarce), albo płatne API third-party (koszt per-wywołanie, zależność
   od zewnętrznego dostawcy, dane użytkownika opuszczają aplikację).
2. **Multimodalny LLM z narzędziami (Claude/GPT z vision) jako „drugi
   silnik", nie zamiennik pierwszego.** Zamiast (albo obok) klasycznej CV,
   dać modelowi obraz rzutu i poprosić o współrzędne ścian/pomieszczeń w
   ustalonym formacie JSON (podobnym do `DetectedGeometry` z usuniętego
   `types.ts` — ten kontrakt danych nadal ma sens jako format WYJŚCIA,
   niezależnie od tego, co go produkuje). Zaleta: model widzi tabelkę z
   legendą i WIE, że to nie ściana — nie trzeba tego zgadywać z geometrii.
   Wada: koszt per-wywołanie (jeden rzut = jedno zapytanie do API, nie
   przetwarzanie lokalne), zależność od sieci, i — kluczowe — modele vision
   są dobre w ROZPOZNAWANIU, ale słabe w PRECYZYJNYCH WSPÓŁRZĘDNYCH pikselowych;
   realistyczny wynik to przybliżony obrys do poprawienia ręcznie, nie
   gotowa geometria. To nadal može być duża poprawa względem obecnego zera,
   ale wymaga zaprojektowania UI weryfikacji od nowa (poprzedni `DetectionReview`
   został usunięty razem z resztą).

   **Rekomendacja, gdyby ktoś pytał „od czego zacząć":** wariant 2 (LLM
   vision) jako szybszy do zweryfikowania bez inwestycji w infrastrukturę
   modelu — jedno zapytanie do API Claude z obrazem rzutu i promptem
   proszącym o listę wielokątów w pikselach obrazu, przetestowane na TYM
   SAMYM realnym pliku, który złapał wszystkie trzy poprzednie błędy, zanim
   cokolwiek trafi do produkcji.

## Znane ograniczenia szkieletu

### Znaleziska z audytu (krok 28) jeszcze nienaprawione

Audyt wykazał 12 rzeczy; naprawionych zostało 5 w kroku 28, 3 w kroku 29
i sztywny obszar planu w kroku 45. Reszta:

- **Opis pod aparatem 1-modułowym i tak się nie mieści** (krok 28b) —
  34 px to ok. 4 znaki, więc widać „Obwó…". Kolizja zniknęła, ale pełna
  nazwa jest czytelna wyłącznie w liście obok płótna i w legendzie PDF.

### Decyzje produktowe (nie do „naprawienia")

- **Kalkulatory są celowo niezależne od projektu.** Audyt (krok 28)
  zgłaszał jako brak to, że moc odbiornika wpisuje się ręcznie, choć
  aplikacja zna już obwody. Użytkownik rozstrzygnął, że kalkulatory mają
  być osobnym, samodzielnym narzędziem — używanym też bez żadnego
  projektu — więc wiązanie ich z obwodami zostaje świadomie niezrobione.
- ~~Grupy sterowania oświetleniem nie wpływają na dobór obwodów~~ —
  domknięte w kroku 59.

### Pozostałe

- Aktualizacja Vite 5 → 8 i Vitest 2 → 4 wykonana w kroku 45 — `npm audit`
  zgłasza teraz **0 podatności**. Wymagała czystej instalacji, bo npm nie
  potrafił przeliczyć istniejącego drzewa zależności.
- Integracja z Supabase jest gotowa w kodzie, ale nieskonfigurowana —
  patrz krok 10 wyżej. Skopiuj `.env.example` do `.env` i uzupełnij
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, żeby włączyć logowanie i
  zapis w chmurze.
- Zmiana kolejności aparatów w rozdzielnicy nadal działa przyciskami ↑/↓,
  nie przeciąganiem myszką po płótnie jak w oryginale — świadomie
  pominięte jako osobna, ryzykowna porcja pracy (interakcja przeciągania
  na Konvie), skoro przyciski są prostsze i już działają.
- Dwadzieścia sześć testów Playwright w 10 plikach (katalog `e2e/`) pokrywa
  5 z 6 zakładek plus autozapis, „Nowy projekt", rysowanie pomieszczeń, grupy
  oświetlenia, obszar planu i powłokę aplikacji. Kalkulatory (bezstanowe, bez
  interakcji z Konvą) i integracja Supabase (wymaga prawdziwego `.env`)
  zostają bez testów e2e.
- ~~Detekcja pomieszczeń na skomplikowanych realnych rzutach zaniżała liczbę
  pokoi~~ — cały silnik auto-detekcji USUNIĘTY w kroku 66 (zbyt zawodny mimo
  trzech rund napraw); zamiast tego wgraj → przytnij → narysuj ręcznie.
  Rekomendacja, czym ewentualnie zastąpić, opisana pod krokiem 66.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test            # Vitest
npm run e2e          # Playwright (uruchamia dev server automatycznie)
npm run build
```
