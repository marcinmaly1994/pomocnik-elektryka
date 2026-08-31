import type { Circuit, InstallationElement, RcdGroup, RoomShape } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { computeLightGroups } from "@/lib/lightGroups";
import { isWetRoomName } from "@/lib/design";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Dzieli światła na obwody, RESPEKTUJĄC grupy sterowania (lib/lightGroups.ts).
 *
 * Powód nie jest kosmetyczny: łącznik jest włączony szeregowo w przewód fazowy
 * obwodu, który zasila sterowane nim lampy — fizycznie nie da się jednym
 * łącznikiem przełączać dwóch różnych obwodów pod dwoma zabezpieczeniami.
 * Dotychczasowe `chunk(lights, N)` dzieliło światła po N „na ślepo", więc grupa
 * mogła zostać rozerwana między dwa obwody — czyli zaprojektować instalację,
 * której nie da się fizycznie wykonać. Grupa jest tu niepodzielna; limit `N`
 * (miejsce na szynie) jest respektowany między grupami, nie wewnątrz nich.
 *
 * Światła bez grupy (brak łącznika w pobliżu, brak przypisanego pomieszczenia)
 * trafiają do paczek tak jak dotychczas — każde jako grupa o rozmiarze 1, co
 * przy braku jakichkolwiek grup daje dokładnie stare zachowanie `chunk`.
 */
export function chunkLightsByGroup(
  lights: InstallationElement[],
  lightGroups: Map<string, (number | undefined)[]>,
  maxPerCircuit: number
): InstallationElement[][] {
  const bucketOrder: string[] = [];
  const buckets = new Map<string, InstallationElement[]>();
  lights.forEach((l) => {
    // Numeracja grup w computeLightGroups zaczyna się od 1 OSOBNO na każdej
    // kondygnacji, więc sam numer nie wystarcza jako klucz — bez piętra grupa 1
    // z parteru scaliłaby się z grupą 1 z piętra.
    const g = lightGroups.get(l.id)?.[0];
    const key = g != null ? `${l.floor}::grupa${g}` : `pojedyncze::${l.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      bucketOrder.push(key);
    }
    buckets.get(key)!.push(l);
  });

  const circuits: InstallationElement[][] = [];
  let current: InstallationElement[] = [];
  for (const key of bucketOrder) {
    const bucket = buckets.get(key)!;
    if (current.length > 0 && current.length + bucket.length > maxPerCircuit) {
      circuits.push(current);
      current = [];
    }
    current.push(...bucket);
    // Grupa większa niż limit modułowy trafia sama, w jednym obwodzie
    // przekraczającym limit — lepiej przekroczyć zalecaną liczbę punktów niż
    // rozerwać grupę na dwa obwody, co nie dałoby się fizycznie wykonać.
    if (bucket.length > maxPerCircuit) {
      circuits.push(current);
      current = [];
    }
  }
  if (current.length) circuits.push(current);
  return circuits;
}

function roleOf(e: InstallationElement) {
  return ELEMENT_TYPES[e.type]?.role;
}

/**
 * Heurystyka grupowania elementów instalacji w obwody — przeniesiona z wersji JS.
 * Odbiorniki wymagające własnego obwodu (EV, gniazda 400V, wypusty AGD, gniazda
 * dedykowane, hermetyczne) dostają osobne obwody; zwykłe gniazda i oświetlenie są
 * grupowane po pomieszczeniu/typie w paczki po kilka sztuk (limit modułowy szyny).
 */
export function computeCircuits(elements: InstallationElement[], roomShapes: RoomShape[] = []): Circuit[] {
  const circuits: Circuit[] = [];
  let n = 1;
  const add = (c: Omit<Circuit, "id">) => circuits.push({ id: "obw" + n++, ...c });

  elements.filter((e) => roleOf(e) === "ev").forEach((e) => {
    add({ name: `Ładowarka EV — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x4 mm²", breaker: "C25 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket3f").forEach((e) => {
    add({ name: `Gniazdo trójfazowe — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x2,5 mm²", breaker: "C16 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "dedicated").forEach((e) => {
    // Rola "dedicated" niesie tylko wypust AGD (patrz ELEMENT_TYPES) — nazwa odbiornika
    // (jeśli wpisana) albo sama litera z symbolu odróżniają obwody w tym samym pokoju.
    add({ name: `Wypust AGD — ${e.room} (${e.note || `litera ${e.agdLetter || "A"}`})`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket" && e.dedicated).forEach((e) => {
    add({ name: `Obwód dedykowany — ${e.room} (${e.note || "odbiornik AGD"})`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  const herm = elements.filter((e) => roleOf(e) === "socketWet" && !e.dedicated);
  chunk(herm, 6).forEach((g, i) => {
    add({ name: `Gniazda hermetyczne ${i + 1}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  const regular = elements.filter((e) => roleOf(e) === "socket" && !e.dedicated);
  const byRoom: Record<string, InstallationElement[]> = {};
  regular.filter((e) => isWetRoomName(e.room, roomShapes)).forEach((e) => {
    (byRoom[e.room] ??= []).push(e);
  });
  Object.entries(byRoom).forEach(([room, list]) => {
    chunk(list, 6).forEach((g, i) => {
      add({ name: `Obwód gniazd — ${room}${i ? " " + (i + 1) : ""}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
    });
  });
  chunk(
    regular.filter((e) => !isWetRoomName(e.room, roomShapes)),
    8
  ).forEach((g, i) => {
    add({ name: `Obwód gniazd ogólnych ${i + 1}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  // Jedno wyliczenie grup dla całego planu — te same numery, które widać przy
  // łącznikach i lampach na rysunku, decydują teraz też o tym, co wyląduje na
  // wspólnym obwodzie (patrz `chunkLightsByGroup`).
  const lightGroups = computeLightGroups(elements);

  const lightsOut = elements.filter((e) => e.type === "oswietlenieZewn");
  chunkLightsByGroup(lightsOut, lightGroups, 8).forEach((g, i) => {
    add({ name: `Oświetlenie zewnętrzne ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });
  const lightsIn = elements.filter((e) => roleOf(e) === "light" && e.type !== "oswietlenieZewn");
  chunkLightsByGroup(lightsIn, lightGroups, 10).forEach((g, i) => {
    add({ name: `Obwód oświetlenia ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  chunk(
    elements.filter((e) => roleOf(e) === "blind"),
    8
  ).forEach((g, i) => {
    add({ name: `Obwód rolet ${i + 1}`, type: "roleta", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  return circuits.filter((c) => c.elements.length > 0);
}

export interface LowVoltageSummary {
  type: string;
  label: string;
  count: number;
}

/** Elementy niskoprądowe (LAN/RTV/domofon…) — poza rozdzielnicą 230V, tylko zestawienie. */
export function computeLowVoltage(elements: InstallationElement[]): LowVoltageSummary[] {
  const lv = elements.filter((e) => roleOf(e) === "lv");
  const byType: Record<string, InstallationElement[]> = {};
  lv.forEach((e) => {
    (byType[e.type] ??= []).push(e);
  });
  return Object.entries(byType).map(([type, list]) => ({
    type,
    label: ELEMENT_TYPES[type as keyof typeof ELEMENT_TYPES].label,
    count: list.length,
  }));
}

/** Grupuje obwody po maks. 6 na jeden wyłącznik różnicowoprądowy 40A/30mA. */
export function computeRcdGroups(circuits: Circuit[]): RcdGroup[] {
  const groups: RcdGroup[] = [];
  for (let i = 0; i < circuits.length; i += 6) {
    groups.push({ id: "rcd" + (groups.length + 1), rating: "40A/30mA", circuits: circuits.slice(i, i + 6) });
  }
  return groups;
}

/** Dobiera orientacyjny rozłącznik główny wg liczby obwodów w instalacji. */
export function mainBreakerFor(circuitCount: number): string {
  if (circuitCount <= 6) return "B25";
  if (circuitCount <= 12) return "B32";
  return "B40";
}

/** Kolor wg typu obwodu — używany na schemacie jednokreskowym i w widoku rozdzielnicy. */
export function colorForCircuit(type: string): string {
  return ({ gniazdko: "#2D5A8C", oswietlenie: "#C1793F", roleta: "#7C5CBF" } as Record<string, string>)[type] || "#2D5A8C";
}
