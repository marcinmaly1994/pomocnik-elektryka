import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Wygaszenie krawędzi poziomo przewijanego paska — tej, za którą jest jeszcze treść.
 *
 * Paski nawigacji na telefonie (zakładki w nagłówku, etapy pod nim) przewijają się
 * w poziomie bez widocznego suwaka. Że jest czym przewijać, zdradzał dotąd sam
 * przycięty ostatni przycisk — tyle że urwany w pół słowa („Protokoły pomiar")
 * czytał się jak błąd układu, a nie jak zapowiedź dalszej treści. Wygaszenie mówi to
 * samo wprost i znika, gdy pasek dojedzie do końca.
 *
 * Etykiet celowo nie skracamy: to nazwy dostępnościowe, na których stoją czytniki
 * ekranu i testy e2e.
 */

/** Szerokość wygaszenia [px]. */
export const SZEROKOSC_WYGASZENIA = 28;

/** Maska CSS dla pasków z treścią za lewą i/lub prawą krawędzią; `undefined` = bez maski. */
export function maskaWygaszenia(zLewej: boolean, zPrawej: boolean): string | undefined {
  if (!zLewej && !zPrawej) return undefined;
  const w = SZEROKOSC_WYGASZENIA;
  const lewo = zLewej ? `transparent, #000 ${w}px` : "#000";
  const prawo = zPrawej ? `#000 calc(100% - ${w}px), transparent` : "#000";
  return `linear-gradient(to right, ${lewo}, ${prawo})`;
}

export function useWygaszenieKrawedzi<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [stan, setStan] = useState({ zLewej: false, zPrawej: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sprawdz = () => {
      // Próg 1 px: przewinięcie potrafi zatrzymać się na ułamku piksela przed końcem.
      const zLewej = el.scrollLeft > 1;
      const zPrawej = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
      setStan((s) => (s.zLewej === zLewej && s.zPrawej === zPrawej ? s : { zLewej, zPrawej }));
    };
    sprawdz();
    el.addEventListener("scroll", sprawdz, { passive: true });
    window.addEventListener("resize", sprawdz);
    // Treść paska zmienia szerokość sama: plakietki etapów, chip zapisu, czcionka
    // doczytana po pierwszym malowaniu.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sprawdz);
    ro?.observe(el);
    Array.from(el.children).forEach((c) => ro?.observe(c));
    return () => {
      el.removeEventListener("scroll", sprawdz);
      window.removeEventListener("resize", sprawdz);
      ro?.disconnect();
    };
  }, []);

  const maska = maskaWygaszenia(stan.zLewej, stan.zPrawej);
  const styl: CSSProperties | undefined = maska ? { maskImage: maska, WebkitMaskImage: maska } : undefined;
  return { ref, styl, ...stan };
}
