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
  const isManual = (e: InstallationElement, circuit: number) => manualOf.get(e.id)![circuit] != null;

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

      const multiway = controls.filter((c) => MULTIWAY.has(c.type) && !isManual(c, 0));
      if (multiway.length) {
        roomSeeds.push({
          targets: multiway.map((el) => ({ el, circuit: 0 })),
          anchors: multiway.map((c) => ({ x: c.x, y: c.y })),
          alwaysNumbered: false,
          circuit: 0,
          room,
        });
      }

      controls
        .filter((c) => !MULTIWAY.has(c.type))
        .forEach((c) => {
          if (c.type !== "wlacznikGrupowy") {
            if (!isManual(c, 0)) {
              roomSeeds.push({
                targets: [{ el: c, circuit: 0 }],
                anchors: [{ x: c.x, y: c.y }],
                alwaysNumbered: false,
                circuit: 0,
                room,
              });
            }
            return;
          }
          GROUP_SWITCH_ANGLES.forEach((deg, i) => {
            if (isManual(c, i)) return;
            const a = (deg * Math.PI) / 180;
            roomSeeds.push({
              targets: [{ el: c, circuit: i }],
              anchors: [{ x: c.x + Math.cos(a) * GROUP_SWITCH_SPLIT, y: c.y + Math.sin(a) * GROUP_SWITCH_SPLIT }],
              alwaysNumbered: true,
              circuit: i,
              room,
            });
          });
        });

      if (roomSeeds.length === 0) return;

      lights
        .filter((l) => !isManual(l, 0))
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
        const n = i + 1;
        seed.targets.forEach((t) => put(t.el, t.circuit, n));
        (lightsBySeed.get(seed) ?? []).forEach((l) => put(l, 0, n));
      });
  });

  // elementy, którym nie przypadł żaden numer, w ogóle nie trafiają do wyniku
  slots.forEach((arr, id) => {
    if (arr.every((n) => n === undefined)) slots.delete(id);
  });
  return slots;
}
