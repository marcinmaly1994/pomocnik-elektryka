import type { PdfDoc } from "./engine";

/**
 * Rejestr producentów dokumentów — most między kompletem a zakładkami.
 *
 * Rzut i schemat NIE dają się zbudować z samych danych: rzut rasteryzuje się z żywej
 * sceny Konvy, schemat z żywego `<svg>`. Obie sceny istnieją tylko wtedy, gdy ich
 * zakładka jest zamontowana, a aplikacja montuje wyłącznie zakładkę aktywną.
 *
 * Zamiast odtwarzać te rysunki drugi raz „na boku" (dwie implementacje tego samego
 * rysunku rozjeżdżają się przy pierwszej zmianie), każda zakładka zgłasza tu funkcję
 * budującą swój dokument, a komplet po prostu OTWIERA potrzebną zakładkę i czeka, aż
 * producent się pojawi.
 */

type Producent = () => Promise<PdfDoc>;

const rejestr = new Map<string, Producent>();
const czekajacy = new Set<() => void>();

/** Zgłasza producenta i oddaje funkcję wyrejestrowującą — do zwrócenia z `useEffect`. */
export function zarejestrujProducenta(id: string, fn: Producent): () => void {
  rejestr.set(id, fn);
  czekajacy.forEach((f) => f());
  return () => {
    // Tylko jeśli to wciąż NASZ wpis: przy przełączaniu kondygnacji nowy efekt
    // rejestruje się, zanim stary posprząta, i ślepe `delete` skasowałoby świeży wpis.
    if (rejestr.get(id) === fn) rejestr.delete(id);
  };
}

export function producent(id: string): Producent | undefined {
  return rejestr.get(id);
}

/**
 * Czeka, aż producent o tym id się zgłosi.
 *
 * Limit czasu jest częścią kontraktu, nie ostrożnością: bez niego komplet po cichu
 * wisiałby w nieskończoność, gdyby zakładka nie zdążyła się zamontować albo gdyby
 * rysunek nie miał czego pokazać. Lepiej powiedzieć, KTÓREGO dokumentu zabrakło.
 */
export function poczekajNaProducenta(id: string, timeoutMs = 15000): Promise<Producent> {
  const gotowy = rejestr.get(id);
  if (gotowy) return Promise.resolve(gotowy);
  return new Promise((resolve, reject) => {
    const sprawdz = () => {
      const p = rejestr.get(id);
      if (!p) return;
      posprzataj();
      resolve(p);
    };
    const timer = setTimeout(() => {
      posprzataj();
      reject(new Error(`Nie udało się przygotować dokumentu „${id}" — zakładka nie zdążyła się otworzyć.`));
    }, timeoutMs);
    const posprzataj = () => {
      clearTimeout(timer);
      czekajacy.delete(sprawdz);
    };
    czekajacy.add(sprawdz);
  });
}

/** Wyłącznie do testów — rejestr żyje w module, więc bez tego przecieka między nimi. */
export function wyczyscRejestr(): void {
  rejestr.clear();
  czekajacy.clear();
}
