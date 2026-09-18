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
 *
 * Symbol jest tu PUDEŁKIEM, nie kołem. Koło opisane na pudełku (czyli połowa przekątnej,
 * patrz `rogiSymbolu`) jest właściwą miarą przy kadrowaniu wydruku, gdzie nie wiadomo,
 * jak element będzie obrócony — ale do rozsuwania daje odstęp o ~40% za duży, bo mierzy
 * po skosie coś, co stoi w rzędzie. Gniazda mają stać tuż obok siebie, jak w ramce.
 */

/**
 * Minimalny prześwit między symbolami [m].
 *
 * Pudełko glifu nie zna grubości kreski, którą symbol jest narysowany — zmierzone:
 * gniazdo ma pudełko 7,6 jedn., a rysuje się na 8,3. Bez tego zapasu obrysy dwóch
 * sąsiadów stykałyby się i zlewały w jedną plamę, czyli wracałby problem, dla którego
 * cały ten moduł powstał. Pięć centymetrów to tyle, ile widać na rysunku jako szczelinę,
 * i tyle, ile i tak dzieli dwie ramki osprzętu na ścianie.
 */
export const ODSTEP_SYMBOLI_M = 0.05;

/** Symbol jako PUDEŁKO: środek, połowy boków w jego własnych osiach i obrót. */
export interface ZajetySymbol {
  x: number;
  y: number;
  /** Połowa szerokości pudełka [jedn. planu] — wzdłuż własnej osi poziomej symbolu. */
  polSzer: number;
  /** Połowa wysokości pudełka [jedn. planu]. */
  polWys: number;
  /** Obrót symbolu [stopnie]. */
  obrot: number;
}

/**
 * Kierunek rozsuwania dla ściany, przy której stoi symbol obrócony o `rotation` stopni.
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

/**
 * Zasięg pudełka wzdłuż i w poprzek kierunku rozsuwania.
 *
 * Sąsiad bywa obrócony inaczej niż my (gniazdo na ścianie prostopadłej tuż za rogiem),
 * więc jego pudełko trzeba przeliczyć na NASZE osie — inaczej wyszłoby, że wysoki
 * symbol jest wąski tylko dlatego, że leży bokiem.
 */
function zasiegi(s: ZajetySymbol, obrotKierunku: number): { wzdluz: number; wPoprzek: number } {
  const d = ((s.obrot - obrotKierunku) * Math.PI) / 180;
  const c = Math.abs(Math.cos(d));
  const si = Math.abs(Math.sin(d));
  return {
    wzdluz: s.polSzer * c + s.polWys * si,
    wPoprzek: s.polSzer * si + s.polWys * c,
  };
}

/**
 * Przesuwa nowy element wzdłuż ściany, aż przestanie zachodzić na sąsiadów.
 *
 * Odstęp wychodzi MINIMALNY: przesunięcie kończy się na styku pudełek, powiększonym
 * o `odstep` — tyle, żeby obrysy się nie zlewały (pudełko nie zna grubości kreski, którą
 * symbol jest narysowany). Sąsiad odsunięty w poprzek (na innej wysokości montażu albo
 * przy drugiej ścianie) nie przeszkadza wcale: pudełka mijają się bokiem.
 *
 * Przesuwa NA TĘ STRONĘ, po której już jest względem sąsiada — dzięki temu gniazdo
 * kliknięte nieco na prawo od istniejącego ląduje po jego prawej, a nie przeskakuje na
 * drugą stronę. Przy kliknięciu dokładnie w środek sąsiada idzie w prawo/w dół, bo
 * jakąś decyzję podjąć trzeba.
 *
 * Pętla ma twardy limit kroków, bo każdy krok odsuwa od JEDNEGO sąsiada i może wejść na
 * kolejnego — przy rzędzie gniazd trzeba przejść wzdłuż całego rzędu.
 */
export function odsunOdSasiadow(
  nowy: ZajetySymbol,
  sasiedzi: ZajetySymbol[],
  obrotKierunku: number,
  odstep = 0,
  maksKrokow = 16
): Point {
  const k = kierunekWzdluzSciany(obrotKierunku);
  const mojZasieg = zasiegi(nowy, obrotKierunku);
  const zasiegiSasiadow = sasiedzi.map((s) => ({ s, z: zasiegi(s, obrotKierunku) }));

  let x = nowy.x;
  let y = nowy.y;
  for (let krok = 0; krok < maksKrokow; krok++) {
    const kolizja = zasiegiSasiadow.find(({ s, z }) => {
      const dx = x - s.x;
      const dy = y - s.y;
      const wzdluz = Math.abs(dx * k.x + dy * k.y);
      const wPoprzek = Math.abs(dx * -k.y + dy * k.x);
      return wzdluz < mojZasieg.wzdluz + z.wzdluz + odstep && wPoprzek < mojZasieg.wPoprzek + z.wPoprzek;
    });
    if (!kolizja) break;

    const dx = x - kolizja.s.x;
    const dy = y - kolizja.s.y;
    const wzdluz = dx * k.x + dy * k.y;
    const potrzebne = mojZasieg.wzdluz + kolizja.z.wzdluz + odstep;
    const strona = wzdluz >= 0 ? 1 : -1;
    const przesuniecie = strona * potrzebne - wzdluz;
    x += k.x * przesuniecie;
    y += k.y * przesuniecie;
  }
  return { x, y };
}
