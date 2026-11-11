# Audyt zakładki „Instalacja” — 11.11.2026

Wersja: `main` @ `acdb798` (po #274), serwer deweloperski `localhost:5180`.
Metoda: przegląd kodu (`DesignTab.tsx`, `DesignCanvas.tsx`, `EditorToolbar.tsx`, `KartaElementu.tsx`, `SzablonPomieszczenia.tsx`, `FloorBar.tsx`, `useProjectStore.ts`, `lib/panel/circuits.ts`, `lib/wersjeProjektu.ts`) oraz testy w przeglądarce na przykładach „Mieszkanie 70 m²” i „Dom 136 m²” w oknie 1440×900 i na telefonie 375×812.
Punkt odniesienia: audyt z 5.11.2026 (`docs/audyt-2026-11-05.md`). Wszystkie jego pozycje B1–B12 i F1–F17 są rozliczone. Tutaj nie powtarzam rzeczy naprawionych ani odrzuconych: B5, B11, F16, podpisów przy ikonach, opisu technicznego, podziału oświetlenia po pomieszczeniach ani pierwszeństwa przyciągania przed trybem ortogonalnym.

Oznaczenia: **[POTW.]** — potwierdzone testem w przeglądarce, **[KOD]** — potwierdzone w kodzie, bez przeklikania, **[SUG.]** — sugestia, nie błąd.

---

## 1. Ogólna ocena: **7,5 / 10**

Zakładka jest dojrzała. Po audycie z 5.11 doszły notatki, przewody ręczne, schowek, szablony, wersje, DXF i szuflada na telefonie. W całej sesji testów konsola nie pokazała ani jednego błędu JS. Ocenę obniżają dwie rzeczy:
1. Jedna ścieżka **po cichu kasuje dane użytkownika** (otwarcie przykładu).
2. Jedna nowa funkcja **psuje dane projektu** (szablon pomieszczenia dubluje osprzęt i obwody, a sprawdzenie rzutu tego nie widzi).

Reszta to drobiazgi spójności i dostępności oraz kilka miejsc, w których nowe funkcje nie zostały dociągnięte do końca.

| Obszar | Ocena |
|---|---|
| Rysowanie i edycja (komputer) | 8 |
| Logika danych (obwody, pomieszczenia, zapis) | 6,5 — przez P1-1 i P1-2 |
| UX/UI (komputer) | 8 |
| Telefon | 6,5 |
| Dostępność (klawiatura, czytniki ekranu) | 5 |
| Stabilność (błędy JS) | 10 |

---

## 2. Mocne strony (zostawić)

- **Panel zależny od narzędzia** z krótką instrukcją na górze („Kliknij na planie, żeby dodać notatkę — trafi też na wydruk”). Po kliknięciu elementu od razu pokazuje się jego karta.
- **Sprawdzenie rzutu** pisze zrozumiałym językiem, mówi, co zrobić, i ma przycisk „Pokaż na planie (3)”. Po usunięciu pomieszczenia od razu zgłosiło 3 elementy poza obrysem. **[POTW.]**
- **Skróty nie kolidują z pisaniem.** W polu notatki litery R/D/N, Delete, Ctrl+A i Ctrl+C działają jak w zwykłym polu tekstowym, a plan zostaje nietknięty (48 elementów przed i po). Ctrl+Enter zapisuje notatkę. **[POTW.]**
- **Cofanie obejmuje operacje masowe.** Szablon (+9 elementów) i usunięcie pomieszczenia cofają się jednym Ctrl+Z. **[POTW.]**
- **Przykład nie trafia do chmury** i ma potwierdzenie przy wyjściu („Zacząć własny projekt?”). **[POTW.]**
- **Usunięcie kondygnacji ma okno potwierdzenia** z liczbą elementów i ostrzeżeniem, że tego nie da się cofnąć. **[KOD]**
- Wersje projektu obsługują brak miejsca w przeglądarce i są kasowane razem z projektem (`projektyLokalne.ts:103`). **[KOD]**
- Liczniki na kaflach etapów („48 el.”, „11 obw.”) aktualizują się na bieżąco po każdej zmianie. **[POTW.]**

---

## 3. Znalezione problemy

### P1-1. „Zobacz gotowy przykład” kasuje dane bieżącego projektu bez pytania — **krytyczny** [POTW.]
**Kroki:** Protokoły → „Dane ogólne” → wpisać `TEST-AUDYT` (zapisało się w `pomocnikelektryka_projekt_<id>`). Potem Instalacja → „Zobacz gotowy przykład” → „Mieszkanie 70 m²”. Na koniec przeszukać cały `localStorage`.
**Wynik:** `TEST-AUDYT` nie ma nigdzie. Ekran startowy pokazuje się, gdy *rzut* jest pusty, ale projekt może już mieć protokoły pomiarowe, nagłówek dokumentów, nazwę, ceny i konfigurację rozdzielnicy.
**Przyczyna:** `wczytajPrzyklad` (`useProjectStore.ts:1278`) woła `loadProjectPayload` wprost na bieżący slot. Nie robi tego, co robi `resetProject`: `zapiszTerazLokalnie()` + `przelaczNaNowyProjektLokalny()`. Wyjście z przykładu („Zacznij własny projekt”) nadpisuje potem ten sam slot pustym projektem. Danych nie ma ani w historii cofania, ani w wersjach.
**Dlaczego to ważne:** Protokoły są celowo niezależne od rysunku, więc elektryk, który wypełnił tylko protokół, ma „pusty plan” i widzi dokładnie ten ekran z zaproszeniem do przykładu.

### P1-2. „Wstaw typowy osprzęt” dubluje osprzęt i tworzy fałszywe obwody — **wysoki** [POTW.]
**Kroki:** Mieszkanie 70 m² → klik w Kuchnię → karta pokazuje „W pomieszczeniu jest już 8 elementów — szablon je **uzupełni**, niczego nie usunie” → „Wstaw typowy osprzęt”.
**Wynik:** Elementy 48 → **57**, Rozdzielnica 11 → **14 obw.** Kuchnia ma teraz dwa punkty sufitowe, dwa łączniki i po dwa wypusty AGD (P), (Z), (I). Każdy wypust to osobny obwód B16, więc rozdzielnica dostała 3 zbędne obwody. Sprawdzenie rzutu dalej pokazuje „bez zastrzeżeń”. Przycisk zostaje aktywny, więc drugie kliknięcie doda kolejne 9 sztuk.
**Przyczyna:** `elementySzablonu` zwraca cały komplet bez porównania z tym, co już stoi w pokoju. Komunikat „uzupełni” obiecuje coś innego niż to, co się dzieje.

### P2 — ważne

| # | Problem | Dowód |
|---|---|---|
| P2-1 | **Escape nie odznacza pojedynczego elementu.** Czyści tylko `multiSelected`, a `selected` zostaje i karta elementu wisi dalej. W trybie pełnoekranowym Escape przy zaznaczonym elemencie wyrzuca z pełnego ekranu zamiast odznaczyć. | [POTW.] `DesignTab.tsx:1770–1790` |
| P2-2 | **Przełącznik „strefy ochronne” odstaje od sąsiadów.** Ma stały `title` „Pokaż strefy…” także wtedy, gdy strefy są widoczne, nie ma `aria-pressed` ani miedzianego koloru stanu „włączone”. Siatka i trasy obok mają wszystkie trzy. | [KOD] `EditorToolbar.tsx:356` |
| P2-3 | **Na zaznaczeniu wielu elementów panel nie pozwala ustawić numeru obwodu**, choć menu pod prawym przyciskiem pozwala (`WyborObwodu` przy `multiSelected`). Panel ma tylko wyrównanie, Duplikuj i Usuń. To łamie zasadę z `KartaElementu`: „dwie drogi do jednej czynności”. | [KOD] `DesignTab.tsx:2555–2600` vs `4362–4410` |
| P2-4 | **Karta elementu nie mówi, w którym obwodzie jest element.** Przy „auto” widać samo „auto”, a małe liczby przy symbolach na rzucie to numery grup sterowania, które łatwo wziąć za numery obwodów. Żeby się dowiedzieć, do którego obwodu trafiło gniazdo, trzeba przejść do Rozdzielnicy. | [POTW.] |
| P2-5 | **Telefon: PDF, DXF i pełny ekran są za prawą krawędzią paska.** Pasek przewija się poziomo, ale ma ukryty suwak (`pe-bez-suwaka`) i nie ma żadnej wskazówki. Zmierzone: przycisk pełnego ekranu na 377–409 px, PDF na 419–451 px, DXF na 461–493 px przy ekranie 375 px. | [POTW.] |
| P2-6 | **Odmiana liczebników** `n < 5 ? "elementy" : "elementów"` daje „22 elementów” i „22 uwag”. Występuje w `FloorBar.tsx:39`, `App.tsx:472`, `KopiaZapasowa.tsx:153`, `planCheck.ts:97,98,126,128` i `DesignTab.tsx:2484`. Poprawna funkcja już istnieje: `odmianaElementu` w `szablonyPomieszczen.ts:293`. | [KOD] |
| P2-7 | **Nieodwracalne operacje nie robią automatycznej wersji.** Chodzi o usunięcie kondygnacji („nie da się cofnąć”), wczytanie przykładu (P1-1) i wczytanie kopii JSON. Mechanizm wersji (F15) już istnieje i ma nawet automatyczną wersję „Przed przywróceniem”. | [KOD] |
| P2-8 | **Symbol nakłada się na nazwę pomieszczenia.** To drobiazg z B12 audytu 5.11, nadal widoczny w przykładzie przy Łazience, Przedpokoju i Pokoju. | [POTW.] |
| P2-9 | **Pokazowy „Dom 136 m²” sam ma uwagę w sprawdzeniu rzutu:** „Kotłownia lub garaż bez czujnika czadu”. Przykład, który ma pokazać, co aplikacja potrafi, wita nowego użytkownika ostrzeżeniem o własnym błędzie. | [POTW.] |
| P2-10 | **Trzy różne liczby elementów:** kafel „84 el.” (cały budynek), pasek stanu „Elementy: 52” (bieżąca kondygnacja, razem z wyposażeniem sanitarnym) i zestawienie „50 szt. osprzętu”. Komentarz w `QuantitiesPanel` uzasadnia różnicę, ale pasek stanu nie mówi, że liczy tylko kondygnację. | [POTW.] |
| P2-11 | **Karta „Punkt sufitowy”:** podtytuł powtarza tytuł („Punkt sufitowy / punkt sufitowy”). | [POTW.] |

### P3 — kosmetyka i dług techniczny
- `SzablonPomieszczenia.tsx` ma kolor wpisany na sztywno (`text-[#8A5526]`) zamiast tokenu z `lib/tokeny.ts`, wbrew zasadzie z redesignu. [KOD]
- „Zaznacz kilka” stoi na komputerze w wyróżnionej, miedzianej ramce na samej górze panelu. To przełącznik potrzebny głównie na dotyku (na komputerze to samo robi Shift), a dostaje najmocniejsze miejsce w panelu. [POTW., SUG.]
- `DesignTab.tsx` ma 4641 linii, a `DesignCanvas.tsx` 3706. To już znany temat (podział wymaga osobnej pracy). Odnotowuję tylko, że każda nowa funkcja (F5–F15) dokładała tam kolejne setki linii. [KOD]

### Nieprzetestowane (świadomie)
Wgranie rzutu ze zdjęcia lub PDF, automatyczne wykrywanie ścian, kalibracja skali (nie miałem pliku), wygląd pobranego PDF i DXF, narzędzie „Przewód” w praktyce, tablet, gesty dotykowe (pilnują ich e2e), zapis w chmurze po zalogowaniu i wydajność przy 300+ elementach (mierzona w audycie z 5.11).

---

## 4. Ocena UX/UI

- **Czytelność i hierarchia (komputer):** dobra. Pasek etapów 01–04 z licznikami, pasek narzędzi po lewej, panel narzędzia, rzut i pasek stanu z przyciskiem „Dalej: Rozdzielnica” tworzą logiczny przepływ od lewej do prawej i z góry na dół.
- **Informacja zwrotna:** dobra przy notatkach („Notatka trafi też na rzut w PDF”), szablonie („Wstawiono 9… Ctrl+Z cofa całość”) i sprawdzeniu rzutu. Słaba tam, gdzie wynik operacji jest gdzie indziej: obwód elementu (P2-4) i duplikaty po szablonie (P1-2).
- **Spójność:** przełączniki warstw w pasku działają w dwóch różnych stylach (P2-2). Liczniki elementów mówią trzy różne rzeczy (P2-10).
- **Telefon:** szuflada i rzut na pełną szerokość działają, ale ważne akcje wyjściowe (PDF, DXF) są niewidoczne (P2-5). Baner przykładu i dwa paski narzędzi spychają rzut do ok. 550 px od góry strony.
- **Dostępność:** przyciski narzędzi mają `aria-pressed`, nazwy i podpowiedzi ze skrótem w `title`. Sam rzut (Konva) jest jednak dla klawiatury i czytnika ekranu czarną skrzynką: nie da się dojść Tabem do elementu, a płótno nie ma etykiety. Zestawienie elementów jest tylko do czytania.

---

## 5. Brakujące funkcjonalności (każda rozwiązuje konkretny, zaobserwowany problem)

| # | Funkcja | Jaki problem rozwiązuje |
|---|---|---|
| N1 | **Klikalne zestawienie elementów.** Wiersz „Gniazdo 230 V podwójne × 12” → „Pokaż na planie” / „Zaznacz wszystkie”. | Dziś zestawienie tylko liczy. Nie da się szybko znaleźć ani poprawić wszystkich elementów danego typu. Daje też dostęp do elementów bez płótna (dostępność). |
| N2 | **Edycja zbiorcza w panelu:** numer obwodu (już jest w PPM), wysokość montażu, opis. | Ustawienie 10 gniazd nad blatem na +110 albo na wspólny obwód wymaga dziś 10 dwuklików. |
| N3 | **Obwód w karcie elementu:** „Obwód 6 — Oświetlenie Salon, B10, YDYp 3×1,5” + link „Pokaż w rozdzielnicy”. | P2-4: użytkownik nie widzi skutku swoich decyzji bez zmiany zakładki. |
| N4 | **Kontrola duplikatów w sprawdzeniu rzutu:** dwa wypusty AGD z tą samą literą w jednym pokoju, dwa elementy w tym samym miejscu (np. po podwójnym Ctrl+V). | P1-2 przeszło niezauważone przez obecne reguły. |
| N5 | **Ostatnio używane w katalogu „Wstaw element”** (3–5 kafli nad akordeonem). | Przy rozstawianiu robi się serie tych samych 3–4 typów, a szukajka i akordeon to za każdym razem 2–3 kliknięcia. |
| N6 | **Automatyczne wersje przed operacjami nieodwracalnymi** (P2-7). | Siatka bezpieczeństwa na sytuacje, których Ctrl+Z nie obejmuje. |

---

## 6. Rekomendowane zmiany

### PRIORYTET 1 — krytyczne

**R1. Otwarcie przykładu nie może kasować projektu (P1-1).**
1. *Co jest nie tak:* `wczytajPrzyklad` nadpisuje bieżący slot, razem z protokołami, nagłówkiem i cenami.
2. *Dlaczego:* to cicha, nieodwracalna utrata danych w ścieżce, którą aplikacja sama poleca nowym użytkownikom.
3. *Jak:* przed `loadProjectPayload` zrobić to samo co `resetProject`, czyli `zapiszTerazLokalnie()` + `przelaczNaNowyProjektLokalny()`, gdy bieżący projekt nie jest przykładem i ma jakiekolwiek dane (protokoły, nagłówek, nazwa inna niż domyślna, ceny). „Zacznij własny projekt” powinien wtedy wracać do poprzedniego slotu, a nie zerować slot przykładu. Do tego test e2e: wpis w protokole → przykład → wyjście z przykładu → wpis jest na miejscu.
4. *Korzyść:* klik „zobacz, jak to działa” przestaje być ryzykowny.

**R2. Szablon pomieszczenia dokłada tylko to, czego brakuje (P1-2).**
1. *Co jest nie tak:* dokłada cały komplet, mimo że komunikat obiecuje „uzupełni”. Powstają duplikaty i fałszywe obwody AGD.
2. *Dlaczego:* psuje rozdzielnicę i kosztorys, a sprawdzenie rzutu tego nie wychwytuje.
3. *Jak:* porównać szablon z istniejącym osprzętem pokoju według typu i liczby (oraz litery AGD), wstawić tylko różnicę, a przed kliknięciem napisać „doda 3 elementy: …”. Gdy niczego nie brakuje, wyłączyć przycisk z napisem „Pokój ma już typowy osprzęt”. Do tego reguła N4.
4. *Korzyść:* szablon można bezpiecznie klikać także w gotowym pokoju.

### PRIORYTET 2 — ważne
- **R3.** Escape najpierw odznacza `selected`, a dopiero przy pustym zaznaczeniu wychodzi z pełnego ekranu (P2-1). Jedna linia plus przypadek w e2e klawiatury.
- **R4.** Przełącznik stref jak jego sąsiedzi: zmienny `title`/`aria-label`, `aria-pressed` i miedziany kolor (P2-2).
- **R5.** `WyborObwodu` w panelu zaznaczenia wielu elementów (P2-3), a potem pozostałe pola z N2.
- **R6.** Obwód w karcie elementu (N3 / P2-4).
- **R7.** Telefon: PDF/DXF/pełny ekran w menu „…” albo cień-wskazówka przy prawej krawędzi przewijanego paska (P2-5).
- **R8.** Jedna funkcja odmiany (`odmianaElementu` i analogiczne dla „uwaga” i „błąd”) we wszystkich 9 miejscach (P2-6).
- **R9.** Automatyczna wersja przed usunięciem kondygnacji, wczytaniem kopii i wczytaniem przykładu (P2-7 / N6).
- **R10.** Nazwa pomieszczenia omija symbole (P2-8). Przykład „Dom 136 m²” dostaje czujnik czadu, żeby sam przechodził sprawdzenie rzutu (P2-9).
- **R11.** Pasek stanu: „Elementy na kondygnacji: 52” (P2-10). Usunąć powtórzony podtytuł w karcie (P2-11).

### PRIORYTET 3 — rozwojowe
- **R12.** Klikalne zestawienie z filtrowaniem i „Zaznacz wszystkie” (N1).
- **R13.** Ostatnio używane w katalogu (N5).
- **R14.** Reguła duplikatów w sprawdzeniu rzutu (N4). Jeśli R2 wejdzie bez niej, warto ją dodać i tak, bo duplikaty powstają też przy wklejaniu.
- **R15.** „Zaznacz kilka” na komputerze zwykłym przyciskiem w rzędzie narzędzi zaznaczenia, a nie w wyróżnionej ramce.
- **R16.** Kolor w `SzablonPomieszczenia` z tokenów.

---

## 7. Proponowana struktura zakładki

Obecny układ jest dobry i nie wymaga przebudowy, tylko domknięcia. Docelowo:

```
┌ Pasek etapów 01–04 (bez zmian) ─────────────────────────────────────────────┐
├ Pasek: kondygnacje │ Plan · Rysunek · Opisy │ warstwy │ cofnij │ zoom │ PDF ┤  ← telefon: PDF/DXF w „…”
├──────┬───────────────────────┬───────────────────────────────────────────────┤
│Narzę-│ Panel narzędzia       │                                               │
│dzia  │  • Wstaw: ostatnio    │                 RZUT                          │
│      │    używane + katalog  │                                               │
│      │  • Zaznacz: KARTA     │                                               │
│      │    – typ, pokój,      │                                               │
│      │      OBWÓD (nr, nazwa,│                                               │
│      │      B10, przewód) →  │                                               │
│      │    – wiele: obwód,    │                                               │
│      │      wysokość, opis   │                                               │
├──────┴───────────────────────┴───────────────────────────────────────────────┤
│ Pasek stanu: kondygnacja · pole · „na kondygnacji: 52” · uwagi · Dalej →     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Sprawdzenie rzutu (z regułą duplikatów)                                      │
│ Zestawienie — KLIKALNE: typ × liczba → [pokaż] [zaznacz wszystkie]           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Typowy proces:** pomieszczenia (szablonem albo ręcznie) → osprzęt (szablon dokłada brakujące, „ostatnio używane” przyspiesza resztę) → sprawdzenie rzutu → poprawki zbiorcze z zestawienia → „Dalej: Rozdzielnica”.

**Na pierwszym planie:** rzut, karta zaznaczenia z obwodem i sprawdzenie rzutu.
**Uprościć:** wyróżnioną ramkę „Zaznacz kilka” na komputerze i trzy różne liczniki elementów.
**Połączyć:** opcje zaznaczenia w panelu i w menu PPM (te same akcje w obu miejscach).

---

## 8. Plan działania

1. **PR 1 (P1):** R1 (przykład nie kasuje danych) + test e2e. Mały i samodzielny, robić najpierw.
2. **PR 2 (P1):** R2 (szablon uzupełnia różnicę) + R14 (reguła duplikatów w sprawdzeniu rzutu).
3. **PR 3 (P2, drobne):** R3, R4, R8, R10, R11, R16. Same poprawki spójności, jeden przegląd.
4. **PR 4 (P2):** R5 + R6. Obwód w karcie i edycja zbiorcza obwodu w panelu.
5. **PR 5 (P2):** R7 (telefon) + R9 (automatyczne wersje).
6. **Dalej (P3):** R12 klikalne zestawienie → R13 ostatnio używane → R15.
