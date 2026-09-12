import type { ElementType, InstallationElement, Point, RoomShape, Wall } from "@/types";
import { nearestPointOnPolyline, pointInPolygon } from "@/lib/geometry";
import { montazPrzyscienny, zasiegPrzyscienny } from "@/lib/glyphs";

/**
 * Przyklejanie osprzętu do ściany, z obrotem symbolu prostopadle do niej.
 *
 * Powód: gniazdko postawione przy skośnej albo pionowej ścianie stało w domyślnej
 * orientacji i trzeba je było obracać ręcznie klawiszem R. Przy kilkudziesięciu
 * elementach to kilkadziesiąt dodatkowych ruchów — a że prawie nikt ich nie wykonuje,
 * rzuty wychodziły z symbolami zwróconymi byle jak.
 *
 * Co jest tu trudne: nie sam obrót o 90°, tylko KTÓRA ze stron. Symbol gniazda ma
 * trzonek (patrz `SocketArcKonva`) — w rysunku instalacyjnym trzonek wchodzi w ścianę,
 * a łuk patrzy w pomieszczenie. Obrót w złą stronę wygląda dokładnie tak samo źle jak
 * brak obrotu, więc strona jest wybierana świadomie: trzonek ma być odwrócony od
 * ŚRODKA pomieszczenia, w którym element stoi.
 */

/**
 * Typy montowane pod stropem albo stojące wolno — te NIE przyklejają się do ściany.
 *
 * Punkt sufitowy i czujnik dymu wiszą na środku pomieszczenia; przyklejenie ich do
 * najbliższej ściany byłoby aktywnym psuciem rysunku. Przybory sanitarne to nie
 * osprzęt, tylko punkt odniesienia dla stref — ich pozycję ustawia się względem
 * rzeczywistego wyposażenia łazienki, nie względem linii ściany.
 */
const NIE_PRZYSCIENNE: readonly ElementType[] = ["oswietlenie", "czujnikDymu", "wanna", "prysznic", "umywalka"];

export function przyscienny(type: ElementType): boolean {
  return !NIE_PRZYSCIENNE.includes(type);
}

/**
 * Punkt, którym symbol DOTYKA ściany — koniec trzonka gniazda, koło łącznika, plecy
 * kinkietu. Operacja odwrotna do odsunięcia z `snapElementToWall`: tam od punktu na
 * ścianie odejmujemy zasięg, żeby dostać środek symbolu, tu do środka dodajemy go
 * z powrotem.
 *
 * Potrzebne trasom przewodów: przewód dochodzi do osprzętu od strony muru (tam siedzi
 * puszka), a nie do jego środka narysowanego w pomieszczeniu — patrz `zakonczPrzyNozce`.
 *
 * Zwraca `null` dla typów, które nie stoją przy ścianie (punkt sufitowy, czujnik dymu,
 * przybory) — one nie mają „strony przyściennej", więc pytanie o nią nie ma sensu.
 * Element nieprzyklejony do niczego ma obrót 0 i dostaje kierunek własnego trzonka —
 * czyli dokładnie tam, gdzie trzonek widać na rysunku.
 */
export function punktPrzyscienny(
  el: { type: ElementType; x: number; y: number; rotation?: number },
  skala: number
): Point | null {
  if (!przyscienny(el.type)) return null;
  const k = kierunekWSciane(el);
  const zasieg = zasiegPrzyscienny(el.type) * skala;
  return { x: el.x + k.x * zasieg, y: el.y + k.y * zasieg };
}

/** Wektor jednostkowy od środka symbolu W ŚCIANĘ — kierunek trzonka gniazda, dźwigni
 *  łącznika, pleców kinkietu. Obrót glifu BEZ korekty montażowej, czyli ten sam kąt,
 *  który `snapElementToWall` dostaje od ściany: przy nim lokalne (0, −1) idzie na
 *  (sin θ, −cos θ). */
function kierunekWSciane(el: { type: ElementType; rotation?: number }): Point {
  const rad = (((el.rotation ?? 0) - montazPrzyscienny(el.type)) * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

export interface WynikPrzyciagania {
  x: number;
  y: number;
  /** Obrót symbolu w stopniach, prostopadle do ściany. */
  rotation: number;
}

/** Zamknięty obrys pomieszczenia jako łamana — ostatni punkt wraca do pierwszego. */
function zamknietyObrys(r: RoomShape): Point[] {
  return r.points.length > 0 ? [...r.points, r.points[0]] : [];
}

/** Środek ciężkości obrysu — punkt odniesienia dla „która strona jest wnętrzem". */
function srodek(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/**
 * Obrót, przy którym trzonek symbolu patrzy w stronę `kierunek`.
 *
 * Przy obrocie 0 trzonek wskazuje w górę, czyli wektor (0, −1) — patrz `SocketArcKonva`.
 * Obrót o θ (zgodnie z ruchem wskazówek zegara, bo oś Y rośnie w dół) przenosi go na
 * (sin θ, −cos θ), stąd θ = atan2(dx, −dy).
 */
function obrotDlaKierunku(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}


/**
 * Przykleja punkt do najbliższej ściany albo krawędzi pomieszczenia i zwraca obrót
 * prostopadły do niej. `null`, gdy nic nie ma w zasięgu — wtedy element zostaje tam,
 * gdzie go postawiono.
 *
 * Krawędzie pomieszczeń liczą się na równi ze ścianami, bo plan narysowany samymi
 * obrysami pokoi jest w tej aplikacji pełnoprawny (patrz `onRoomEdgeClickForOpening`) —
 * bez tego przyciąganie nie działałoby na połowie projektów.
 */
export function snapToWall(
  p: Point,
  walls: Wall[],
  roomShapes: RoomShape[],
  toleranceUnits: number
): WynikPrzyciagania | null {
  let najlepszy: { point: Point; angle: number; dist: number; pokoj: RoomShape | null } | null = null;

  const rozwaz = (linia: Point[], pokoj: RoomShape | null) => {
    const n = nearestPointOnPolyline(p, linia);
    if (!n) return;
    const dist = Math.hypot(p.x - n.point.x, p.y - n.point.y);
    if (dist <= toleranceUnits && (!najlepszy || dist < najlepszy.dist)) {
      najlepszy = { point: n.point, angle: n.angle, dist, pokoj };
    }
  };

  for (const w of walls) rozwaz(w.points, null);
  for (const r of roomShapes) rozwaz(zamknietyObrys(r), r);
  if (!najlepszy) return null;
  const trafienie: { point: Point; angle: number; dist: number; pokoj: RoomShape | null } = najlepszy;

  /**
   * Dwie NORMALNE do ściany — kandydaci na kierunek trzonka. Liczone jako wektory,
   * nie jako kąty: wybór między nimi sprowadza się wtedy do iloczynu skalarnego
   * i znika cała arytmetyka zawijania kątów, w której łatwo o błąd znaku.
   */
  const kierunek = { x: Math.cos(trafienie.angle), y: Math.sin(trafienie.angle) };
  const n1 = { x: -kierunek.y, y: kierunek.x };
  const n2 = { x: kierunek.y, y: -kierunek.x };

  /**
   * Wybór strony: trzonek ma być odwrócony od WNĘTRZA pomieszczenia.
   *
   * Pomieszczenie ustalamy w dwóch krokach i drugi z nich jest tu kluczowy. Sam
   * `pointInPolygon` nie wystarcza, bo celując w ścianę bardzo łatwo przestrzelić
   * o kilka jednostek NA ZEWNĄTRZ obrysu — a wtedy punkt nie leży w żadnym pokoju
   * i trzonek szedł w stronę wybraną na chybił trafił, czyli w połowie przypadków
   * w głąb pomieszczenia. Wyłapane dopiero przy klikaniu w aplikacji, bo w testach
   * jednostkowych trafia się w „równe" współrzędne.
   *
   * Gdy więc punkt nie leży w żadnym obrysie, bierzemy pomieszczenie, do którego
   * należy DOPASOWANA KRAWĘDŹ — to ono jest wnętrzem, od którego trzonek ma uciekać.
   *
   * Zostaje przypadek ściany bez pomieszczenia (plan rysowany samymi ścianami): tam
   * żadnego „wnętrza" nie ma, więc pytamy, z której strony ściany użytkownik KLIKNĄŁ
   * — to ta strona jest dla niego wnętrzem. Wcześniej padała tu po prostu pierwsza
   * normalna, czyli w połowie przypadków zła: symbol był prostopadły, ale odwrócony
   * tyłem. Odkąd `snapElementToWall` odsuwa symbol od ściany, ta sama pomyłka
   * wyrzucałaby go jeszcze na zewnątrz budynku, więc zgadywanie przestało być
   * niegroźne.
   */
  const pokoj = roomShapes.find((r) => pointInPolygon(p, r.points)) ?? trafienie.pokoj;
  const odWnetrza = pokoj
    ? (() => {
        const c = srodek(pokoj.points);
        return { x: trafienie.point.x - c.x, y: trafienie.point.y - c.y };
      })()
    : { x: trafienie.point.x - p.x, y: trafienie.point.y - p.y };
  const dot = (n: Point) => n.x * odWnetrza.x + n.y * odWnetrza.y;
  // Remis (klik dokładnie na linii ściany, bez pomieszczenia) rozstrzyga `n1` — tak
  // jak dotąd, bo nie ma wtedy żadnej przesłanki, która strona jest wnętrzem.
  const wybrana = dot(n1) >= dot(n2) ? n1 : n2;

  const rotation = obrotDlaKierunku(wybrana.x, wybrana.y);
  return { x: trafienie.point.x, y: trafienie.point.y, rotation: ((rotation % 360) + 360) % 360 };
}

/**
 * Pozycja i obrót KONKRETNEGO symbolu przyklejonego do ściany.
 *
 * `snapToWall` odpowiada tylko na pytanie „gdzie jest ściana i w którą stronę jej
 * zewnętrze" — i przez to stawiało ŚRODEK symbolu na linii ściany. Gniazdko wychodziło
 * wtedy trzonkiem na zewnątrz budynku, łącznik siedział na murze okrakiem, a plakietka
 * RJ45 była przecięta linią ściany na pół. Urządzenie jest montowane W ścianie, więc
 * symbol ma stać po stronie pomieszczenia i DOTYKAĆ jej tym, czym w nią wchodzi:
 * gniazdko końcem trzonka, łącznik dźwignią, plakietka krawędzią (`zasiegPrzyscienny`).
 *
 * `skala` to skala renderu symboli (`elementRenderScale`) — zasięg jest podany w
 * jednostkach glifu, a pozycja elementu żyje w jednostkach planu. Bez tego mnożenia
 * odsunięcie rozjeżdżałoby się z rysunkiem przy każdej zmianie skali rzutu i suwaka
 * rozmiaru symboli.
 */
export function snapElementToWall(
  p: Point,
  walls: Wall[],
  roomShapes: RoomShape[],
  toleranceUnits: number,
  type: ElementType,
  skala: number
): WynikPrzyciagania | null {
  const kotwica = zasiegPrzyscienny(type) * skala;
  /**
   * Tolerancja liczona od KRAWĘDZI symbolu, nie od jego środka — dlatego poszerzona
   * o zasięg. Bez tego element raz przyklejony przestawał się przyklejać: po
   * odsunięciu środka o zasięg leżał już dalej niż tolerancja, więc przeciągnięcie go
   * wzdłuż tej samej ściany po cichu odczepiało go od niej i zostawiało krzywo.
   */
  const trafienie = snapToWall(p, walls, roomShapes, toleranceUnits + kotwica);
  if (!trafienie) return null;

  // Kierunek „w ścianę" odtworzony z obrotu: przy obrocie θ lokalne (0, −1) idzie
  // na (sin θ, −cos θ) — to ta sama zależność, którą zapisuje `obrotDlaKierunku`.
  const rad = (trafienie.rotation * Math.PI) / 180;
  const wSciane = { x: Math.sin(rad), y: -Math.cos(rad) };
  return {
    x: trafienie.x - wSciane.x * kotwica,
    y: trafienie.y - wSciane.y * kotwica,
    rotation: (trafienie.rotation + montazPrzyscienny(type) + 360) % 360,
  };
}

/** Jak blisko ściany musi wypaść odtworzony punkt dotknięcia, żeby uznać element za
 *  PRZYKLEJONY. Pozycja zapisana przez `snapElementToWall` trafia w linię ściany co do
 *  błędu zaokrąglenia, więc próg może być ciasny — i ma być, bo wszystko poza nim to
 *  element postawiony swobodnie, którego nie wolno ruszać. */
const PROG_PRZYKLEJENIA = 1;

/**
 * Przesuwa osprzęt PRZYKLEJONY DO ŚCIAN tak, żeby po zmianie skali symboli nadal jej
 * dotykał.
 *
 * Problem: `snapElementToWall` zapisuje POZYCJĘ odsuniętą od ściany o `zasiegPrzyscienny`
 * razy skala renderu — czyli o tyle, ile wtedy mierzył symbol. Skala potrafi się później
 * zmienić (kalibracja rzutu, suwak rozmiaru, rozpoznana wielkość rysunku), a zapisana
 * pozycja zostaje. Symbol rośnie wtedy wokół starej kotwicy i trzonek gniazdka wchodzi
 * w mur albo wisi w powietrzu — zależnie od kierunku zmiany.
 *
 * Poprawka jest ODTWORZENIEM, nie zgadywaniem: `punktPrzyscienny` liczy z pozycji,
 * obrotu i STAREJ skali punkt, którym symbol dotykał ściany, a nowa pozycja to ten sam
 * punkt cofnięty o zasięg w nowej skali. Element nie wędruje więc wzdłuż ściany ani nie
 * zmienia obrotu — zmienia się wyłącznie odsunięcie.
 *
 * Ruszane są TYLKO te elementy, których odtworzony punkt naprawdę leży na ścianie albo
 * obrysie pomieszczenia (`PROG_PRZYKLEJENIA`). Gniazdko postawione swobodnie na środku
 * pokoju — przy wyłączonym przyciąganiu albo odciągnięte od muru ręcznie — zostaje
 * dokładnie tam, gdzie je postawiono.
 *
 * Zwraca tę samą tablicę, gdy nic się nie zmienia: wynik idzie prosto do stanu, a nowa
 * tożsamość przy każdej zmianie skali przeliczałaby na nowo wszystko, co od elementów
 * zależy (trasy, obwody, kadr do PDF-a).
 */
export function przeliczPrzyscienneDoSkali<T extends InstallationElement>(
  elements: T[],
  walls: Wall[],
  roomShapes: RoomShape[],
  staraSkala: number,
  nowaSkala: number
): T[] {
  if (!(staraSkala > 0) || !(nowaSkala > 0) || staraSkala === nowaSkala) return elements;

  let zmienione = false;
  const next = elements.map((el) => {
    const naScianie = punktPrzyscienny(el, staraSkala);
    if (!naScianie) return el;
    if (!snapToWall(naScianie, walls, roomShapes, PROG_PRZYKLEJENIA)) return el;

    // Ten sam punkt na ścianie, cofnięty o zasięg w NOWEJ skali — czyli dokładnie to,
    // co zrobiłby `snapElementToWall`, gdyby element stawiać dzisiaj.
    const k = kierunekWSciane(el);
    const zasieg = zasiegPrzyscienny(el.type) * nowaSkala;
    const x = naScianie.x - k.x * zasieg;
    const y = naScianie.y - k.y * zasieg;
    if (x === el.x && y === el.y) return el;
    zmienione = true;
    return { ...el, x, y };
  });
  return zmienione ? next : elements;
}
