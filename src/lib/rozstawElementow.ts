import type { ElementType, InstallationElement, Opening, Point } from "@/types";
import { fixtureSizeM, SANITARY_FIXTURES } from "./elements";
import { glyphBoxSize } from "./glyphs";
import { MANUAL_DRAW_SCALE_MPU } from "./design";

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

/**
 * Symbol elementu jako PUDEŁKO w jednostkach planu.
 *
 * Wyjęte z `DesignTab`, bo to geometria, a nie stan komponentu — i dopóki tam siedziało,
 * dało się je sprawdzić wyłącznie klikając po planie w przeglądarce.
 */
export function pudelkoSymbolu(e: InstallationElement, skalaSymboli: number): ZajetySymbol {
  const { w, h } = glyphBoxSize(e.type, fixtureSizeM(e) ?? undefined);
  return {
    x: e.x,
    y: e.y,
    polSzer: (w / 2) * skalaSymboli,
    polWys: (h / 2) * skalaSymboli,
    obrot: e.rotation ?? 0,
  };
}

/**
 * Rozsuwanie dotyczy OSPRZĘTU, nie przyborów sanitarnych.
 *
 * Wanna, brodzik czy umywalka to wyposażenie pomieszczenia, a nie urządzenie instalacji:
 * gniazdo stojące „na" wannie nie jest pomyłką do poprawienia, tylko sytuacją, o której
 * ma się wypowiedzieć sprawdzenie stref ochronnych. Odpychanie gniazda od wanny kasowało
 * dokładnie ten przypadek — złapały to testy sprawdzenia rzutu: gniazdo celowo wsunięte
 * w strefę 1 wyskakiwało z niej samo i zgłoszenie zmieniało się z błędu na uwagę
 * o strefie 2.
 *
 * Przybory nie rozsuwają się też między sobą: ustawienie wanny obok umywalki to rysunek
 * pomieszczenia, a nie rząd osprzętu na ścianie.
 */
export function rozsuwalny(e: { type: ElementType }): boolean {
  return !SANITARY_FIXTURES[e.type];
}

/**
 * Pozycja elementu po odsunięciu od tych, które już stoją obok.
 *
 * Tylko przy STAWIANIU i przeciąganiu POJEDYNCZEGO elementu, nie przy przeciąganiu
 * grupy — tam odstępy właśnie ustawione wyrównaniem mają zostać nietknięte.
 *
 * `pomijanyId` przy przeciąganiu wskazuje SAM przesuwany element: liczony jako sąsiad
 * zderzałby się ze swoją własną nową pozycją i odpychał się w nieskończoność.
 */
export function bezNakladaniaNaSasiadow(
  kandydat: InstallationElement,
  wszystkie: InstallationElement[],
  skalaSymboli: number,
  metrowNaJednostke: number | null,
  pomijanyId?: string
): Point {
  if (!rozsuwalny(kandydat)) return { x: kandydat.x, y: kandydat.y };
  const mpu = metrowNaJednostke && metrowNaJednostke > 0 ? metrowNaJednostke : MANUAL_DRAW_SCALE_MPU;
  return odsunOdSasiadow(
    pudelkoSymbolu(kandydat, skalaSymboli),
    wszystkie.filter((e) => e.id !== pomijanyId && rozsuwalny(e)).map((e) => pudelkoSymbolu(e, skalaSymboli)),
    kandydat.rotation ?? 0,
    ODSTEP_SYMBOLI_M / mpu
  );
}

/** Prostokąt osiowy w jednostkach planu. */
export interface Prostokat {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Prostokąt osiowy zajmowany przez symbol NA RYSUNKU — z uwzględnieniem obrotu.
 *
 * Gniazdo przy pionowej ścianie stoi obrócone o 90°, więc jego pudełko ma w poziomie
 * wysokość, a nie szerokość symbolu. `rogiSymbolu` bierze tu okrąg opisany (kadr ma
 * nie obcinać niczego), ale do omijania symboli podpisem jest on za szeroki: w małym
 * pokoju nie zostawiłby na nazwę ani skrawka.
 */
export function prostokatSymbolu(e: InstallationElement, skalaSymboli: number): Prostokat {
  const s = pudelkoSymbolu(e, skalaSymboli);
  const kat = (s.obrot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(kat));
  const sin = Math.abs(Math.sin(kat));
  const polX = cos * s.polSzer + sin * s.polWys;
  const polY = sin * s.polSzer + cos * s.polWys;
  return { x1: s.x - polX, y1: s.y - polY, x2: s.x + polX, y2: s.y + polY };
}

/**
 * Prostokąt osiowy zajmowany przez OTWÓR na rysunku — dla drzwi razem z łukiem skrzydła.
 *
 * Ta sama geometria co glif w `DesignCanvas`: zawias na jednym końcu otworu (drugim przy
 * `lustro`), skrzydło zamiata ćwierć koła o promieniu szerokości otworu, od położenia
 * zamkniętego (wzdłuż ściany) do otwartego (`perp`). Łuk próbkowany co 10° — prostokąt
 * ma powiedzieć, gdzie NIE stawiać napisu, a nie trafić co do ułamka jednostki.
 *
 * Zgrubne „± szerokość w każdą stronę" zajmowało w przedpokoju z czterema drzwiami
 * niemal cały pokój i nazwa nie miała gdzie stanąć.
 */
export function prostokatOtworu(o: Opening, gruboscSciany: number): Prostokat {
  const halfW = o.width / 2;
  const kat = o.angle + (o.flip ? Math.PI : 0);
  const dir = { x: Math.cos(kat), y: Math.sin(kat) };
  const perp = { x: -dir.y, y: dir.x };
  const edge1 = { x: o.x - dir.x * halfW, y: o.y - dir.y * halfW };
  const edge2 = { x: o.x + dir.x * halfW, y: o.y + dir.y * halfW };
  // Sam otwór w murze — pas szerokości otworu na grubość ściany.
  const punkty: Point[] = [edge1, edge2].flatMap((p) => [
    { x: p.x + (perp.x * gruboscSciany) / 2, y: p.y + (perp.y * gruboscSciany) / 2 },
    { x: p.x - (perp.x * gruboscSciany) / 2, y: p.y - (perp.y * gruboscSciany) / 2 },
  ]);
  if (o.kind === "drzwi") {
    const zawias = o.lustro ? edge2 : edge1;
    // Położenie zamknięte: od zawiasu w stronę drugiego końca otworu.
    const zamkniete = o.lustro ? { x: -dir.x, y: -dir.y } : dir;
    for (let st = 0; st <= 90; st += 10) {
      const a = (st * Math.PI) / 180;
      const kier = {
        x: zamkniete.x * Math.cos(a) + perp.x * Math.sin(a),
        y: zamkniete.y * Math.cos(a) + perp.y * Math.sin(a),
      };
      punkty.push({ x: zawias.x + kier.x * o.width, y: zawias.y + kier.y * o.width });
    }
  }
  const xs = punkty.map((p) => p.x);
  const ys = punkty.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
