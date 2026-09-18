import type { Point } from "@/types";

/**
 * Rozsuwanie osprzętu stawianego blisko siebie.
 *
 * Dwa gniazda postawione obok siebie lądowały jedno na drugim: klik decyduje o środku
 * symbolu, a symbol ma swoją szerokość, o której klikający nie myśli. Efekt jest gorszy
 * niż nieładny — spod wierzchniego symbolu nie da się już wyciągnąć tego pod spodem ani
 * nawet zobaczyć, że tam jest, więc na rysunku zostaje jedno gniazdo zamiast dwóch,
 * a w zestawieniu dwa.
 *
 * Rozsuwamy WZDŁUŻ ŚCIANY, a nie w dowolną stronę. Gniazda montuje się w rzędzie na tej
 * samej wysokości i to jest jedyny kierunek, w którym przesunięcie nie zmienia sensu
 * rysunku: odsunięcie od ściany przeniosłoby gniazdo na środek pokoju.
 */

/** Element jako KOŁO: środek i promień opisany na symbolu (patrz `rogiSymbolu`). */
export interface ZajetyObszar {
  x: number;
  y: number;
  r: number;
}

/**
 * Kierunek rozsuwania dla symbolu obróconego o `rotation` stopni.
 *
 * Trzonek symbolu patrzy PROSTOPADLE do ściany (obrót 270° = trzonek w lewo, czyli
 * ściana pionowa), więc sama ściana biegnie prostopadle do trzonka. Element nieprzypięty
 * do ściany ma obrót 0 i wychodzi z tego kierunek poziomy — czyli gniazda obok siebie
 * w rzędzie, tak jak się je montuje.
 */
export function kierunekWzdluzSciany(rotation: number): Point {
  const rad = (rotation * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/** Czy dwa koła zachodzą na siebie. Styk (odległość równa sumie promieni) to już nie. */
function zachodzi(a: ZajetyObszar, b: ZajetyObszar): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

/**
 * Przesuwa nowy element wzdłuż `kierunek`, aż przestanie zachodzić na sąsiadów.
 *
 * Przesuwa NA TĘ STRONĘ, po której już jest względem sąsiada — dzięki temu gniazdo
 * kliknięte nieco na prawo od istniejącego ląduje po jego prawej, a nie przeskakuje na
 * drugą stronę. Przy kliknięciu dokładnie w środek sąsiada (odległość zero, żadna strona
 * nie jest bliższa) idzie w prawo/w dół, bo jakąś decyzję podjąć trzeba.
 *
 * Pętla ma twardy limit kroków, bo każdy krok odsuwa od JEDNEGO sąsiada i może wejść na
 * kolejnego — przy rzędzie gniazd trzeba przejść wzdłuż całego rzędu. Limit chroni przed
 * zapętleniem, gdyby geometria okazała się zdegenerowana (dwa elementy o zerowym
 * promieniu w tym samym punkcie).
 */
export function odsunOdSasiadow(
  nowy: ZajetyObszar,
  sasiedzi: ZajetyObszar[],
  kierunek: Point,
  maksKrokow = 16
): Point {
  const dlugosc = Math.hypot(kierunek.x, kierunek.y);
  if (!(dlugosc > 0)) return { x: nowy.x, y: nowy.y };
  const k = { x: kierunek.x / dlugosc, y: kierunek.y / dlugosc };

  let biezacy = { ...nowy };
  for (let krok = 0; krok < maksKrokow; krok++) {
    const kolizja = sasiedzi.find((s) => zachodzi(biezacy, s));
    if (!kolizja) break;

    // Ile brakuje do styku, liczone WZDŁUŻ kierunku: sama różnica promieni nie
    // wystarcza, bo sąsiad bywa odsunięty także w poprzek i wtedy przesunięcie
    // wzdłuż ściany musi być krótsze niż suma promieni.
    const dx = biezacy.x - kolizja.x;
    const dy = biezacy.y - kolizja.y;
    const wzdluz = dx * k.x + dy * k.y;
    const wPoprzek = Math.hypot(dx - wzdluz * k.x, dy - wzdluz * k.y);
    const suma = biezacy.r + kolizja.r;
    const potrzebneWzdluz = Math.sqrt(Math.max(0, suma * suma - wPoprzek * wPoprzek));

    const strona = wzdluz >= 0 ? 1 : -1;
    const przesuniecie = strona * potrzebneWzdluz - wzdluz;
    biezacy = { ...biezacy, x: biezacy.x + k.x * przesuniecie, y: biezacy.y + k.y * przesuniecie };
  }
  return { x: biezacy.x, y: biezacy.y };
}
