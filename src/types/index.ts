/**
 * Typy domenowe projektu instalacji elektrycznej.
 *
 * Przeniesione z kształtów obiektów używanych w oryginalnym, jednoplikowym
 * PomocnikElektryka.jsx. W wersji JS te kształty istniały tylko "w praktyce"
 * (jako to, co faktycznie leżało w tablicach stanu) — tutaj są jawne i sprawdzane
 * przez kompilator. To jest dokładnie ten mechanizm, który wyłapałby część
 * błędów napotkanych podczas iteracyjnej pracy nad wersją JS (np. odwołanie do
 * usuniętej stałej ROW_MODULES czy wywołanie nieistniejącej jeszcze funkcji
 * downloadPanelLegendPdf przed jej dodaniem).
 */

export type ElementRole =
  | "socket"
  | "socketWet"
  | "socket3f"
  | "dedicated"
  | "ev"
  | "control"
  | "light"
  | "blind"
  | "lv"
  | "infra"
  | "fixture"
  | "sanitary";

export type ElementType =
  | "gniazdko" | "gniazdkoHerm" | "gniazdko400" | "wypustAGD" | "ladowarkaEV"
  | "wlacznik" | "wlacznikDwubiegunowy" | "wlacznikGrupowy" | "wlacznikSchodowy" | "wlacznikKrzyzowy"
  | "sciemniacz" | "czujnikRuchu"
  | "oswietlenie" | "kinkiet" | "oswietlenieZewn" | "tasmaLed"
  | "roleta" | "napedBramy" | "wentylator" | "termostat"
  | "rj45" | "rtvsat" | "domofon" | "dzwonek" | "czujnikDymu" | "czujnikCzadu"
  | "rozdzielnica" | "puszka"
  | "wanna" | "prysznic" | "umywalka";

export interface ElementTypeDef {
  label: string;
  code: string;
  color: string;
  role: ElementRole;
}

export interface InstallationElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  room: string;
  floor: string;
  dedicated: boolean;
  note: string;
  gangs: number;
  /** Obrót symbolu na planie, w stopniach (0 = domyślna orientacja). */
  rotation?: number;
  /** Ręcznie wymuszone numery grup sterowania oświetleniem — po jednej pozycji na obwód
   *  elementu (łącznik grupowy ma dwa, reszta jeden). `null` na danej pozycji oznacza, że
   *  TEN obwód dobierany jest automatycznie, więc da się nadpisać jeden, a drugi zostawić
   *  automatowi. Patrz `lib/lightGroups.ts`. */
  lightGroup?: (number | null)[];
  /** Litera wpisana w łuk symbolu wypustu AGD (np. „L" dla lodówki, „Z" dla zmywarki) —
   *  wyłącznie dla `type: "wypustAGD"`. Nazwa samego odbiornika idzie do `note`. */
  agdLetter?: string;
  /** Wysokość montażu nad podłogą [m] — nadpisanie wartości typowej dla typu
   *  (patrz `MOUNTING_HEIGHTS_M` w lib/elements.ts). `undefined` = wartość typowa.
   *  Wchodzi w długość przewodu: pion od rozdzielnicy pod strop i zejście do
   *  osprzętu zależy od tego, na jakiej wysokości ten osprzęt wisi. */
  heightM?: number;
}

export interface Wall {
  id: string;
  floor: string;
  points: Point[];
  /** Grubość w jednostkach planu. Opcjonalne — zapisy sprzed dodania tego pola go
   *  nie mają, więc każdy odczyt spada na `DEFAULT_WALL_THICKNESS` (patrz lib/design.ts). */
  thickness?: number;
}

/** „okno" jest tu tylko dla zgodności ze STARYMI zapisami — narzędzie stawia już
 *  wyłącznie drzwi (opcja okna okazała się niepotrzebna i została usunięta), ale
 *  projekt zapisany przed tą zmianą może mieć otwory tego rodzaju i mają nadal
 *  wyglądać tak jak wcześniej (patrz gałąź renderowania w DesignCanvas.tsx). */
export type OpeningKind = "drzwi" | "okno";

/**
 * Otwór (drzwi, dawniej też okno) wycięty w konkretnej ścianie ALBO w krawędzi narysowanego
 * pomieszczenia — dokładnie jedno z `wallId`/`roomId` jest ustawione, zależnie od
 * tego, w co użytkownik kliknął w trybie „otwory" (pomieszczenia często nie mają
 * osobno narysowanych ścian, więc bez tej drugiej opcji nie dało się tam w ogóle
 * postawić drzwi). Pozycja jest zapisana jako gotowy punkt świata (`x`, `y`)
 * plus kierunek ściany/krawędzi w tym miejscu (`angle`), a nie jako indeks
 * segmentu + parametr t — dzięki temu rysowanie glifu nie wymaga ponownego
 * przeliczania geometrii przy każdym renderze.
 * Świadomy kompromis: przesunięcie narożnika ściany/pomieszczenia (edycja po
 * zapisie, `moveWallPoint`/`moveRoomShapePoint`) NIE przesuwa już postawionych
 * otworów — te zostają na swoim miejscu, nawet jeśli krawędź się od nich oddali.
 * To ten sam poziom "lekkości" co reszta narzędzia ścian/pomieszczeń (bez
 * własnych akcji w store poza sprzątaniem przy kasowaniu, patrz niżej).
 */
export interface Opening {
  id: string;
  floor: string;
  wallId?: string;
  roomId?: string;
  x: number;
  y: number;
  /** Kierunek ściany w tym miejscu, radiany — do rysowania glifu (łuk skrzydła
   *  drzwi / linie okna) równolegle do ściany. */
  angle: number;
  /** Szerokość otworu w jednostkach planu. */
  width: number;
  kind: OpeningKind;
  /** Obrót glifu o 180° względem `angle` — dla drzwi zamienia stronę zawiasu
   *  i kierunek otwierania skrzydła. Opcjonalne: brak = `false`, zapisy sprzed
   *  dodania tego pola mają otwór w pierwotnej orientacji. */
  flip?: boolean;
}

/** Kuchnia/łazienka/pralnia/kotłownia liczą się jako pomieszczenia „mokre" — patrz
 *  `isWetRoomName` w lib/design.ts. Pozostałe (salon/sypialnia/pokój/garaż) służą
 *  tylko czytelności listy — nie wpływają na dobór. */
export type RoomType =
  | "inne"
  | "kuchnia"
  | "lazienka"
  | "pralnia"
  | "kotlownia"
  | "salon"
  | "sypialnia"
  | "pokoj"
  | "garaz";

export interface RoomShape {
  id: string;
  floor: string;
  name: string;
  color: string;
  points: Point[];
  /** Jawny typ pomieszczenia, wybrany w oknie „Nazwij pomieszczenie" albo w panelu
   *  pomieszczeń — niezależny od tego, jak dokładnie ktoś je nazwał. Opcjonalne:
   *  zapisy sprzed dodania tego pola go nie mają, więc te pomieszczenia wracają do
   *  starego zgadywania typu po nazwie (`guessRoomType`). */
  type?: RoomType;
}

export interface Point {
  x: number;
  y: number;
}

export interface Floor {
  id: string;
  name: string;
}

export interface Circuit {
  id: string;
  name: string;
  type: ElementType;
  elements: InstallationElement[];
  cable: string;
  breaker: string;
  rcd: boolean;
}

export interface RcdGroup {
  id: string;
  /**
   * Znamionowy prąd RÓŻNICOWY grupy („30mA") — sama czułość, BEZ prądu
   * znamionowego aparatu.
   *
   * Amper dobiera się do rozłącznika głównego (`rcdRatingFor` w lib/panel/devices.ts)
   * i tam jest jego jedyne źródło. Dopóki to pole niosło pełne oznaczenie „40A/30mA",
   * były dwa: aparat wychodził na froncie rozdzielnicy z etykietą „63A" i podpisem
   * „Wyłącznik różnicowoprądowy 40A/30mA", czyli z dwiema różnymi wartościami tej
   * samej wielkości — a podpis jest tym, z czym idzie się do sklepu.
   */
  rating: string;
  circuits: Circuit[];
}

/** Czym elektrycznie jest dana trasa (patrz `buildCableRoutes`/`buildControlRoutes`
 *  w loads.ts): „zasilanie" — rozdzielnica → punkt obwodu; „sterowanie" —
 *  łącznik → oprawa, którą przełącza (osobna para żył, nie przedłużenie zasilania).
 *  Rysowanie odróżnia je stylem linii, żeby dwie różne role przewodu nie wyglądały
 *  na ten sam kabel. */
export type CableRouteKind = "zasilanie" | "sterowanie";

export interface CableRoute {
  id: string;
  circuitId: string;
  circuitName: string;
  kind: CableRouteKind;
  type: ElementType;
  cable: string;
  breaker: string;
  /** Pomieszczenie PUNKTU DOCELOWEGO (nazwa, jak w `InstallationElement.room`) —
   *  do kolorowania trasy tak samo jak pomieszczenie na planie (patrz
   *  `colorForRoomName`), zamiast po rodzaju obwodu. */
  room: string;
  floor: string;
  points: Point[];
  lengthUnits: number;
  /** Czy trasa faktycznie biegnie wzdłuż narysowanych ścian/obrysów pomieszczeń
   *  (`routeAlongWalls`), czy to tylko uproszczony szacunek Manhattan — użyty, gdy na
   *  kondygnacji nie ma geometrii do routingu, albo oba końce (rozdzielnica/łącznik
   *  i punkt/oprawa) siedzą w dwóch niepołączonych jej częściach. Rysowanie odróżnia
   *  je stylem linii (ciągła kontra przerywana), żeby nie sugerować pewności co do
   *  trasy, której nie ma. */
  viaWalls: boolean;
}

/** Konfiguracja zasilania rozdzielnicy — współdzielona przez widok Rozdzielnicy i
 *  Schemat jednokreskowy (patrz `buildPanelDevices`), żeby oba widoki zawsze zgadzały
 *  się co do tego, ile faz i jaki rozłącznik główny.
 *
 *  Bez pola SPD: ogranicznik przepięć jest zwykłym aparatem katalogowym
 *  (MANUAL_DEVICE_TYPES, `kind: "spd"`), dokładanym świadomie jak każde inne
 *  zabezpieczenie, a nie osobną flagą konfiguracji wymuszającą go w każdej
 *  rozdzielnicy z automatu. */
export interface PanelConfig {
  supply3f: boolean;
  mainRating: number;
}

/** Jeden aparat na froncie rozdzielnicy — patrz DesignTab -> buildPanelDevices w wersji JS. */
export interface PanelDevice {
  uid: string;
  key?: string; // stabilny identyfikator wynikający z obwodu — do trwałego ukrywania po usunięciu
  kind: "main" | "spdFuse" | "spd" | "rcd" | "mcb" | "blank" | string;
  tag: string;
  modules: number;
  label: string;
  caption: string;
  poles: string;
  phase?: "L1" | "L2" | "L3" | "3F" | "";
  type?: ElementType;
  cable?: string;
  rcdTag?: string;
  manual?: boolean;
}

/** Nagłówek dokumentacji — współdzielony przez protokoły pomiarowe i legendę rozdzielnicy. */
export interface DocumentHeader {
  obiekt: string;
  adres: string;
  zleceniodawca: string;
  wykonawca: string;
  uprawnienia: string;
  przyrzad: string;
  nrFabryczny: string;
  swiadectwo: string;
  data: string;
  temperatura: string;
  wilgotnosc: string;
  uklad: "TN-S" | "TN-C" | "TN-C-S" | "TT" | "IT";
  drawingNo: string;
  revision: string;
  uwagi?: string;
}

export type ProtocolKey =
  | "izolacja"
  | "petla"
  | "rcd"
  | "uziemienie"
  | "ciaglosc"
  | "ogledziny"
  | "odgromowa";

export interface PriceTable {
  [key: string]: number;
}
