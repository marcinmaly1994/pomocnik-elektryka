import type { ElementType, InstallationElement, Point } from "@/types";
import { ELEMENT_TYPES } from "./elements";

/**
 * Grupy sterowania oświetleniem — kojarzą łączniki z punktami świetlnymi, którymi
 * sterują. Numer grupy jest zarazem jej tożsamością: elementy z tym samym numerem
 * tworzą jedną grupę, i to jest cała reguła, którą użytkownik musi znać, żeby zmienić
 * przypisanie ręcznie (wpisuje numer, do którego chce dołączyć).
 *
 * Element może mieć WIĘCEJ niż jeden obwód — łącznik grupowy (świecznikowy) ma dwa
 * niezależne, więc dostaje dwa numery, po jednym na dźwignię. Dlatego wynik to tablica
 * numerów na element, indeksowana numerem obwodu; pozycja w tablicy odpowiada pozycji
 * etykiety na rysunku (`groupLabelAnchors`), więc dziury (`undefined`) są zachowywane,
 * a nie usuwane — inaczej numer drugiego obwodu trafiłby pod pierwszą dźwignię.
 *
 * Grupy liczone są osobno dla każdej kondygnacji i każdego pomieszczenia — łącznik nie
 * steruje światłem w innym pokoju, a już na pewno nie na innym piętrze.
 */

/** Łączniki mogące sterować oświetleniem. Termostat też ma rolę `control`, ale steruje
 *  ogrzewaniem, więc świadomie nie tworzy grupy świetlnej. */
export function isLightControl(e: InstallationElement): boolean {
  return ELEMENT_TYPES[e.type]?.role === "control" && e.type !== "termostat";
}

export function isLightPoint(e: InstallationElement): boolean {
  return ELEMENT_TYPES[e.type]?.role === "light";
}

/** Ile niezależnych obwodów ma element danego typu. Łącznik grupowy steruje dwoma
 *  odbiorami (po jednym na dźwignię), wszystko inne jednym. */
export function circuitCount(type: ElementType): number {
  return type === "wlacznikGrupowy" ? 2 : 1;
}

/** Ręczne numery elementu, znormalizowane do tablicy o długości równej liczbie obwodów.
 *  Toleruje zapis sprzed rozbicia na obwody (pojedyncza liczba), żeby projekty zapisane
 *  wcześniej nie traciły ustawionych ręcznie grup. */
export function manualGroups(e: InstallationElement): (number | null)[] {
  const raw = e.lightGroup as unknown;
  const arr = raw == null ? [] : Array.isArray(raw) ? raw : [raw as number];
  const out = new Array<number | null>(circuitCount(e.type)).fill(null);
  arr.forEach((n, i) => {
    if (i < out.length && typeof n === "number" && n > 0) out[i] = n;
  });
  return out;
}

/** Łączniki z definicji zwierane w jeden obwód: schodowy i krzyżowy służą do sterowania
 *  tym samym punktem z kilku miejsc, więc w obrębie pomieszczenia liczą się jako jedno
 *  źródło grupy, a nie jako konkurencyjne. */
const MULTIWAY = new Set(["wlacznikSchodowy", "wlacznikKrzyzowy"]);

/** Kąty dźwigni łącznika grupowego (te same co w `glyphs.ts`) — obwód 0 idzie w lewo,
 *  obwód 1 w prawo. Kolejność musi się zgadzać z kolejnością etykiet przy rysowaniu. */
const GROUP_SWITCH_ANGLES = [-135, -45];
/** O ile odsunąć punkt odniesienia obwodu w stronę jego dźwigni. Oba obwody łącznika
 *  grupowego siedzą w tym samym miejscu, więc bez tego odsunięcia nie dałoby się
 *  rozstrzygnąć, do którego z nich bliżej danej lampie. */
const GROUP_SWITCH_SPLIT = 50;

interface Seed {
  /** Element + numer jego obwodu, któremu przypisujemy numer grupy. */
  targets: { el: InstallationElement; circuit: number }[];
  anchors: Point[];
  /** Obwód łącznika grupowego dostaje numer nawet bez lampy — dwie dźwignie to dwa
   *  realne obwody i użytkownik ma je widzieć, także puste. */
  alwaysNumbered: boolean;
  circuit: number;
  room: string;
  /**
   * Numer wpisany RĘCZNIE przy łączniku tego seeda — wtedy cała grupa dostaje ten numer
   * zamiast kolejnego z automatu. `null`, gdy numeru nie ma i seed numeruje się sam.
   */
  reczny: number | null;
}

function distToAnchors(anchors: Point[], p: Point): number {
  return Math.min(...anchors.map((a) => Math.hypot(a.x - p.x, a.y - p.y)));
}

/** Klucz porządkujący grupy — po pomieszczeniu, potem po położeniu pierwszego łącznika,
 *  na końcu po numerze obwodu. Deterministyczny, żeby numery nie skakały przy każdym
 *  dorysowanym elemencie (użytkownik wpisuje je ręcznie, więc muszą być stabilne). */
function seedOrder(s: Seed): [string, number, number, number] {
  const xs = s.targets.map((t) => t.el.x);
  const ys = s.targets.map((t) => t.el.y);
  return [s.room, Math.min(...xs), Math.min(...ys), s.circuit];
}

export function computeLightGroups(elements: InstallationElement[]): Map<string, (number | undefined)[]> {
  const slots = new Map<string, (number | undefined)[]>();
  const put = (el: InstallationElement, circuit: number, n: number) => {
    const arr = slots.get(el.id) ?? new Array<number | undefined>(circuitCount(el.type)).fill(undefined);
    arr[circuit] = n;
    slots.set(el.id, arr);
  };

  // 1) Ręcznie ustawione numery — mają pierwszeństwo i wyłączają SWÓJ obwód z automatu
  //    (a nie cały element, dzięki czemu da się nadpisać jedną dźwignię łącznika
  //    grupowego, zostawiając drugą automatowi).
  const manualOf = new Map<string, (number | null)[]>();
  elements.forEach((e) => {
    const m = manualGroups(e);
    manualOf.set(e.id, m);
    m.forEach((n, i) => {
      if (n != null) put(e, i, n);
    });
  });
  const recznyNr = (e: InstallationElement, circuit: number) => manualOf.get(e.id)![circuit] ?? null;

  // Elementy bez rozpoznanego pomieszczenia (NO_ROOM) NIE są tu odsiewane — trafiają do
  // grupowania jako jeden wspólny „pokój" na kondygnację, po prostu z kluczem NO_ROOM.
  // Bez tego numeracja w ogóle nie działała, dopóki użytkownik nie narysował pomieszczeń
  // (albo dla elementów postawionych poza obrysem pokoju) — całkowita cisza była gorszym
  // wynikiem niż dopasowanie do najbliższego łącznika/lampy bez znajomości ścian.
  const byFloor = new Map<string, InstallationElement[]>();
  elements.forEach((e) => {
    const list = byFloor.get(e.floor) ?? [];
    list.push(e);
    byFloor.set(e.floor, list);
  });

  byFloor.forEach((floorElements) => {
    const byRoom = new Map<string, InstallationElement[]>();
    floorElements.forEach((e) => {
      const list = byRoom.get(e.room) ?? [];
      list.push(e);
      byRoom.set(e.room, list);
    });

    const seeds: Seed[] = [];
    const lightsBySeed = new Map<Seed, InstallationElement[]>();

    byRoom.forEach((roomElements, room) => {
      const controls = roomElements.filter(isLightControl);
      const lights = roomElements.filter(isLightPoint);
      if (controls.length === 0 || lights.length === 0) return;

      const roomSeeds: Seed[] = [];

      // Łączniki z ręcznym numerem BUDUJĄ seed tak samo jak pozostałe. Wcześniej były
      // z tego kroku odsiewane i skutek był odwrotny do zamierzonego: łącznik trzymał
      // swój numer, ale sterowane przez niego oprawy nie miały już do czego się
      // przyłączyć i zostawały bez grupy. Bez numeru grupy `findControllingSwitch`
      // zwraca `null`, więc rysunek przestawał prowadzić przewód przez łącznik i ciągnął
      // zasilanie wprost do oprawy — pokazując topologię, której w instalacji nie ma.
      // Ręczny numer ma przejmować NUMER grupy, nie rozrywać samą grupę.
      const multiway = controls.filter((c) => MULTIWAY.has(c.type));
      if (multiway.length) {
        roomSeeds.push({
          targets: multiway.map((el) => ({ el, circuit: 0 })),
          anchors: multiway.map((c) => ({ x: c.x, y: c.y })),
          alwaysNumbered: false,
          circuit: 0,
          room,
          reczny: multiway.map((c) => recznyNr(c, 0)).find((n) => n != null) ?? null,
        });
      }

      controls
        .filter((c) => !MULTIWAY.has(c.type))
        .forEach((c) => {
          if (c.type !== "wlacznikGrupowy") {
            roomSeeds.push({
              targets: [{ el: c, circuit: 0 }],
              anchors: [{ x: c.x, y: c.y }],
              alwaysNumbered: false,
              circuit: 0,
              room,
              reczny: recznyNr(c, 0),
            });
            return;
          }
          GROUP_SWITCH_ANGLES.forEach((deg, i) => {
            const a = (deg * Math.PI) / 180;
            roomSeeds.push({
              targets: [{ el: c, circuit: i }],
              anchors: [{ x: c.x + Math.cos(a) * GROUP_SWITCH_SPLIT, y: c.y + Math.sin(a) * GROUP_SWITCH_SPLIT }],
              alwaysNumbered: true,
              circuit: i,
              room,
              reczny: recznyNr(c, i),
            });
          });
        });

      if (roomSeeds.length === 0) return;

      // Oprawy z ręcznym numerem też przyłączają się do seeda: numer zachowują własny,
      // ale utrzymują grupę przy życiu i narzucają jej swój numer, gdy łącznik go nie ma.
      lights
        .forEach((light) => {
          const nearest = roomSeeds.reduce(
            (best, s) => (distToAnchors(s.anchors, light) < distToAnchors(best.anchors, light) ? s : best),
            roomSeeds[0]
          );
          lightsBySeed.set(nearest, [...(lightsBySeed.get(nearest) ?? []), light]);
        });

      seeds.push(...roomSeeds);
    });

    seeds
      .filter((s) => s.alwaysNumbered || (lightsBySeed.get(s) ?? []).length > 0)
      .sort((a, b) => {
        const [ar, ax, ay, ac] = seedOrder(a);
        const [br, bx, by, bc] = seedOrder(b);
        return ar.localeCompare(br, "pl") || ax - bx || ay - by || ac - bc;
      })
      .forEach((seed, i) => {
        // Numer grupy bierze się z ręcznego wpisu przy ŁĄCZNIKU, a w jego braku
        // z automatu. Oprawa z własnym numerem NIE narzuca go grupie — inaczej jedna
        // ręcznie odpięta lampa przenumerowałaby cały pokój (patrz test „ręczny numer
        // ma pierwszeństwo przed automatem"). Zachowuje swój numer i tyle.
        //
        // Automat numeruje po staremu, od 1 w kolejności seedów, i ŚWIADOMIE nie omija
        // numerów zajętych ręcznie: wpisanie numeru istniejącej grupy jest w tej
        // aplikacji sposobem, żeby do niej DOŁĄCZYĆ (patrz test „wpisanie cudzego numeru
        // scala elementy w jedną grupę"). Omijanie takich numerów odsuwałoby tamtą grupę
        // na inny numer i dołączenie stawałoby się niemożliwe.
        const n = seed.reczny ?? i + 1;
        // Wartości wpisanych ręcznie nie nadpisujemy nigdy.
        seed.targets.forEach((t) => { if (recznyNr(t.el, t.circuit) == null) put(t.el, t.circuit, n); });
        (lightsBySeed.get(seed) ?? []).forEach((l) => { if (recznyNr(l, 0) == null) put(l, 0, n); });
      });
  });

  // elementy, którym nie przypadł żaden numer, w ogóle nie trafiają do wyniku
  slots.forEach((arr, id) => {
    if (arr.every((n) => n === undefined)) slots.delete(id);
  });
  return slots;
}

/** Jedna etykieta numeru grupy czekająca na rozmieszczenie. */
export interface EtykietaDoRozmieszczenia {
  /** `${elementId}:${numerObwodu}` — klucz wyniku. */
  klucz: string;
  /** Pozycja elementu [jedn. planu]. */
  srodek: Point;
  /** Obrót elementu [stopnie] — kotwica jest w układzie LOKALNYM symbolu. */
  rotacja: number;
  /** Dopuszczalne kotwice lokalne, pierwsza jest domyślna. Jedna kotwica = etykieta
   *  przywiązana do konkretnej dźwigni i nie wolno jej przenosić. */
  kandydaci: Point[];
  /**
   * Skala symbolu, w którego grupie siedzi etykieta (`skalaSymbolu` przy rysowaniu).
   * Kotwica lokalna jest przez nią mnożona, zanim trafi na rysunek — bez tego
   * wykrywanie kolizji byłoby fikcją wszędzie poza rysunkiem odręcznym, bo przy rzucie
   * skalibrowanym gęściej symbole i odsunięcia etykiet są kilkukrotnie większe.
   */
  skala?: number;
}

/** Gdzie ostatecznie staje etykieta i czy musiała w tym celu ustąpić z domyślnej strony. */
export interface RozmieszczonaEtykieta {
  kotwica: Point;
  /** `true` = stoi po innej stronie niż domyślna, więc należy jej się kreska odniesienia. */
  przesunieta: boolean;
}

function obrocPunkt(p: Point, stopnie: number): Point {
  if (!stopnie) return p;
  const a = (stopnie * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

/**
 * Wybiera dla każdej etykiety stronę symbolu, po której nie zderzy się z sąsiadem.
 *
 * Etykiety stały domyślnie zawsze po prawej. Dwa łączniki po przeciwnych stronach
 * ściany — a tak stawia je każdy, kto montuje je przy tej samej framudze — wypychały
 * więc cyfry KU SOBIE. W projekcie przykładowym łącznik kuchenny stoi 67 cm od
 * salonowego schodowego, a ich etykiety lądowały 6 jedn. od siebie: cyfra „1" z kuchni
 * wyglądała jak drugi numer salonowego łącznika, który naprawdę ma „4".
 *
 * Etykieta ZOSTAJE przy swoim symbolu — zmienia się tylko strona. Odsuwanie cyfry
 * w wolną przestrzeń rozwiązałoby kolizję, ale gorszym kosztem: numer przestałby
 * jednoznacznie wskazywać, do czego należy, a to jego jedyne zadanie.
 *
 * Kolejność wejścia nie wpływa na wynik (sortujemy po kluczu), bo numery użytkownik
 * wpisuje ręcznie i czyta wzrokiem — skakanie etykiet po rzucie przy każdym dorysowanym
 * elemencie byłoby gorsze niż sama kolizja.
 */
export function rozmiescEtykietyGrup(
  etykiety: EtykietaDoRozmieszczenia[],
  minOdleglosc: number
): Map<string, RozmieszczonaEtykieta> {
  const wynik = new Map<string, RozmieszczonaEtykieta>();
  const zajete: Point[] = [];

  for (const e of [...etykiety].sort((a, b) => a.klucz.localeCompare(b.klucz))) {
    const skala = e.skala ?? 1;
    const oceny = e.kandydaci.map((kot) => {
      const abs = obrocPunkt({ x: kot.x * skala, y: kot.y * skala }, e.rotacja);
      const p = { x: e.srodek.x + abs.x, y: e.srodek.y + abs.y };
      const dystans = zajete.length ? Math.min(...zajete.map((z) => Math.hypot(z.x - p.x, z.y - p.y))) : Infinity;
      return { kot, p, dystans };
    });

    // Pierwszy kandydat, który ma dość miejsca — kolejność kandydatów to preferencja
    // (domyślna strona idzie pierwsza). Gdy żaden nie ma, bierzemy najluźniejszy:
    // kolizja jest wtedy nieunikniona, ale niech będzie jak najmniejsza.
    const wybor = oceny.find((o) => o.dystans >= minOdleglosc) ?? oceny.reduce((a, b) => (b.dystans > a.dystans ? b : a));
    // „Ustąpiła" znaczy: stoi po innej stronie niż domyślna. Etykieta z jedną kotwicą
    // nie ma dokąd ustąpić, więc nigdy nie jest tak oznaczona — kreska odniesienia
    // sugerowałaby wtedy przesunięcie, którego nie było.
    wynik.set(e.klucz, { kotwica: wybor.kot, przesunieta: wybor.kot !== e.kandydaci[0] });
    zajete.push(wybor.p);
  }

  return wynik;
}
