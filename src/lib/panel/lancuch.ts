import type { Point } from "@/types";

/**
 * Kolejność punktów obwodu w ŁAŃCUCHU — jednym kablu wchodzącym po drodze do
 * kolejnych puszek, a nie osobnym przewodzie z rozdzielnicy do każdego punktu.
 *
 * ===================== DLACZEGO TO W OGÓLE ISTNIEJE =========================
 * Obwód to JEDEN przewód pod jednym zabezpieczeniem. Gniazd nie zasila się
 * gwiazdą — kabel wychodzi z rozdzielnicy, wchodzi do pierwszej puszki, z niej do
 * następnej i tak dalej. Aplikacja zakładała gwiazdę w DWÓCH niezależnych
 * miejscach naraz, i oba się myliły:
 *
 *  - RYSUNEK pokazywał tyle linii z rozdzielnicy, ile punktów ma obwód. Przy
 *    dwóch gniazdach w jednym pokoju wyglądało to na dwa osobne kable, choć to
 *    jeden obwód i jeden przewód.
 *  - KOSZTORYS sumował odległość rozdzielnica→punkt dla KAŻDEGO punktu z osobna,
 *    więc odcinek do pokoju liczył się tyle razy, ile jest w nim gniazd. Dwa
 *    gniazda 10 m od rozdzielnicy, metr od siebie, dawały ~20 m zamiast ~11 m.
 *    Przy ośmiu gniazdach z jednego obwodu robią się z tego dziesiątki metrów
 *    przewodu, którego nikt nie kupi.
 *
 * Dlatego kolejność liczy JEDNA funkcja, używana i przez rysunek, i przez
 * szacowanie metrów. Gdyby każde z nich porządkowało punkty po swojemu, kosztorys
 * znów mówiłby co innego niż rysunek — tylko subtelniej i trudniej do wychwycenia.
 *
 * ============================== HEURYSTYKA ==================================
 * Najbliższy sąsiad, metryką MANHATTAN. Nie jest to najkrótsza możliwa trasa
 * (to problem komiwojażera), tylko to, co robi elektryk: z rozdzielnicy do
 * najbliższej puszki, potem do następnej najbliższej. Manhattan, bo przewody
 * biegną wzdłuż ścian i pod stropem, nie po przekątnej pokoju — ta sama metryka,
 * którą liczy `estimateRoutes`.
 */
export function kolejnoscLancucha<T extends Point>(start: Point, punkty: readonly T[]): T[] {
  const zostale = [...punkty];
  const kolejnosc: T[] = [];
  let biezacy: Point = start;
  while (zostale.length > 0) {
    let najblizszy = 0;
    let najmniejsza = Infinity;
    for (let i = 0; i < zostale.length; i++) {
      const d = Math.abs(zostale[i].x - biezacy.x) + Math.abs(zostale[i].y - biezacy.y);
      // Ostre `<`: przy remisie wygrywa PIERWSZY z listy, więc kolejność wejściowa
      // rozstrzyga i wynik jest powtarzalny. Bez tego dwa gniazda w tej samej
      // odległości potrafiłyby zamieniać się miejscami między przeliczeniami,
      // a razem z nimi skakałby rysunek trasy.
      if (d < najmniejsza) {
        najmniejsza = d;
        najblizszy = i;
      }
    }
    const [wybrany] = zostale.splice(najblizszy, 1);
    kolejnosc.push(wybrany);
    biezacy = wybrany;
  }
  return kolejnosc;
}
