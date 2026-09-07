/**
 * Service worker: aplikacja ma działać bez zasięgu.
 *
 * Powód jest zawodowy, nie techniczny. Elektryk otwiera ten rzut na budowie — w
 * stanie surowym, w piwnicy, za betonową ścianą — czyli dokładnie tam, gdzie sieci
 * nie ma. Projekt i tak siedzi w `localStorage`, więc bez sieci brakowało wyłącznie
 * samego kodu aplikacji. To on jest tu zapamiętywany.
 *
 * ================================ ZASADA ====================================
 * NAWIGACJE (wejście na adres) — SIEĆ PIERWSZA, pamięć podręczna jako zapas.
 * ZASOBY (/assets/*.js, obrazki) — PAMIĘĆ PIERWSZA.
 *
 * Ta asymetria jest CAŁYM sednem i nie wolno jej odwrócić. Pliki w `/assets` mają
 * skrót treści w nazwie, więc są niezmienne: raz pobrany `index-a1b2c3.js` na zawsze
 * znaczy to samo. `index.html` przeciwnie — to on wskazuje, które wersje tych plików
 * są aktualne. Gdyby wracał z pamięci podręcznej mimo działającej sieci, użytkownik
 * po wdrożeniu dostawałby stary spis z nazwami plików, których już nie ma na
 * serwerze — czyli biały ekran, ten sam, który naprawia `ErrorBoundary`. Service
 * worker ma tamten problem omijać, a nie wskrzeszać.
 *
 * ============================= WYŁĄCZNIK ====================================
 * Gdyby ten mechanizm kiedykolwiek trzeba było wyłączyć u WSZYSTKICH, którzy już go
 * mają zainstalowanego, nie wystarczy skasować tego pliku — przeglądarki trzymają
 * ostatnią działającą kopię. Trzeba wdrożyć `sw.js` o treści:
 *
 *   self.addEventListener("install", () => self.skipWaiting());
 *   self.addEventListener("activate", (e) => e.waitUntil((async () => {
 *     for (const n of await caches.keys()) await caches.delete(n);
 *     await self.registration.unregister();
 *     for (const k of await self.clients.matchAll()) k.navigate(k.url);
 *   })()));
 *
 * i zdjąć rejestrację z `main.tsx`.
 */

/**
 * Wersja przychodzi w adresie rejestracji (`/sw.js?v=…`), bo pliki z `public/` NIE
 * przechodzą przez Vite i nie da się w nie nic wstrzyknąć przy budowaniu. Przy okazji
 * załatwia to aktualizację: inny adres to dla przeglądarki inny service worker, więc
 * każde wdrożenie wymusza instalację nowej wersji.
 */
const WERSJA = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `pomocnikelektryka-${WERSJA}`;
const PREFIKS = "pomocnikelektryka-";

self.addEventListener("install", (zdarzenie) => {
  // Sama powłoka strony, żeby pierwsze wejście bez sieci nie kończyło się błędem
  // przeglądarki. Reszta (kod, obrazy) dopisuje się w miarę używania.
  zdarzenie.waitUntil(
    (async () => {
      try {
        // `cache: "reload"` omija pamięć podręczną HTTP — przy instalacji chcemy
        // świeżą powłokę, a nie tę, którą przeglądarka trzyma od poprzedniej wizyty.
        const odpowiedz = await fetch("/", { cache: "reload" });
        // Ta sama zasada co przy nawigacjach: przekierowanej odpowiedzi nie zapisujemy.
        if (wolnoZapisacNawigacje(odpowiedz)) await zapiszWPamieci("/", odpowiedz);
      } catch {
        // Instalacja bez sieci — tryb offline po prostu zacznie działać przy
        // pierwszym udanym wejściu. Nie ma powodu przerywać instalacji.
      }
    })()
  );
  // Bez `skipWaiting` nowa wersja czekałaby na zamknięcie WSZYSTKICH kart aplikacji,
  // a użytkownik siedzi w jednej karcie tygodniami — aktualizacja nigdy by nie doszła.
  self.skipWaiting();
});

self.addEventListener("activate", (zdarzenie) => {
  zdarzenie.waitUntil(
    (async () => {
      // Pamięć podręczna POPRZEDNICH wdrożeń znika w całości. To ona trzymała stare
      // kawałki kodu, a te po wdrożeniu są już tylko śmieciem zajmującym miejsce.
      const nazwy = await caches.keys();
      await Promise.all(nazwy.filter((n) => n.startsWith(PREFIKS) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (zdarzenie) => {
  const zadanie = zdarzenie.request;
  if (zadanie.method !== "GET") return;

  // Cudze adresy zostawiamy w spokoju — Supabase, czcionki, cokolwiek. Zapisywanie
  // odpowiedzi API w pamięci podręcznej pokazywałoby nieaktualne dane konta i byłoby
  // dużo gorsze niż brak trybu offline.
  const url = new URL(zadanie.url);
  if (url.origin !== self.location.origin) return;

  if (zadanie.mode === "navigate") {
    zdarzenie.respondWith(
      (async () => {
        try {
          const odpowiedz = await fetch(zadanie);
          if (wolnoZapisacNawigacje(odpowiedz)) {
            // Zapisujemy pod „/", bo pod tym kluczem szukamy przy braku sieci —
            // wszystkie adresy aplikacji (/kalkulatory/spadek, /protokoly/izolacja…)
            // i tak dostają ten sam `index.html`.
            await zapiszWPamieci("/", odpowiedz.clone());
          }
          return odpowiedz;
        } catch {
          const zapas = await zPamieci("/");
          if (zapas) return zapas;
          throw new Error("Brak sieci i brak zapisanej kopii strony.");
        }
      })()
    );
    return;
  }

  zdarzenie.respondWith(
    (async () => {
      const zapisane = await zPamieci(zadanie);
      if (zapisane) return zapisane;
      const odpowiedz = await fetch(zadanie);
      // `basic` = ta sama domena i pełna odpowiedź. Odpowiedzi częściowe (206, np.
      // przewijany film) i nieprzezroczyste do pamięci podręcznej się nie nadają.
      if (odpowiedz.ok && odpowiedz.type === "basic") await zapiszWPamieci(zadanie, odpowiedz.clone());
      return odpowiedz;
    })()
  );
});

/**
 * Czy tę odpowiedź na nawigację wolno zapisać jako kopię strony.
 *
 * PRZEKIEROWANE ODPOWIEDZI SĄ TU TRUCIZNĄ i to nie jest teoria. W `_redirects` stoi
 * pięć reguł 301 (stare adresy kalkulatorów), więc wejście ze starego linku daje
 * odpowiedź z `redirected === true`. Podanie takiej odpowiedzi przeglądarce
 * w odpowiedzi na żądanie NAWIGACJI jest błędem specyfikacji — zamiast aplikacji
 * użytkownik zobaczyłby ekran błędu sieci. Ktoś kliknąłby stary link z notatek,
 * aplikacja otworzyłaby się normalnie, a następne uruchomienie bez zasięgu
 * przestałoby działać, bez żadnego widocznego związku między jednym a drugim.
 */
function wolnoZapisacNawigacje(odpowiedz) {
  return odpowiedz.ok && !odpowiedz.redirected && odpowiedz.type === "basic";
}

/**
 * Dostęp do pamięci podręcznej NIE MOŻE wywrócić żądania.
 *
 * `caches.open` potrafi odmówić: zablokowane dane witryny, wyczerpany limit, polityka
 * przeglądarki. Gdy takie odrzucenie leciało wprost z `respondWith`, przepadało całe
 * żądanie — czyli zasób, który BEZ service workera załadowałby się normalnie, z nim
 * nie ładował się wcale. Mechanizm mający pomagać robił szkodę dokładnie tym
 * użytkownikom, u których i tak jest najciaśniej.
 */
async function zPamieci(klucz) {
  try {
    const cache = await caches.open(CACHE);
    return await cache.match(klucz);
  } catch {
    return undefined;
  }
}

async function zapiszWPamieci(klucz, odpowiedz) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(klucz, odpowiedz);
  } catch {
    // Brak miejsca albo brak zgody na dane witryny. Tryb offline po prostu nie
    // zadziała — ale bieżące żądanie ma się udać mimo to.
  }
}
