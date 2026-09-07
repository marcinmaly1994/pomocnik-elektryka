import { WERSJA_BUILDU } from "virtual:wersja-buildu";

/**
 * Rejestracja service workera (patrz `public/sw.js`).
 *
 * Osobny moduł, a nie trzy linijki w `main.tsx`, z dwóch powodów: to jedyne miejsce,
 * które decyduje KIEDY w ogóle rejestrować, i jedyne, które zna kształt adresu
 * z wersją. Oba wymagają wyjaśnienia, a `main.tsx` ma zostać spisem treści aplikacji.
 */

/**
 * W trybie deweloperskim NIE rejestrujemy — i to nie jest ostrożność, tylko warunek
 * działania. Vite serwuje wtedy każdy moduł osobno, z adresami zawierającymi znaczniki
 * czasu; zapamiętanie ich w pamięci podręcznej rozjeżdża HMR i podaje kod sprzed
 * ostatniej zmiany. Tryb offline dotyczy wdrożonej aplikacji, nie warsztatu.
 */
export function zarejestrujServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    // Wersja w adresie: pliki z `public/` nie przechodzą przez Vite, więc nie da się
    // jej wstrzyknąć do środka. Inny adres to dla przeglądarki inny service worker,
    // czyli każde wdrożenie samo wymusza aktualizację.
    void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(WERSJA_BUILDU)}`).catch(() => {
      // Brak trybu offline nie jest awarią aplikacji — nie ma o czym informować
      // użytkownika, który o service workerze nie słyszał i słyszeć nie musi.
    });
  });
}
