import type { ElementType, ElementTypeDef, InstallationElement } from "@/types";

/** Katalog typów elementów instalacji — przeniesiony 1:1 z ELEMENT_TYPES w wersji JS. */
export const ELEMENT_TYPES: Record<ElementType, ElementTypeDef> = {
  gniazdko: { label: "Gniazdo 230 V", code: "G", color: "#2D5A8C", role: "socket" },
  gniazdkoHerm: { label: "Gniazdko hermetyczne", code: "IP", color: "#2D5A8C", role: "socketWet" },
  gniazdko400: { label: "Gniazdo Trójfazowe", code: "3F", color: "#1F4470", role: "socket3f" },
  wypustAGD: { label: "Wypust AGD", code: "AGD", color: "#1F4470", role: "dedicated" },
  ladowarkaEV: { label: "Ładowarka EV", code: "EV", color: "#1F4470", role: "ev" },

  // Nazwy i symbole łączników wg zestawu symboli instalacyjnych przesłanego przez
  // użytkownika. „Grupowy" (świecznikowy) to ten, który potocznie nazywa się podwójnym —
  // nie mylić z „dwubiegunowym", który przerywa dwa przewody jednego obwodu.
  wlacznik: { label: "Łącznik jednobiegunowy", code: "SW", color: "#3B8C63", role: "control" },
  wlacznikDwubiegunowy: { label: "Łącznik dwubiegunowy", code: "SW2", color: "#3B8C63", role: "control" },
  wlacznikGrupowy: { label: "Łącznik grupowy", code: "SWG", color: "#3B8C63", role: "control" },
  wlacznikSchodowy: { label: "Łącznik schodowy", code: "S", color: "#3B8C63", role: "control" },
  wlacznikKrzyzowy: { label: "Łącznik krzyżowy", code: "SK", color: "#3B8C63", role: "control" },
  sciemniacz: { label: "Ściemniacz", code: "DIM", color: "#3B8C63", role: "control" },
  czujnikRuchu: { label: "Czujnik ruchu", code: "PIR", color: "#3B8C63", role: "control" },

  oswietlenie: { label: "Punkt sufitowy", code: "L", color: "#C1793F", role: "light" },
  kinkiet: { label: "Kinkiet ścienny", code: "LK", color: "#C1793F", role: "light" },
  oswietlenieZewn: { label: "Oświetlenie zewn.", code: "LZ", color: "#C1793F", role: "light" },
  tasmaLed: { label: "Taśma LED", code: "LED", color: "#C1793F", role: "light" },

  roleta: { label: "Roleta / napęd", code: "R", color: "#7C5CBF", role: "blind" },
  wentylator: { label: "Wentylator", code: "WEN", color: "#7C5CBF", role: "light" },
  termostat: { label: "Termostat", code: "T", color: "#7C5CBF", role: "control" },

  rj45: { label: "Gniazdo RJ45", code: "LAN", color: "#0F8A9E", role: "lv" },
  rtvsat: { label: "Gniazdo RTV/SAT", code: "TV", color: "#0F8A9E", role: "lv" },
  domofon: { label: "Domofon", code: "DOM", color: "#0F8A9E", role: "lv" },
  dzwonek: { label: "Dzwonek", code: "DZW", color: "#0F8A9E", role: "lv" },
  czujnikDymu: { label: "Czujnik dymu", code: "SD", color: "#0F8A9E", role: "lv" },

  rozdzielnica: { label: "Rozdzielnica", code: "TG", color: "#16202B", role: "infra" },
  puszka: { label: "Puszka rozgał.", code: "J", color: "#16202B", role: "infra" },

  wanna: { label: "Wanna", code: "WAN", color: "#0F8A9E", role: "sanitary" },
  prysznic: { label: "Prysznic", code: "PRY", color: "#0F8A9E", role: "sanitary" },
  umywalka: { label: "Umywalka", code: "UMY", color: "#0F8A9E", role: "sanitary" },
};

export interface ElementSectionItem {
  key: ElementType;
  /** Liczba gniazd/klawiszy w ramce, jeśli typ na to pozwala (np. gniazdko 1–6). */
  variants?: number[];
}

export interface ElementSection {
  title: string;
  items: ElementSectionItem[];
}

/** Sekcje biblioteki elementów — przeniesione z ELEMENT_SECTIONS, wraz z wariantami
 *  liczby gniazd/klawiszy w ramce tam, gdzie ma to sens. */
export const ELEMENT_SECTIONS: ElementSection[] = [
  {
    title: "Gniazda i zasilanie",
    items: [
      { key: "gniazdko", variants: [1, 2] },
      { key: "gniazdkoHerm" },
      { key: "gniazdko400" },
      { key: "wypustAGD" },
      { key: "ladowarkaEV" },
    ],
  },
  {
    title: "Łączniki i sterowanie",
    // Bez `variants`: liczbę biegunów/obwodów niesie teraz sam symbol (jednobiegunowy /
    // dwubiegunowy / grupowy), więc osobny licznik klawiszy tylko dublowałby tę informację.
    items: [
      { key: "wlacznik" },
      { key: "wlacznikDwubiegunowy" },
      { key: "wlacznikGrupowy" },
      { key: "wlacznikSchodowy" },
      { key: "wlacznikKrzyzowy" },
      { key: "sciemniacz" },
      { key: "czujnikRuchu" },
    ],
  },
  { title: "Oświetlenie", items: [{ key: "oswietlenie" }, { key: "kinkiet" }, { key: "oswietlenieZewn" }, { key: "tasmaLed" }] },
  { title: "Rolety i klimat", items: [{ key: "roleta" }, { key: "wentylator" }, { key: "termostat" }] },
  { title: "Teletechnika", items: [{ key: "rj45" }, { key: "rtvsat" }, { key: "domofon" }, { key: "dzwonek" }, { key: "czujnikDymu" }] },
  { title: "Rozdział", items: [{ key: "rozdzielnica" }, { key: "puszka" }] },
  { title: "Wyposażenie sanitarne", items: [{ key: "wanna" }, { key: "prysznic" }, { key: "umywalka" }] },
];

/** Szybki dostęp do wariantów danego typu, bez przeszukiwania sekcji za każdym razem. */
export const VARIANTS_FOR: Partial<Record<ElementType, number[]>> = {};
ELEMENT_SECTIONS.forEach((s) => s.items.forEach((i) => { if (i.variants) VARIANTS_FOR[i.key] = i.variants; }));

export const LIB_SUBTITLES: Partial<Record<ElementType, string>> = {
  gniazdko: "230V · pojedyncze",
  gniazdkoHerm: "IP44 · łazienka, taras",
  gniazdko400: "siła · 3-fazowe",
  wypustAGD: "własny obwód · litera edytowalna",
  ladowarkaEV: "wallbox · własny obwód",
  wlacznik: "jeden obwód, jedno miejsce",
  wlacznikDwubiegunowy: "przerywa L i N",
  wlacznikGrupowy: "świecznikowy · dwa obwody",
  wlacznikSchodowy: "sterowanie z 2 miejsc",
  wlacznikKrzyzowy: "sterowanie z 3+ miejsc",
  sciemniacz: "regulacja jasności",
  czujnikRuchu: "automatyka światła",
  oswietlenie: "punkt sufitowy",
  kinkiet: "oprawa ścienna",
  oswietlenieZewn: "elewacja, taras",
  tasmaLed: "listwa / podświetlenie",
  roleta: "napęd rolety",
  wentylator: "wywiew łazienkowy",
  termostat: "ogrzewanie podłogowe",
  rj45: "sieć komputerowa",
  rtvsat: "antena / satelita",
  domofon: "wideodomofon",
  dzwonek: "przycisk / gong",
  czujnikDymu: "detekcja pożaru",
  rozdzielnica: "tablica główna",
  puszka: "połączenia przewodów",
  wanna: "wyznacza strefy ochronne",
  prysznic: "wyznacza strefy ochronne",
  umywalka: "wymaga 0,6 m odstępu",
};

export function libSubtitle(key: ElementType, gangs: number): string {
  const base = LIB_SUBTITLES[key] || "";
  const variants = VARIANTS_FOR[key];
  if (variants && gangs > 1) {
    if (key === "gniazdko" || key === "gniazdkoHerm") return gangs === 2 ? "podwójne" : `${gangs}× w ramce`;
    return `${gangs}× klawisze`;
  }
  return base;
}

/** Element bez przypisanego (rozpoznanego) pomieszczenia na planie. */
export const NO_ROOM = "Bez pomieszczenia";

/** Promienie stref ochronnych [m] liczone od środka urządzenia (uproszczenie rzutu 2D).
 *  Wg PN-HD 60364-7-701: strefa 1 obejmuje przestrzeń nad wanną/brodzikiem, strefa 2 sięga
 *  0,6 m poza strefę 1. Dla umywalki stosuje się praktyczną zasadę 0,6 m odstępu. */
export const SANITARY_ZONES: Partial<Record<ElementType, { zone1: number; zone2: number; label: string }>> = {
  wanna: { zone1: 0.65, zone2: 1.25, label: "wanna" },
  prysznic: { zone1: 0.65, zone2: 1.25, label: "prysznic" },
  umywalka: { zone1: 0, zone2: 0.6, label: "umywalka" },
};

export interface SanitaryZone {
  id: string;
  type: ElementType;
  label: string;
  x: number;
  y: number;
  r1: number;
  r2: number;
  calibrated: boolean;
}

/** Wyznacza strefy ochronne wokół wanny/prysznica/umywalki na danej kondygnacji, w jednostkach
 *  planu. Bez kalibracji skali (`mpu`) przyjmuje poglądowy przelicznik, żeby strefy było widać. */
export function computeSanitaryZones(elements: InstallationElement[], floorId: string, mpu: number | null): SanitaryZone[] {
  const FALLBACK_MPU = 0.02; // ~2 cm na jednostkę planu
  const m = mpu || FALLBACK_MPU;
  return elements
    .filter((e) => e.floor === floorId && SANITARY_ZONES[e.type])
    .map((e) => {
      const z = SANITARY_ZONES[e.type]!;
      return { id: e.id, type: e.type, label: z.label, x: e.x, y: e.y, r1: z.zone1 / m, r2: z.zone2 / m, calibrated: !!mpu };
    });
}
