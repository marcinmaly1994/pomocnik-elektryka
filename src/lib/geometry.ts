import type { Point } from "@/types";

/** Zaokrągla współrzędną do najbliższej linii siatki — przyciąganie przy rysowaniu/przeciąganiu. */
export function snap(v: number, grid = 20): number {
  return Math.round(v / grid) * grid;
}

export function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Pole wielokąta wzorem Gaussa (sznurowadła), w jednostkach planu do kwadratu.
 *
 * Zwraca wartość BEZWZGLĘDNĄ, bo obrys narysowany „w lewo" ma ujemną orientację,
 * a użytkownika nie interesuje kierunek klikania — tylko ile metrów ma pokój.
 */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(sum) / 2;
}

/** Pole w metrach kwadratowych. `metersPerUnit` skaluje się KWADRATOWO — to
 *  najczęstszy błąd przy przeliczaniu powierzchni, więc siedzi w jednym miejscu. */
export function polygonAreaM2(points: Point[], metersPerUnit: number | null): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return null;
  return polygonArea(points) * metersPerUnit * metersPerUnit;
}

/**
 * Najbliższy punkt na ŁAMANEJ (np. ścianie) do danego punktu, wraz z kierunkiem
 * segmentu w tym miejscu (radiany) — do „przyklejania" otworu (drzwi/okna) do
 * ściany, w którą kliknięto: sam klik rzadko trafia idealnie na linię, więc
 * otwór ma stanąć na NAJBLIŻSZYM miejscu ściany, nie dokładnie pod kursorem.
 */
export function nearestPointOnPolyline(pt: Point, points: Point[]): { point: Point; angle: number } | null {
  let best: { point: Point; angle: number; distSq: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = clampNum(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq, 0, 1);
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distSq = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    if (!best || distSq < best.distSq) best = { point: { x: px, y: py }, angle: Math.atan2(dy, dx), distSq };
  }
  return best ? { point: best.point, angle: best.angle } : null;
}

/** Algorytm ray-casting: czy punkt leży wewnątrz wielokąta (używane do wykrycia,
 *  w którym narysowanym pomieszczeniu wylądował nowo postawiony element). */
export function pointInPolygon(pt: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Punkt leży WEWNĄTRZ wielokąta dalej niż `tol` od jego obrysu (punkt na obrysie
 *  albo tuż przy nim się nie liczy). */
function scisleWewnatrz(p: Point, poly: Point[], tol: number): boolean {
  if (!pointInPolygon(p, poly)) return false;
  const n = nearestPointOnPolyline(p, [...poly, poly[0]]);
  return !n || Math.hypot(p.x - n.point.x, p.y - n.point.y) > tol;
}

/** Odcinki ab i cd przecinają się WEWNĄTRZ obu (nie końcem, nie wzdłuż wspólnej linii). */
function przecinajaSieWewnatrz(a: Point, b: Point, c: Point, d: Point, tol: number): boolean {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const mian = rx * sy - ry * sx;
  const dlR = Math.hypot(rx, ry), dlS = Math.hypot(sx, sy);
  if (dlR === 0 || dlS === 0 || Math.abs(mian) < 1e-9 * dlR * dlS) return false; // równoległe
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / mian;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / mian;
  const mt = tol / dlR, mu = tol / dlS;
  return t > mt && t < 1 - mt && u > mu && u < 1 - mu;
}

/** Czy jakiś kawałek krawędzi `poly` (podzielonej w punktach styku z `inny`) leży ściśle
 *  wewnątrz `inny`. */
function kawalekKrawedziWewnatrz(poly: Point[], inny: Point[], tol: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dx = q.x - p.x, dy = q.y - p.y;
    const dl2 = dx * dx + dy * dy;
    if (dl2 === 0) continue;
    const ts = [0, 1];
    for (let j = 0; j < inny.length; j++) {
      const c = inny[j], d = inny[(j + 1) % inny.length];
      // Wierzchołek drugiego obrysu leżący na krawędzi — rzut na nią.
      const t = ((c.x - p.x) * dx + (c.y - p.y) * dy) / dl2;
      if (t > 0 && t < 1 && Math.hypot(p.x + t * dx - c.x, p.y + t * dy - c.y) <= tol) ts.push(t);
      // Przecięcie z krawędzią drugiego obrysu.
      const sx = d.x - c.x, sy = d.y - c.y;
      const mian = dx * sy - dy * sx;
      if (Math.abs(mian) < 1e-12) continue;
      const tt = ((c.x - p.x) * sy - (c.y - p.y) * sx) / mian;
      const uu = ((c.x - p.x) * dy - (c.y - p.y) * dx) / mian;
      if (tt > 0 && tt < 1 && uu >= 0 && uu <= 1) ts.push(tt);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const m = (ts[k] + ts[k + 1]) / 2;
      if (scisleWewnatrz({ x: p.x + m * dx, y: p.y + m * dy }, inny, tol)) return true;
    }
  }
  return false;
}

/**
 * Czy dwa obrysy (pomieszczeń) ZACHODZĄ na siebie — mają wspólne wnętrze.
 *
 * Wspólna ściana sąsiednich pokoi, styk narożnikiem albo fragmentem ściany to NIE jest
 * zachodzenie: tak rysuje się każde mieszkanie. `tol` (jednostki planu) połyka szum
 * przyciągania — obrys przesunięty o ułamek jednostki nad sąsiada to nie drugi pokój.
 *
 * Trzy sprawdzenia, bo każde łapie inny układ: narożnik jednego ściśle w drugim
 * (częściowe zachodzenie, pokój w pokoju), krawędzie przecinające się w środku
 * (krzyż — żaden narożnik nie jest w środku drugiego) i środek ciężkości narożników
 * ściśle w obu (ten sam obrys dwa razy albo połowa pokoju obrysowana drugi raz —
 * tam wszystkie narożniki i krawędzie leżą NA obrysie drugiego).
 *
 * Audyt 5.11.2026 (B8): zachodzące obrysy przechodziły „Sprawdzenie rzutu" bez
 * słowa, a powierzchnia w pasku stanu liczyła część wspólną dwa razy.
 */
export function obrysyNachodza(a: Point[], b: Point[], tol = 1): boolean {
  if (a.length < 3 || b.length < 3) return false;
  if (a.some((p) => scisleWewnatrz(p, b, tol)) || b.some((p) => scisleWewnatrz(p, a, tol))) return true;
  // Kawałki krawędzi: krawędź dzielona w miejscach, gdzie dotyka drugiego obrysu, i środek
  // każdego kawałka sprawdzany ściśle w drugim. Łapie pasy na wspólnych liniach — dwa
  // prostokąty o tych samych górnych i dolnych ścianach zachodzące bokiem: żaden narożnik
  // nie jest wtedy w środku drugiego, a krawędzie stykają się tylko końcami.
  if (kawalekKrawedziWewnatrz(a, b, tol) || kawalekKrawedziWewnatrz(b, a, tol)) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (przecinajaSieWewnatrz(a1, a2, b[j], b[(j + 1) % b.length], tol)) return true;
    }
  }
  const srodek = (poly: Point[]) => ({
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  });
  const sa = srodek(a), sb = srodek(b);
  return (
    (scisleWewnatrz(sa, a, tol) && scisleWewnatrz(sa, b, tol)) ||
    (scisleWewnatrz(sb, b, tol) && scisleWewnatrz(sb, a, tol))
  );
}

/**
 * Odległość punktu od PROSTOKĄTA obróconego o `rotationDeg` (środek w `cx`/`cy`).
 * `0`, gdy punkt leży wewnątrz prostokąta.
 *
 * Potrzebne do stref ochronnych: norma mierzy je od KRAWĘDZI wanny czy brodzika, a nie
 * od punktu w jej środku (patrz `SANITARY_FIXTURES`). Zbiór punktów w zadanej odległości
 * od prostokąta to prostokąt o zaokrąglonych narożnikach — dlatego strefa 2 rysuje się
 * jako `Rect` z `cornerRadius` równym jej zasięgowi, a nie jako okrąg.
 *
 * Liczone w układzie WŁASNYM prostokąta: obracamy punkt o `-rotationDeg`, dzięki czemu
 * dalej wystarczy porównanie z połową boków.
 */
export function distanceToRect(
  p: Point,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotationDeg = 0
): number {
  const a = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const ox = Math.max(Math.abs(lx) - w / 2, 0);
  const oy = Math.max(Math.abs(ly) - h / 2, 0);
  return Math.hypot(ox, oy);
}

/**
 * Wymiary obrysu [m], jeśli jest PROSTOKĄTEM równoległym do osi — inaczej `null`.
 *
 * Prostokątność sprawdzamy naprawdę (cztery wierzchołki, dwie różne wartości X i dwie
 * Y), a nie po samej liczbie punktów: dla litery L czy wykusza wymiary wzięte z obrysu
 * opisywałyby prostokąt, którego na rysunku nie ma — a podpis, który kłamie, jest
 * gorszy od braku podpisu. Tam zostaje sama powierzchnia, prawdziwa dla każdego
 * kształtu (patrz `polygonAreaM2`).
 *
 * Porównanie po zaokrągleniu do 1/1000 jednostki, bo narożniki bywają wynikiem
 * przeciągania myszą i różnią się o wartości niewidoczne na rysunku.
 */
export function rectangleSizeM(points: Point[], metersPerUnit: number | null): { w: number; h: number } | null {
  if (metersPerUnit === null || !(metersPerUnit > 0) || points.length !== 4) return null;
  const xs = [...new Set(points.map((p) => Math.round(p.x * 1000)))];
  const ys = [...new Set(points.map((p) => Math.round(p.y * 1000)))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  return {
    w: (Math.abs(xs[1] - xs[0]) / 1000) * metersPerUnit,
    h: (Math.abs(ys[1] - ys[0]) / 1000) * metersPerUnit,
  };
}

/**
 * Punkt leżący NA PEWNO wewnątrz wielokąta — albo `null`, gdy figura wnętrza nie ma
 * (mniej niż 3 wierzchołki, zerowa wysokość, same punkty współliniowe).
 *
 * Po co osobna funkcja, skoro jest środek ciężkości: dla figury WKLĘSŁEJ ani średnia
 * wierzchołków, ani środek ciężkości nie muszą leżeć w środku. Obrys w kształcie
 * litery U ma je w samym wcięciu, czyli poza sobą — a wtedy `pointInPolygon` odpowiada
 * „nie", choć pytanie dotyczyło TEJ WŁAŚNIE figury. Mieszkania w kształcie L i U są
 * na rzutach regułą, nie przypadkiem brzegowym.
 *
 * Jak: prowadzimy poziomą linię przez wnętrze, zbieramy jej przecięcia z krawędziami
 * i bierzemy środek NAJSZERSZEGO odcinka między kolejną parą przecięć. Taki odcinek
 * w całości leży wewnątrz figury (to ta sama zasada, na której stoi `pointInPolygon`),
 * a wybór najszerszego trzyma wynik z dala od krawędzi.
 *
 * Kilka wysokości, nie jedna: linia poprowadzona dokładnie przez wierzchołek albo
 * wzdłuż poziomej krawędzi daje zdegenerowany przekrój (nieparzysta liczba przecięć
 * albo zero). Wtedy próbujemy innej wysokości, zamiast zwracać nieprawdę.
 */
export function punktWewnatrzWielokata(points: Point[]): Point | null {
  if (points.length < 3) return null;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (!(maxY > minY)) return null;

  for (const t of [0.5, 0.37, 0.63, 0.21, 0.79]) {
    const y = minY + (maxY - minY) * t;
    const przeciecia: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j];
      const b = points[i];
      // Ten sam warunek co w `pointInPolygon` — krawędź liczy się, gdy linia przechodzi
      // między jej końcami. Poziome krawędzie odpadają same (oba końce po tej samej
      // stronie), więc nie ma dzielenia przez zero.
      if (a.y > y === b.y > y) continue;
      przeciecia.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (przeciecia.length < 2 || przeciecia.length % 2 !== 0) continue;
    przeciecia.sort((p, q) => p - q);

    let najlepszy: Point | null = null;
    let najszerszy = 0;
    for (let i = 0; i + 1 < przeciecia.length; i += 2) {
      const szerokosc = przeciecia[i + 1] - przeciecia[i];
      if (szerokosc > najszerszy) {
        najszerszy = szerokosc;
        najlepszy = { x: (przeciecia[i] + przeciecia[i + 1]) / 2, y };
      }
    }
    if (najlepszy && najszerszy > 0) return najlepszy;
  }
  return null;
}

/**
 * Przesuwa KONIEC odcinka tak, żeby miał zadaną długość — z zachowaniem kierunku.
 *
 * Sedno wpisywania długości w trakcie rysowania: użytkownik klika z grubsza, a potem
 * podaje liczbę. Zmienia się wyłącznie odległość; kąt odcinka zostaje dokładnie taki,
 * jaki był, bo to on niesie intencję kliknięcia.
 *
 * Dwa wejścia, których interfejsem nie da się wywołać, a które i tak muszą być
 * obsłużone, bo pochodzą z pola tekstowego i z podwójnego kliknięcia w to samo miejsce:
 *  - odcinek zerowy — kierunku NIE MA z czego wyznaczyć. Zwracamy punkt bez zmian;
 *    dzielenie przez zero dałoby `NaN` i rozjechało cały rysunek, a wyjątek wywróciłby
 *    edytor w środku rysowania.
 *  - długość niedodatnia albo nieskończona — to nie jest odcinek. Też bez zmian,
 *    tak samo jak zachowuje się dziś pole grubości ściany przy bzdurnej wartości.
 *
 * `dlugosc` jest w JEDNOSTKACH PLANU, nie w metrach. Przeliczenie ze skali należy do
 * wywołującego — ta funkcja nie ma prawa wiedzieć, czy plan jest skalibrowany.
 */
export function przesunNaDlugosc(od: Point, doPunktu: Point, dlugosc: number): Point {
  if (!Number.isFinite(dlugosc) || dlugosc <= 0) return doPunktu;

  const dx = doPunktu.x - od.x;
  const dy = doPunktu.y - od.y;
  const obecna = Math.hypot(dx, dy);
  if (obecna === 0) return doPunktu;

  const k = dlugosc / obecna;
  return { x: od.x + dx * k, y: od.y + dy * k };
}

/**
 * Prostokątne pomieszczenie o PODANYCH wymiarach, zaczepione w klikniętym narożniku.
 *
 * Kotwicę stawia użytkownik kliknięciem, wymiary wpisuje z klawiatury — a tutaj
 * rozstrzyga się jedyna rzecz, której nie powiedział wprost: w którą stronę prostokąt
 * ma się rozwinąć.
 *
 * Zasada: w prawo i w dół, bo tak czyta się rysunki i tak leci wzrok. Jeśli w tę
 * stronę prostokąt wychodzi poza plan, ODBIJA SIĘ — osobno w każdej osi, więc pokój
 * przy prawej krawędzi rozwija się w lewo, ale nadal w dół.
 *
 * Gdy nie mieści się w ŻADNĄ stronę (jest po prostu większy od planu), powstaje mimo
 * to w prawo i w dół. Użytkownik poprosił o taki wymiar: plan da się powiększyć,
 * a po cichu przycięty pokój kłamałby o metrażu — czyli o liczbie, dla której cała
 * ta aplikacja istnieje.
 *
 * Wymiary są w JEDNOSTKACH PLANU. Przeliczenie ze skali należy do wywołującego.
 */
export function prostokatOdKotwicy(
  kotwica: Point,
  szerokosc: number,
  wysokosc: number,
  plan: { w: number; h: number },
): Point[] | null {
  const poprawny = (v: number) => Number.isFinite(v) && v > 0;
  if (!poprawny(szerokosc) || !poprawny(wysokosc)) return null;

  // `>` a nie `>=`: prostokąt kończący się dokładnie na krawędzi planu jeszcze się
  // mieści i nie ma powodu go odbijać.
  const x1 = kotwica.x + szerokosc > plan.w && kotwica.x - szerokosc >= 0 ? kotwica.x - szerokosc : kotwica.x + szerokosc;
  const y1 = kotwica.y + wysokosc > plan.h && kotwica.y - wysokosc >= 0 ? kotwica.y - wysokosc : kotwica.y + wysokosc;

  const xMin = Math.min(kotwica.x, x1);
  const xMax = Math.max(kotwica.x, x1);
  const yMin = Math.min(kotwica.y, y1);
  const yMax = Math.max(kotwica.y, y1);

  // Kolejność narożników zgodna z ruchem wskazówek zegara, tak jak przy prostokącie
  // rysowanym myszą (`rogiProstokata`) — dalsze liczenie pola i obwodu
  // zakłada spójny obieg.
  return [
    { x: xMin, y: yMin },
    { x: xMax, y: yMin },
    { x: xMax, y: yMax },
    { x: xMin, y: yMax },
  ];
}

/** Prostokąt osiowy rysowany przeciągnięciem: narożnik `x`,`y` i wymiary, w jednostkach planu. */
export interface ProstokatRamki {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Prostokąt rozpięty między dwoma narożnikami — niezależnie od kierunku przeciągnięcia.
 *
 * Wspólny dla ramki zaznaczania i prostokąta pomieszczenia w DesignCanvas: wcześniej
 * ten sam wzór stał tam dwa razy (raz jako `rectBetween`, raz rozpisany w miejscu).
 */
export function prostokatMiedzy(a: Point, b: Point): ProstokatRamki {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * Cztery narożniki prostokąta jako obrys — zgodnie z ruchem wskazówek zegara, od lewego
 * górnego, jak w `prostokatOdKotwicy`. Z nich liczy się pole podglądu i powstaje obrys
 * pomieszczenia, więc obie drogi idą przez ten sam wielobok.
 */
export function rogiProstokata(r: ProstokatRamki): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}
