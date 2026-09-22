# pomocnikelektryka.pl

Aplikacja do zaprojektowania instalacji elektrycznej w domu jednorodzinnym albo
w mieszkaniu. Rysujesz rzut, rozmieszczasz gniazda i oświetlenie, a reszta liczy
się sama: dobór zabezpieczeń i przewodów wg PN-HD 60364, rozdzielnica, schemat
jednokreskowy, kosztorys i protokoły pomiarowe.

Działa w całości po stronie przeglądarki. Konto w chmurze jest opcjonalne —
bez logowania projekt zapisuje się lokalnie i wszystko poza synchronizacją
działa tak samo. Aplikacja działa też bez zasięgu (service worker), bo rzut
ogląda się zwykle na budowie.

## Uruchomienie

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Aplikacja wstaje na `http://localhost:5173`.

Krok z `.env` jest opcjonalny: bez niego aplikacja działa w pełni lokalnie, tylko
logowanie i zapis w chmurze są niedostępne (`SUPABASE_CONFIGURED` = `false`).
Plik `.env.example` ma wpisany adres i klucz `anon` — ten klucz jest publikowalny
z założenia i tak czy tak trafia do paczki wysyłanej przeglądarce.

Node 24. Tyle jest sprawdzone lokalnie i tyle ustawia CI; `package.json` nie
wymusza wersji, więc starsze mogą działać, ale nikt tego nie sprawdzał.

## Skrypty

| Polecenie | Co robi |
|---|---|
| `npm run dev` | serwer deweloperski (port 5173) |
| `npm run build` | `tsc -b` + build produkcyjny do `dist/` |
| `npm run preview` | serwuje zbudowaną paczkę |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | testy jednostkowe (Vitest), jednorazowo |
| `npm run test:watch` | testy jednostkowe w trybie ciągłym |
| `npm run e2e` | testy end-to-end (Playwright) |

## Testy

Dwa poziomy, obydwa wymagane przed wejściem na `main` (pilnuje tego CI).

**Jednostkowe** (Vitest, ok. 1780 testów) siedzą obok kodu jako `*.test.ts`.
Pokrywają głównie `src/lib` — czyste funkcje bez Reacta: obliczenia elektryczne,
geometria rysunku, dobór przewodów, kosztorys.

**End-to-end** (Playwright, ok. 545 testów) w katalogu `e2e/`. Konfiguracja
definiuje **dwa projekty**, i to rozróżnienie jest celowe:

- `dev` — zasadniczy zestaw, jedzie po serwerze deweloperskim;
- `offline` — wyłącznie `offline.spec.ts`, jedzie po **zbudowanej paczce**
  serwowanej przez `vite preview` (port 5190), bo service worker jest w trybie
  deweloperskim celowo wyłączony i inaczej nie dałoby się go sprawdzić.

Playwright sam podnosi oba serwery, więc `npm run e2e` wystarcza.

Kilka rzeczy, które warto wiedzieć, zanim się je tknie:

- **Testy chmury** (`konto.spec.ts`, `rooms-reconcile-cloud.spec.ts`) wymagają
  `E2E_TEST_EMAIL` i `E2E_TEST_PASSWORD` w `.env`. Bez nich **pomijają się**,
  a nie wywalają — reszta zestawu działa po samym sklonowaniu repozytorium.
  Konto musi być OSOBNE, wyłącznie do testów: kasują z niego wszystkie zapisy
  o nazwach zaczynających się od `E2E-TEST`.
- **Dotyk** sprawdza się przez CDP (`Input.dispatchTouchEvent`), bo
  `page.touchscreen` potrafi tylko pojedyncze dotknięcie — a przytrzymanie
  i szczypanie dwoma palcami wymagają czegoś więcej.
- **Płótno rysunku** to Konva, więc w testach klika się we współrzędne, nie
  w selektory. Stąd wyższe okno (1000 px) w konfiguracji — komentarz przy nim
  tłumaczy, dlaczego niższe psuje dziesiątki testów.

## CI

`.github/workflows/sprawdzenia.yml`, na każdym pull requeście i na push do
`main`. Dwa joby: szybkie bramki (typy, lint, testy jednostkowe) i e2e osobno,
żeby literówka w typach wracała po minucie, a nie po kilkunastu.

Dane konta testowego CI bierze **wyłącznie z sekretów repozytorium**, nigdy
z `.env.example`. Bez nich testy chmury po prostu się pomijają.

## Wdrożenie

Cloudflare Pages, z `dist/`.

Dwie rzeczy jadą razem z paczką i obie są konieczne:

- `public/_redirects` — aplikacja jednostronicowa z routingiem po History API,
  więc bez reguły `/* /index.html 200` każdy przysłany link otwierałby się tylko
  wtedy, gdy wejdzie się przez stronę główną i kliknie.
- `public/sw.js` — service worker. Nawigacje: sieć pierwsza, pamięć jako zapas.
  Zasoby z `/assets`: pamięć pierwsza. Tej asymetrii nie wolno odwracać —
  powód jest opisany w nagłówku pliku, razem z instrukcją, jak wyłączyć
  mechanizm u wszystkich, którzy go już mają.

## Struktura

```
src/
  components/   widoki zakładek (design, panel, calculators, protocols,
                schema, costs) oraz auth, detect, help, legal, onboarding, ui
  lib/          logika bez Reacta — to tutaj mieszka większość testów
  hooks/        stan wydzielony z dużych komponentów
  store/        Zustand: projekt, historia cofnij/ponów, kondygnacje
  types/        typy domenowe
e2e/            testy Playwrighta (pliki `_*.ts` to pomocniki, nie testy)
docs/           notatki i szablony
```

Sześć zakładek odpowiada sześciu krokom pracy: **Instalacja** (rysunek rzutu),
**Rozdzielnica**, **Schemat**, **Kosztorys** oraz niezależne od projektu
**Kalkulatory** i **Protokoły pomiarowe**. Każda zakładka ma własny adres
i wczytuje się leniwie.

## Konwencje

- **Nazwy po polsku** w nowym kodzie (`gestDotyku`, `czyPokazacPowitanie`).
  Starsze warstwy są po angielsku i nie ma planu ich przemianowywać —
  obie konwencje żyją obok siebie.
- **Komentarze tłumaczą DLACZEGO**, nie co robi linijka. Sporo z nich opisuje
  odrzucone warianty albo zmierzone liczby; to nie jest gadatliwość, tylko
  zapis decyzji, których z samego kodu nie widać.
- **Logika idzie do `src/lib`**, żeby dała się sprawdzić bez montowania
  komponentu. Jeśli coś da się policzyć bez Reacta, ma tam trafić.

## `MIGRATION.md`

Dziennik historyczny migracji z pierwotnego pliku `.jsx` do TypeScriptu —
zapis tego, jak projekt powstawał, krok po kroku. **Nie jest opisem stanu
bieżącego** i miejscami jest nieaktualny (podaje np. 149 testów, gdy jest ich
ponad tysiąc). Aktualny stan sprawdzaj w kodzie, nie tam.
