import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PodgladUdostepnienia } from "./components/PodgladUdostepnienia";
import { udostepnienieZAdresu } from "./lib/udostepnianie";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { zarejestrujServiceWorker } from "./lib/rejestracjaSW";
/**
 * Kroje pisma — WCZYTYWANE, a nie tylko nazwane.
 *
 * `index.css` i `tailwind.config.ts` wołały „Inter Tight" i „IBM Plex Mono" od
 * pierwszego commita, ale nic ich nigdy nie dostarczało: ani `@font-face`, ani linku
 * do Google Fonts, ani pliku w repozytorium. Każda przeglądarka podstawiała więc
 * własny zamiennik z końca listy — Windows Segoe UI, Ubuntu DejaVu Sans — i aplikacja
 * nigdzie nie wyglądała tak, jak ją zaprojektowano.
 *
 * Niewidoczne, dopóki wszystko oglądało się na jednym systemie. Wyszło dopiero w CI:
 * szerszy zamiennik rozpycha pasek edytora z jednego rzędu na dwa (zmierzone: 78 px
 * na Windowsie, 116 px na runnerze Ubuntu, przy progu 84). Czyli nie tylko test —
 * układ paska w jednym rzędzie trzymał się wyłącznie na wąskim kroju.
 *
 * SAMODZIELNIE HOSTOWANE, nie z CDN-u Google: aplikacja ma działać bez zasięgu
 * (patrz `public/sw.js`), a krój pobierany z obcego serwera byłby jedyną rzeczą,
 * której service worker nie potrafi obiecać. Pliki idą przez `@fontsource`, więc
 * Vite bierze je pod skrót treści i ląduje w `/assets` razem z resztą.
 *
 * Wersja ZMIENNA dla tekstu, bo jeden plik obsługuje wszystkie grubości (używamy
 * 400, 500, 600 i 700) i wychodzi lżej niż cztery osobne. Mono zmiennego nie ma,
 * więc trzy grubości jawnie. `latin-ext` jest obowiązkowy — bez niego polskie
 * ą, ę, ł, ń, ś, ź, ż i ć wypadałyby z zamiennika, w środku wyrazu.
 * Reszta podzbiorów (cyrylica, greka) ma własny `unicode-range` i nie pobiera się
 * nigdy, bo nie ma tu czego nimi napisać.
 */
import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-ext-700.css";
import "./index.css";

/**
 * Druga, zewnętrzna granica błędu — na wypadek awarii w samej powłoce aplikacji
 * (nagłówek, pasek etapów, okna dialogowe), czyli poza granicą otaczającą treść
 * zakładki w `App`. Tamta jest tą pierwszą i lepszą: zostawia nawigację na miejscu.
 * Ta łapie to, czego tamta z definicji nie może — i zamienia biały ekran na
 * komunikat, z którego da się wyjść.
 *
 * Bez `onReset`: skoro padła powłoka, nie ma dokąd „wrócić" — zostaje odświeżenie.
 */
/**
 * Link do udostępnionej dokumentacji (F14) otwiera SAMĄ stronę podglądu, a nie
 * aplikację — patrz `PodgladUdostepnienia`. Rozstrzygane tutaj, przed pierwszym
 * renderem, żeby edytor (autozapis, wczytanie projektu z przeglądarki) w ogóle nie
 * wystartował.
 */
const udostepnienie = udostepnienieZAdresu(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>{udostepnienie ? <PodgladUdostepnienia udostepnienie={udostepnienie} /> : <App />}</ErrorBoundary>
  </React.StrictMode>
);

// Po wyrenderowaniu, nie przed: rejestracja czeka na `load`, więc nie konkuruje
// o łącze z pierwszym wyświetleniem strony.
zarejestrujServiceWorker();
