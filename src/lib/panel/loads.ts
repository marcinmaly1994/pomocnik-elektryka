/**
 * Model obciążeń i długości tras — warstwa, która zamienia RYSUNEK w liczby
 * wejściowe do doboru (`sizing.ts`).
 *
 * Rozdzielenie jest celowe: `sizing.ts` liczy wyłącznie z normy i nie wie, skąd
 * biorą się moc i długość. Tutaj mieszkają ZAŁOŻENIA — moce typowe odbiorników
 * i sposób szacowania trasy. Każde z nich jest jawne i opisane, bo to jedyne
 * miejsce w całym łańcuchu, gdzie liczby nie pochodzą wprost z tablic.
 */

import type { CableRoute, Circuit, ElementType, Floor, InstallationElement, Opening, Point, RoomShape, Wall } from "@/types";
import { ELEMENT_TYPES, MOUNTING_HEIGHTS_M, mountingHeightM, punktowObciazenia } from "@/lib/elements";
import { computeLightGroups, isLightControl, isLightPoint, manualGroups } from "@/lib/lightGroups";
import { crossesGeometry, routeAlongWalls } from "./routing";
import { kolorObwodu, KOLOR_BEZ_OBWODU } from "./circuits";
import { kolejnoscLancucha } from "./lancuch";
import { zasiegPrzyscienny } from "@/lib/glyphs";
import { przyscienny, punktPrzyscienny } from "@/lib/wallSnap";
import { nearestPointOnPolyline } from "@/lib/geometry";
import { ZAPAS_MONTAZOWY_M } from "./norms";

/**
 * Moc typowa pojedynczego punktu [W] — wartości projektowe, nie katalogowe.
 *
 * Dobrane „na wyrost względem dzisiejszego LED-a", bo obwód ma przeżyć wymianę
 * opraw i sprzętu: punkt sufitowy liczony jako 60 W obsłuży zarówno żarówkę LED
 * 8 W, jak i pięcioramienny żyrandol. Gniazdo liczone jest przed współczynnikiem
 * jednoczesności (patrz DIVERSITY) — stąd 300 W, a nie 3680 W wynikające z
 * obciążalności samego gniazda.
 */
export const ASSUMED_POWER_W: Partial<Record<ElementType, number>> = {
  gniazdko: 300,
  gniazdkoHerm: 300,
  gniazdko400: 3000,
  wypustAGD: 2000,
  ladowarkaEV: 7400,
  oswietlenie: 60,
  kinkiet: 40,
  oswietlenieZewn: 60,
  tasmaLed: 30,
  roleta: 100,
  wentylator: 50,
};

/**
 * Współczynnik jednoczesności ks wg rodzaju obwodu.
 *
 * Oświetlenie: 1,0 — wszystkie lampy w obwodzie mogą świecić naraz i zwykle świecą.
 * Gniazda: 0,4 — z ośmiu gniazd w pokoju realnie pracują dwa-trzy. To wartość
 * z praktyki projektowej dla instalacji mieszkaniowych; przy obwodzie kuchennym
 * bywa wyższa, dlatego obwody kuchenne i tak dostają osobne zabezpieczenie.
 * Dedykowane: 1,0 — obwód istnieje właśnie po to, żeby ten jeden odbiornik mógł
 * pracować z pełną mocą.
 */
export const DIVERSITY: Record<"oswietlenie" | "gniazda" | "dedykowany", number> = {
  oswietlenie: 1,
  gniazda: 0.4,
  dedykowany: 1,
};

/** Minimalna moc obliczeniowa obwodu gniazdowego [W] — obwód z jednym gniazdem
 *  i tak trzeba wymiarować na sensowny pobór, inaczej spadek napięcia wychodzi
 *  nierealistycznie mały i długa trasa przechodzi kontrolę, której nie powinna. */
const MIN_SOCKET_CIRCUIT_W = 1500;

export interface CircuitDemand {
  /** Moc obliczeniowa obwodu po współczynniku jednoczesności [W]. */
  powerW: number;
  /** Suma mocy zainstalowanej [W] — do bilansu mocy, nie do doboru. */
  installedW: number;
  /** Elementy bez przypisanej mocy typowej (np. łączniki) — pomijane w bilansie. */
  skipped: number;
}

/** Moc obliczeniowa obwodu: suma mocy typowych × ks, z podłogą dla obwodów gniazdowych. */
export function circuitDemand(
  elements: InstallationElement[],
  kind: "oswietlenie" | "gniazda" | "dedykowany"
): CircuitDemand {
  let installedW = 0;
  let skipped = 0;
  for (const e of elements) {
    const p = ASSUMED_POWER_W[e.type];
    if (p === undefined) {
      skipped += 1;
      continue;
    }
    // Gniazdo wielokrotne (ramka 2-/3-krotna) to tyle odbiorników, ile gniazd.
    installedW += p * punktowObciazenia(e);
  }
  const diversified = installedW * DIVERSITY[kind];
  const powerW = kind === "gniazda" ? Math.max(diversified, MIN_SOCKET_CIRCUIT_W) : diversified;
  return { powerW, installedW, skipped };
}

/**
 * DOMYŚLNA wysokość kondygnacji [m] — używana, dopóki użytkownik nie poda własnej
 * (patrz `Floor.heightM`). Trasa nie biegnie po podłodze w linii prostej: przewód
 * idzie pod sufit i schodzi do puszki.
 *
 * 2,8 m to typowa wysokość w świetle stropów w budownictwie mieszkaniowym. Zapisy
 * sprzed wprowadzenia wysokości per kondygnacja liczą się więc dokładnie tak jak dotąd.
 */
export const WYSOKOSC_KONDYGNACJI_M = 2.8;

/** Wysokość danej kondygnacji albo wartość typowa. Odrzuca wartości bezsensowne
 *  (zero, ujemne, nie-liczby) — wysokość zaniżona skraca policzony przewód, a to
 *  kierunek niebezpieczny: zaniżony spadek napięcia przepuszcza za cienki kabel. */
export function wysokoscKondygnacji(floor: Floor | undefined): number {
  const h = floor?.heightM;
  return typeof h === "number" && h > 0 ? h : WYSOKOSC_KONDYGNACJI_M;
}
// Zapas montażowy mieszka teraz w `norms.ts` razem z resztą warunków, bo stał się
// NASTAWĄ projektu, a nie stałą tego modułu — patrz `ZAPAS_MONTAZOWY_M`.

/**
 * Naddatek pionowy trasy [m]: wyjście z rozdzielnicy pod strop i zejście do osprzętu.
 *
 * Wcześniej była tu jedna stała `CEILING_RUN_M` doliczana każdemu punktowi tak samo —
 * gniazdo przy podłodze i punkt sufitowy dostawały identyczne 2,8 m, choć do pierwszego
 * przewód schodzi przez całą wysokość kondygnacji, a do drugiego nie schodzi wcale.
 * Teraz liczymy oba odcinki z rzeczywistych wysokości montażu (patrz `mountingHeightM`):
 * podejście od rozdzielnicy w górę i zejście w dół do odbiornika.
 *
 * `Math.max(0, …)` bo osprzęt bywa MONTOWANY pod stropem (punkt sufitowy na 2,8 m,
 * czujnik dymu) — wtedy zejścia nie ma, ale ujemna długość przewodu nie istnieje.
 */
function pionM(panelHeightM: number, deviceHeightM: number, wysokoscM: number): number {
  return Math.max(0, wysokoscM - panelHeightM) + Math.max(0, wysokoscM - deviceHeightM);
}

/**
 * Naddatek pionowy MIĘDZY dwiema puszkami tego samego obwodu [m] — sama różnica
 * wysokości montażu.
 *
 * NIE `pionM`, i to jest istota łańcucha. Tamta funkcja opisuje trasę „pod strop
 * i z powrotem w dół", bo tak wychodzi się z rozdzielnicy. Ale kolejnego gniazda
 * nie zasila się, wracając pod sufit — przewód idzie z puszki do puszki bruzdą
 * wzdłuż ściany, na tej samej wysokości. Liczenie tu pełnego biegu pod strop
 * dokładało 5 m na każdą parę sąsiednich gniazd: przy obwodzie ośmiu gniazd
 * trzydzieści metrów przewodu, którego nikt nigdy nie położy.
 *
 * Różnica zostaje, bo bywa prawdziwa: z gniazda (0,3 m) do punktu sufitowego
 * (2,8 m) przewód faktycznie musi się wspiąć.
 */
function pionMiedzyPunktami(poprzedniaHM: number, nastepnaHM: number): number {
  return Math.abs(poprzedniaHM - nastepnaHM);
}

export interface RouteEstimate {
  /**
   * Trasa do NAJDALSZEGO punktu obwodu [m] — to ona decyduje o spadku napięcia.
   *
   * Mierzona WZDŁUŻ ŁAŃCUCHA, a nie w linii prostej od rozdzielnicy: prąd do
   * ostatniego gniazda płynie przez wszystkie wcześniejsze puszki. Dawne liczenie
   * „na skróty" zaniżało tę długość, czyli myliło się w stronę NIEBEZPIECZNĄ —
   * spadek napięcia wychodził mniejszy niż w rzeczywistości.
   *
   * Prąd przyjmujemy pełny na całej długości, choć w rzeczywistości maleje z każdym
   * odgałęzieniem — to zapas po bezpiecznej stronie.
   */
  worstCaseM: number;
  /**
   * Suma odcinków łańcucha [m] — tyle przewodu trzeba KUPIĆ (kosztorys).
   *
   * Większa od `worstCaseM` o zejścia do puszek pośrednich i zapasy montażowe:
   * kabel do nich schodzi i wraca pod strop, więc materiał jest, a na drodze prądu
   * do ostatniego punktu tych metrów nie ma.
   */
  totalM: number;
  /**
   * Ile z `totalM` to ZAPASY MONTAŻOWE [m] — po jednym na punkt.
   *
   * Wydzielone, żeby kosztorys mógł powiedzieć, ile z metrażu to zejścia i luz w puszce.
   * Przy stu punktach to sto pięćdziesiąt metrów, które dotąd nie miały nazwy i przez to
   * wyglądały jak zmierzona trasa.
   *
   * Dotyczy TYLKO `totalM` (materiał). W `worstCaseM` zapas też jest, ale jeden — na
   * drodze prądu do najdalszego punktu pośrednie zejścia się nie liczą.
   */
  zapasM: number;
  /**
   * Czy choć jeden odcinek policzył się zapasowym szacunkiem Manhattan zamiast trasą
   * po ścianach.
   *
   * Manhattan jest KRÓTSZY od drogi, którą przewód naprawdę pokona — nie omija ścian
   * ani nie wchodzi w drzwi — więc zaniża spadek napięcia. Zaniżenie to jedyny kierunek
   * błędu, który w tej aplikacji jest niebezpieczny, a dotąd działo się po cichu: brak
   * skali aplikacja zgłasza wprost, brak geometrii nie zgłaszał niczego.
   */
  szacunek: boolean;
}

/**
 * Geometria kondygnacji — ta sama, po której `buildCableRoutes` prowadzi trasę na
 * rysunku. Podana `estimateRoutes` sprawia, że kosztorys i dobór liczą się z DROGI,
 * którą aplikacja rzeczywiście narysowała, a nie z jej przybliżenia.
 */
export interface GeometriaKondygnacji {
  walls: Wall[];
  roomShapes: RoomShape[];
  openings: Opening[];
}

/**
 * Geometria jednej kondygnacji, wycięta z geometrii całego budynku — ZAPAMIĘTANA.
 *
 * Nie chodzi o koszt samego `filter`, tylko o TOŻSAMOŚĆ wyniku: routing trzyma
 * zbudowany graf pod tożsamością tablic wejściowych (patrz `grafDla` w routing.ts).
 * Świeże tablice przy każdym obwodzie kasowały tę pamięć, więc graf budował się od nowa
 * dla każdego obwodu z osobna — a przy 24 pokojach to dwie trzecie kosztu trasy.
 *
 * `WeakMap` po obiekcie geometrii budynku: gdy plan się zmieni, komponent zbuduje nowy
 * obiekt, a stary wpis zniknie razem z nim. Nie ma czego unieważniać ręcznie.
 */
const geoPoKondygnacji = new WeakMap<GeometriaKondygnacji, Map<string, GeometriaKondygnacji>>();

function geoDlaKondygnacji(geo: GeometriaKondygnacji | undefined, floor: string): GeometriaKondygnacji | undefined {
  if (!geo) return undefined;
  let wgPietra = geoPoKondygnacji.get(geo);
  if (!wgPietra) {
    wgPietra = new Map();
    geoPoKondygnacji.set(geo, wgPietra);
  }
  const gotowe = wgPietra.get(floor);
  if (gotowe) return gotowe;
  const wyciete = {
    walls: geo.walls.filter((w) => w.floor === floor),
    roomShapes: geo.roomShapes.filter((r) => r.floor === floor),
    openings: geo.openings.filter((o) => o.floor === floor),
  };
  wgPietra.set(floor, wyciete);
  return wyciete;
}

/**
 * Bieg POZIOMY jednego ogniwa łańcucha [jednostki planu].
 *
 * Z geometrią — długość trasy policzonej przez `routeAlongWalls`, czyli dokładnie
 * tej, którą widać na rzucie. Bez geometrii (albo gdy routing nie znajdzie drogi)
 * zostaje Manhattan, tak jak przy rysowaniu zapasowej łamanej.
 *
 * Flagi `swobodneWejscie` powtórzone za `buildCableRoutes` — bez nich ta sama para
 * punktów dawałaby tu inną trasę niż na rysunku, a o to w tej całej poprawce chodzi.
 */
function biegPoziomyJedn(
  a: Point,
  b: Point,
  typA: ElementType | null,
  typB: ElementType,
  geo?: GeometriaKondygnacji
): { jedn: number; szacunek: boolean } {
  const manhattan = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  if (!geo) return { jedn: manhattan, szacunek: true };
  const trasa = routeAlongWalls(
    a,
    b,
    geo.walls,
    geo.roomShapes,
    { from: typA ? !przyscienny(typA) : false, to: !przyscienny(typB) },
    geo.openings
  );
  // Routing zwraca `null` także wtedy, gdy geometria JEST, ale nie prowadzi z punktu do
  // punktu — np. kondygnacja ma narysowaną jedną ścianę i nic poza nią. Oba przypadki
  // kończą się tym samym szacunkiem, więc oba muszą być tak samo widoczne.
  return trasa ? { jedn: polylineLengthUnits(trasa), szacunek: false } : { jedn: manhattan, szacunek: true };
}

/**
 * Szacuje długość przewodu obwodu, prowadzonego ŁAŃCUCHEM przez kolejne punkty.
 *
 * Bieg poziomy bierze się z `routeAlongWalls` — z tej samej trasy, którą rysuje
 * `buildCableRoutes`. Bez geometrii zostaje Manhattan: przewody układa się wzdłuż
 * ścian i pod stropem, nie po przekątnej pokoju. Każdy odcinek dostaje własny bieg
 * pionowy (pod sufit i z powrotem w dół, licząc od wysokości montażu punktu
 * POPRZEDNIEGO) oraz zapas montażowy na puszkę.
 *
 * Sama kolejność punktów to za mało, choć długo tak było. Kolejność bierze się
 * z `kolejnoscLancucha`, więc kosztorys i rysunek opisywały ten sam łańcuch — ale
 * DŁUGOŚĆ każdego ogniwa liczyły inaczej: tu w linii łamanej między punktami, tam
 * naokoło, wzdłuż ścian. Zmierzone na pokoju z czterema gniazdami: 599 kontra 753
 * jednostki, czyli szacunek krótszy o jedną piątą. To jest błąd w stronę NIEBEZPIECZNĄ,
 * bo `worstCaseM` idzie wprost do spadku napięcia: krótsza trasa to mniejszy ΔU
 * i zgoda na cieńszy przewód, niż trzeba.
 *
 * `metersPerUnit` pochodzi z kalibracji skali planu. Bez kalibracji zwraca `null`
 * — i to jest właściwe zachowanie: lepiej powiedzieć „nie wiem", niż podać
 * spadek napięcia policzony z długości wziętej z sufitu.
 */
export function estimateRoutes(
  panel: Point | null,
  elements: InstallationElement[],
  metersPerUnit: number | null,
  /** Wysokość montażu rozdzielnicy [m] — punkt startu pionu. Domyślnie wartość typowa
   *  dla rozdzielnicy; przekazywana jawnie tam, gdzie na planie stoi konkretna. */
  panelHeightM: number = MOUNTING_HEIGHTS_M.rozdzielnica ?? 1.5,
  /** Ten sam kształt co w `estimateRoutesByFloor` — obie funkcje biorą kontekst obiektem,
   *  żeby nie dało się pomylić, która chce gołą geometrię, a która opakowaną. */
  kontekst: {
    geometria?: GeometriaKondygnacji;
    /** Wszystkie elementy kondygnacji, nie tylko tego obwodu — po nich rozpoznaje się
     *  ŁĄCZNIKI sterujące oprawami. Brak = łańcuch prosto do opraw, jak przed
     *  uwzględnieniem sterowania. */
    wszystkieElementy?: InstallationElement[];
    /** Wysokość TEJ kondygnacji [m] — z niej liczy się podejście pod strop i zejście
     *  do puszki. Brak = wartość typowa (`WYSOKOSC_KONDYGNACJI_M`).
     *
     *  Jedna liczba na całe wywołanie, także wtedy, gdy rozdzielnica stoi piętro niżej:
     *  jej własne podejście pod strop liczyłoby się wysokością TAMTEGO piętra. Różnica
     *  to ułamek metra przy typowych wysokościach, a przejście między piętrami — czyli
     *  człon, który naprawdę waży — liczy `pionMiedzyKondygnacjami` z osobna i po
     *  właściwych kondygnacjach. */
    wysokoscKondygnacjiM?: number;
    /** Zapas montażowy na punkt [m]. Brak = wartość domyślna (`ZAPAS_MONTAZOWY_M`). */
    zapasNaPunktM?: number;
  } = {}
): RouteEstimate | null {
  if (!panel || metersPerUnit === null || !(metersPerUnit > 0) || elements.length === 0) return null;
  const geo = kontekst.geometria;
  const wysokoscM = kontekst.wysokoscKondygnacjiM ?? WYSOKOSC_KONDYGNACJI_M;
  // Ujemny zapas skrocilby przewod, wiec — jak wszedzie tutaj — wartosc bezsensowna
  // wraca do domyslnej zamiast mylic sie w strone niebezpieczna.
  const zapasNaPunkt = kontekst.zapasNaPunktM !== undefined && kontekst.zapasNaPunktM >= 0 ? kontekst.zapasNaPunktM : ZAPAS_MONTAZOWY_M;
  let zapasM = 0;

  /**
   * Zasilanie idzie do ŁĄCZNIKA, nie do oprawy — i to jest tu sedno.
   *
   * W typowej polskiej instalacji faza z rozdzielnicy dochodzi najpierw do puszki
   * łącznika, a dopiero stamtąd przewód rozchodzi się do opraw (patrz
   * `findControllingSwitch`). Rysunek robił tak od dawna, szacunek nie — pchał
   * łańcuch z rozdzielnicy wprost do opraw i wychodził krótszy. Zmierzone na pokoju
   * z łącznikiem przy przeciwległej ścianie: rysunek 1000 jednostek, szacunek 672.
   * Znowu w stronę niebezpieczną, bo `worstCaseM` idzie do spadku napięcia.
   */
  const wszystkie = kontekst.wszystkieElementy;
  const grupy = wszystkie ? computeLightGroups(wszystkie) : null;
  const laczniki = new Map<string, InstallationElement>();
  const bezposrednie: InstallationElement[] = [];
  for (const e of elements) {
    const sw = wszystkie && grupy && isLightPoint(e) ? findControllingSwitch(e, wszystkie, grupy) : null;
    if (sw) laczniki.set(sw.id, sw);
    else bezposrednie.push(e);
  }
  /** Ogniwa sterowania TEGO obwodu — łącznik → oprawa → oprawa, ta sama struktura,
   *  którą rysuje `buildControlRoutes`. */
  const sterowanie =
    wszystkie && grupy && laczniki.size > 0
      ? ogniwaSterowania(grupySterowania(wszystkie, grupy)).filter((o) => elements.some((e) => e.id === o.light.id))
      : [];

  /** Po ID, bo ten sam łącznik potrafi tu wejść dwiema drogami: raz jako element
   *  podany na wejściu (dokłada go `estimateRoutesByFloor` dla grupy przez strop),
   *  raz jako `findControllingSwitch` oprawy stojącej na tym samym piętrze. W łańcuchu
   *  ma być jeden punkt, nie dwa odcinki do tej samej puszki. */
  const punktyZasilania = [...new Map([...bezposrednie, ...laczniki.values()].map((e) => [e.id, e])).values()];
  const lancuch = kolejnoscLancucha(panel, punktyZasilania);
  let total = 0;
  /**
   * Sam bieg POZIOMY łańcucha — osobno od `total`, bo tylko on jest wspólny dla
   * wszystkich punktów. Zejścia do puszek i zapasy montażowe trzeba KUPIĆ (więc są
   * w `total`), ale nie leżą na drodze prądu do ostatniego gniazda: kabel biegnie
   * pod stropem, a do każdej puszki tylko schodzi i wraca. Wliczenie ich do trasy
   * spadku napięcia dodałoby przy ośmiu gniazdach ponad trzydzieści metrów, których
   * prąd nigdy nie przepływa — i kazałoby kłaść 6 mm² pod zwykłe gniazda.
   */
  let poziomM = 0;
  let poprzedni: Point = panel;
  /** Typ elementu, z którego wychodzi ogniwo — decyduje, czy wolno mu zejść do dowolnej
   *  ściany pokoju (oprawa pod stropem), czy tylko do swojej (osprzęt przyścienny).
   *  `null` na pierwszym: tam startem jest rozdzielnica, zawsze przyścienna. */
  let poprzedniTyp: ElementType | null = null;
  let wysokoscPoprzedniego = panelHeightM;
  let pierwszy = true;
  let szacunek = false;
  for (const e of lancuch) {
    const bieg = biegPoziomyJedn(poprzedni, e, poprzedniTyp, e.type, geo);
    szacunek = szacunek || bieg.szacunek;
    const odcinekM = bieg.jedn * metersPerUnit;
    poziomM += odcinekM;
    // Pierwszy odcinek wychodzi z ROZDZIELNICY — pod strop i w dół do puszki.
    // Kolejne idą z puszki do puszki, więc liczy się sama różnica wysokości.
    const pion = pierwszy
      ? pionM(panelHeightM, mountingHeightM(e, wysokoscM), wysokoscM)
      : pionMiedzyPunktami(wysokoscPoprzedniego, mountingHeightM(e, wysokoscM));
    total += odcinekM + pion + zapasNaPunkt;
    zapasM += zapasNaPunkt;
    poprzedni = e;
    poprzedniTyp = e.type;
    wysokoscPoprzedniego = mountingHeightM(e, wysokoscM);
    pierwszy = false;
  }

  /**
   * Odcinki ZA łącznikiem. Materiał to ich pełna suma; do spadku napięcia liczy się
   * najdłuższa pojedyncza gałąź, przybliżona tu sumą ogniw jednej grupy.
   *
   * Przybliżenie jest świadomie w stronę DŁUŻSZĄ: prąd do ostatniej oprawy nie płynie
   * przez wszystkie odgałęzienia grupy, ale zapas idzie po bezpiecznej stronie — tak
   * samo jak przyjęcie pełnego prądu na całej długości łańcucha.
   */
  const poGrupach = new Map<string, number>();
  for (const o of sterowanie) {
    const bieg = biegPoziomyJedn(o.bestFrom, o.light, o.bestFrom.type, o.light.type, geo);
    szacunek = szacunek || bieg.szacunek;
    const odcinekM = bieg.jedn * metersPerUnit;
    const pion = pionMiedzyPunktami(mountingHeightM(o.bestFrom, wysokoscM), mountingHeightM(o.light, wysokoscM));
    total += odcinekM + pion + zapasNaPunkt;
    zapasM += zapasNaPunkt;
    poGrupach.set(o.bestFrom.id, (poGrupach.get(o.bestFrom.id) ?? 0) + odcinekM);
  }
  const najdluzszeSterowanie = Math.max(0, ...poGrupach.values());

  // Punkt elektrycznie najdalszy to OSTATNI w łańcuchu (kolejność narasta od
  // rozdzielnicy): cały bieg poziomy plus jedno zejście do tej właśnie puszki.
  const ostatni = lancuch[lancuch.length - 1];
  const worst = poziomM + najdluzszeSterowanie + pionM(panelHeightM, mountingHeightM(ostatni, wysokoscM), wysokoscM) + zapasNaPunkt;
  return { worstCaseM: round1(worst), totalM: round1(total), zapasM: round1(zapasM), szacunek };
}

/**
 * To samo, ale dla obwodu rozłożonego na WIĘCEJ NIŻ JEDNĄ kondygnację.
 *
 * Skala jest właściwością kondygnacji, nie projektu: parter bywa wgranym skanem
 * skalibrowanym na 1 jedn. = 1,2 cm, a piętro narysowanym od zera (1 jedn. = 5 cm).
 * Wcześniej cały budynek liczył się jedną skalą — tą z kondygnacji AKURAT OTWARTEJ
 * w edytorze — więc metry na pozostałych piętrach wychodziły przemnożone przez
 * przypadkowy współczynnik, a wynik zmieniał się przy samym przełączeniu zakładki
 * kondygnacji. Dotyczyło to jednocześnie kosztorysu (ile kabla kupić) i doboru
 * przekroju (spadek napięcia liczy się z długości trasy).
 *
 * Każda kondygnacja liczy się więc własną skalą, a wyniki sumują się na końcu:
 * `totalM` to suma (tyle kabla trzeba), `worstCaseM` maksimum (to najdłuższa
 * pojedyncza trasa decyduje o spadku napięcia).
 *
 * `null`, gdy CHOĆ JEDNEJ kondygnacji z obwodu brakuje skali. Nie liczymy części:
 * skrócona długość zaniżyłaby spadek napięcia i dobrała za cienki przewód, a to
 * jest błąd w złą stronę. Lepiej odesłać obwód do ryczałtu i powiedzieć o tym wprost
 * (patrz `cableLengthSource` w kosztorysie).
 *
 * Czego to NIE liczy: pionu MIĘDZY kondygnacjami. Trasa z rozdzielnicy na parterze
 * do gniazda na piętrze dostaje tylko rzut poziomy i zejścia spod stropu — bo plan
 * nie wie, jaka jest wysokość kondygnacji. To osobne, świadome przybliżenie, starsze
 * od tej poprawki.
 */
export function estimateRoutesByFloor(
  panele: Rozdzielnice,
  elements: InstallationElement[],
  scales: Record<string, number>,
  panelHeightM: number = MOUNTING_HEIGHTS_M.rozdzielnica ?? 1.5,
  kontekst: {
    /** Geometria CAŁEGO budynku — filtrowana tu po kondygnacji, tak samo jak `scales`.
     *  Brak = szacunek Manhattan, jak przed wpięciem tras w dobór. */
    geometria?: GeometriaKondygnacji;
    /** Wszystkie elementy budynku — filtrowane tu po kondygnacji. Po nich rozpoznaje się
     *  łączniki sterujące oprawami, patrz `estimateRoutes`. */
    wszystkieElementy?: InstallationElement[];
    /** Kondygnacje w kolejności od dołu — z nich bierze się pion między piętrami.
     *  Brak = pion nie jest doliczany, czyli zachowanie sprzed tej poprawki. */
    kondygnacje?: Floor[];
    /** Zapas montażowy na punkt [m] — patrz `estimateRoutes`. */
    zapasNaPunktM?: number;
  } = {}
): RouteEstimate | null {
  if (elements.length === 0) return null;
  const { geometria: geo, kondygnacje } = kontekst;
  /**
   * Ogniwa sterowania PRZEZ STROP — liczone raz, bo rozstrzygają dwie rzeczy naraz:
   * którędy idzie ZASILANIE (tutaj) i ile kosztuje sam przewód sterowniczy (niżej).
   */
  const przezStrop =
    kontekst.wszystkieElementy && kondygnacje ? ogniwaPrzezStrop(kontekst.wszystkieElementy, elements) : [];
  /**
   * ZASILANIE IDZIE DO ŁĄCZNIKA, TAKŻE PRZEZ STROP.
   *
   * Dla grupy w obrębie piętra robi to `estimateRoutes`: oprawa nie trafia do łańcucha
   * zasilania w ogóle — trafia tam ŁĄCZNIK, a oprawa wisi za nim na ogniwie sterowania.
   * Przez strop `findControllingSwitch` łącznika nie widziało (dostaje elementy jednego
   * piętra), więc oprawa wpadała do łańcucha jako punkt zasilany wprost z rozdzielnicy
   * i dostawała JESZCZE ogniwo sterowania. Do jednej oprawy dochodziły w modelu dwa
   * kable, a położy się jeden.
   *
   * Stąd zamiana ról: oprawa wypada z łańcucha swojego piętra, a jej łącznik do niego
   * wchodzi — na kondygnacji, na której NAPRAWDĘ stoi, bo tylko tam ma swoją skalę,
   * swoją geometrię i swoją rozdzielnicę.
   */
  const sterowaneZInnegoPietra = new Set(przezStrop.map((o) => o.light.id));
  const poKondygnacjach = new Map<string, InstallationElement[]>();
  const dopisz = (e: InstallationElement) => {
    const lista = poKondygnacjach.get(e.floor);
    if (lista) lista.push(e);
    else poKondygnacjach.set(e.floor, [e]);
  };
  for (const e of elements) {
    if (sterowaneZInnegoPietra.has(e.id)) continue;
    dopisz(e);
  }
  // Ten sam łącznik bywa końcem kilku ogniw (steruje kilkoma oprawami) — do łańcucha
  // wchodzi RAZ. Podwójne wejście `estimateRoutes` i tak by odsiało (`punktyZasilania`
  // jest po id), ale nie ma powodu je tam wysyłać.
  for (const sw of new Map(przezStrop.map((o) => [o.bestFrom.id, o.bestFrom])).values()) dopisz(sw);

  let worst = 0;
  let total = 0;
  let zapas = 0;
  let szacunek = false;
  for (const [floor, grupa] of poKondygnacjach) {
    const skala = scales[floor];
    const r = estimateRoutes(
      panelDlaKondygnacji(panele, floor),
      grupa,
      typeof skala === "number" && skala > 0 ? skala : null,
      panelHeightM,
      {
        wszystkieElementy: kontekst.wszystkieElementy?.filter((e) => e.floor === floor),
        wysokoscKondygnacjiM: wysokoscKondygnacji(kondygnacje?.find((f) => f.id === floor)),
        zapasNaPunktM: kontekst.zapasNaPunktM,
        geometria: geoDlaKondygnacji(geo, floor),
      }
    );
    if (!r) return null;
    szacunek = szacunek || r.szacunek;
    zapas += r.zapasM;
    /**
     * Pion doliczany RAZ na kondygnację, nie na punkt: kabel wchodzi na piętro jeden
     * raz i dopiero tam rozchodzi się łańcuchem. Zerowy, gdy piętro ma własną
     * podrozdzielnicę — wtedy obwód liczy się od niej, a zasilanie samej podrozdzielnicy
     * to osobna sprawa (WLZ, poza modelem obwodów).
     */
    const pion =
      kondygnacje && !panele.poKondygnacji.has(floor) && panele.glownaKondygnacja
        ? pionMiedzyKondygnacjami(panele.glownaKondygnacja, floor, kondygnacje)
        : 0;
    total += r.totalM + pion;
    if (r.worstCaseM + pion > worst) worst = r.worstCaseM + pion;
  }
  /**
   * OGNIWA STEROWANIA PRZEZ STROP — te, których pętla wyżej nie ma jak zobaczyć.
   *
   * Grupa rozpięta między kondygnacje rozpadała się tam na dwa kawałki (na dole łącznik
   * bez oprawy, na górze oprawa bez łącznika), bo każdy obrót pętli dostaje elementy
   * JEDNEGO piętra i z nich liczy grupy. Żaden z kawałków nie tworzył ogniwa, więc
   * przewód sterowniczy przez strop nie kosztował NIC. Zmierzone przed tą poprawką:
   * oprawa na piętrze związana ręcznym numerem z łącznikiem na parterze dawała dokładnie
   * tyle samo metrów, co ta sama oprawa BEZ żadnej grupy.
   *
   * `pionMiedzyKondygnacjami` tego nie ratował: dolicza jedno przejście przez strop na
   * kondygnację dla ZASILANIA, a sterowanie to osobny kabel i osobne przejście.
   *
   * Przebieg jest dokładką, nie zamiennikiem, i nie może liczyć niczego dwa razy:
   * pętla wyżej widzi tylko jedno piętro naraz, więc KAŻDE jej ogniwo ma oba końce na
   * tej samej kondygnacji — a tu biorą się wyłącznie te, które kondygnacje przekraczają.
   *
   * Pion to suma dwóch rzeczy i obie są potrzebne: przejście przez strop
   * (`pionMiedzyKondygnacjami`) plus różnica wysokości montażu obu końców. Łącznik na
   * 1,1 m i oprawa pod stropem piętra wyżej to naprawdę 4,3 m pionu przy kondygnacji
   * 2,8 m, a nie 2,8.
   *
   * Czego to NIE liczy: ogniw W OBRĘBIE piętra, na którym grupa nie ma własnego
   * łącznika. Oprawa na piętrze sterowana z dołu jest zasilana wprost z rozdzielnicy
   * (patrz `estimateRoutes`), więc jej sąsiadka z tej samej grupy dostaje własną trasę
   * zamiast pętli od poprzedniej. To starsze uproszczenie modelu obwodu i osobna sprawa
   * od brakującego pionu.
   */
  let najdluzszePrzezStrop = 0;
  if (kondygnacje) {
    const zapasNaPunkt =
      kontekst.zapasNaPunktM !== undefined && kontekst.zapasNaPunktM >= 0 ? kontekst.zapasNaPunktM : ZAPAS_MONTAZOWY_M;
    for (const o of przezStrop) {
      const skala = scales[o.light.floor];
      if (!(typeof skala === "number" && skala > 0)) continue;
      // Bez geometrii, czyli Manhattan: trasy dwóch różnych pięter nie da się skleić
      // w jedną drogę po ścianach, a wynik ma o tym mówić wprost.
      const bieg = biegPoziomyJedn(o.bestFrom, o.light, o.bestFrom.type, o.light.type);
      szacunek = true;
      const wysokoscOd = wysokoscKondygnacji(kondygnacje.find((f) => f.id === o.bestFrom.floor));
      const wysokoscDo = wysokoscKondygnacji(kondygnacje.find((f) => f.id === o.light.floor));
      const pion =
        pionMiedzyKondygnacjami(o.bestFrom.floor, o.light.floor, kondygnacje) +
        pionMiedzyPunktami(mountingHeightM(o.bestFrom, wysokoscOd), mountingHeightM(o.light, wysokoscDo));
      const dlugosc = bieg.jedn * skala + pion + zapasNaPunkt;
      total += dlugosc;
      zapas += zapasNaPunkt;
      if (dlugosc > najdluzszePrzezStrop) najdluzszePrzezStrop = dlugosc;
    }
  }
  // Do spadku napięcia to ogniwo DOKŁADA się do najdłuższej trasy, tak samo jak
  // `najdluzszeSterowanie` w `estimateRoutes`: przybliżenie świadomie w stronę dłuższą.
  worst += najdluzszePrzezStrop;

  return { worstCaseM: round1(worst), totalM: round1(total), zapasM: round1(zapas), szacunek };
}

/**
 * Metry przewodu dla punktów łączonych GWIAZDĄ — każdy własnym kablem od punktu
 * zbiorczego [m]. Tak układa się niskoprądówkę: LAN i koncentryk idą do każdego
 * gniazda osobno, bo to połączenia punkt-punkt, a nie obwód.
 *
 * Dlatego nie da się tu użyć `estimateRoutesByFloor`: tamta liczy ŁAŃCUCH i dokłada
 * pion RAZ na kondygnację (kabel wchodzi na piętro jeden raz i dopiero tam się
 * rozchodzi). Przy gwieździe każdy kabel pokonuje ten pion OSOBNO — cztery gniazda
 * RJ45 na piętrze to cztery przejścia przez strop, nie jedno.
 *
 * `null`, gdy nie ma od czego mierzyć: bez punktu zbiorczego albo bez skali. Kosztorys
 * wraca wtedy do ryczałtu i mówi o tym wprost — tak samo jak przy zasilaniu.
 */
export function estimateGwiazdaByFloor(
  panele: Rozdzielnice,
  elements: InstallationElement[],
  scales: Record<string, number>,
  panelHeightM: number = MOUNTING_HEIGHTS_M.rozdzielnica ?? 1.5,
  kontekst: {
    geometria?: GeometriaKondygnacji;
    kondygnacje?: Floor[];
    zapasNaPunktM?: number;
  } = {}
): { totalM: number; szacunek: boolean } | null {
  if (elements.length === 0 || !panele.glowna) return null;
  const { geometria: geo, kondygnacje } = kontekst;
  const zapasNaPunkt =
    kontekst.zapasNaPunktM !== undefined && kontekst.zapasNaPunktM >= 0 ? kontekst.zapasNaPunktM : ZAPAS_MONTAZOWY_M;

  let total = 0;
  let szacunek = false;
  let policzone = 0;
  for (const e of elements) {
    const skala = scales[e.floor];
    if (!(typeof skala === "number" && skala > 0)) continue;
    const wysokoscM = wysokoscKondygnacji(kondygnacje?.find((f) => f.id === e.floor));
    const geoKondygnacji = geoDlaKondygnacji(geo, e.floor);
    // Punkt zbiorczy: rozdzielnica tej kondygnacji, a gdy jej nie ma — główna. Plan nie
    // wie, gdzie stoi szafka teletechniczna (nie ma takiego elementu w bibliotece), a
    // rozdzielnica jest jedynym miejscem, o którym wiadomo, że kable się w nim schodzą.
    const zrodlo = panelDlaKondygnacji(panele, e.floor) ?? panele.glowna;
    const bieg = biegPoziomyJedn(zrodlo, e, null, e.type, geoKondygnacji);
    szacunek = szacunek || bieg.szacunek;
    const pionWlasny = pionM(panelHeightM, mountingHeightM(e, wysokoscM), wysokoscM);
    // Pion na KAŻDY kabel osobno — patrz akapit wyżej.
    const pionPieter =
      kondygnacje && !panele.poKondygnacji.has(e.floor) && panele.glownaKondygnacja
        ? pionMiedzyKondygnacjami(panele.glownaKondygnacja, e.floor, kondygnacje)
        : 0;
    total += bieg.jedn * skala + pionWlasny + pionPieter + zapasNaPunkt;
    policzone++;
  }
  return policzone > 0 ? { totalM: round1(total), szacunek } : null;
}

/** Znajduje rozdzielnicę wśród PODANYCH elementów — punkt odniesienia dla tras.
 *  Wołane z listą JEDNEJ kondygnacji (patrz `cableRoutes` w DesignTab); dla całego
 *  budynku służy `findPanels`, bo tam liczy się, na którym piętrze co stoi. */
export function findPanel(elements: InstallationElement[]): Point | null {
  const p = elements.find((e) => e.type === "rozdzielnica");
  return p ? { x: p.x, y: p.y } : null;
}

/** Rozdzielnice budynku: po jednej na kondygnację plus ta, od której zaczyna się
 *  cały budynek (pierwsza znaleziona). Patrz `panelDlaKondygnacji`. */
export interface Rozdzielnice {
  poKondygnacji: Map<string, Point>;
  glowna: Point | null;
  /** Kondygnacja, na ktorej stoi `glowna` — potrzebna, zeby policzyc PION do obwodow
   *  na pietrach bez wlasnej podrozdzielnicy (patrz `pionMiedzyKondygnacjami`). */
  glownaKondygnacja: string | null;
}

/**
 * Zbiera rozdzielnice CAŁEGO budynku, z podziałem na kondygnacje.
 *
 * Dotąd trasy wszystkich obwodów mierzyły się od `findPanel(allElements)`, czyli od
 * PIERWSZEJ rozdzielnicy znalezionej w projekcie — nawet dla obwodów na piętrze, które
 * ma własną podrozdzielnicę. Dom z tablicą główną na parterze i podrozdzielnicą na
 * górze dostawał przez to metry liczone przez pół budynku, a spadek napięcia — od
 * niewłaściwego źródła. Kolejność elementów w tablicy decydowała o wyniku.
 *
 * Przy kilku rozdzielnicach na jednej kondygnacji liczy się pierwsza: plan nie mówi,
 * która zasila który obwód, a zgadywanie byłoby gorsze od jawnego uproszczenia.
 */
export function findPanels(allElements: InstallationElement[]): Rozdzielnice {
  return punktyZbiorcze(allElements, "rozdzielnica");
}

/**
 * Punkty zbiorcze NISKOPRĄDÓWKI — szafki teletechniczne, z których wychodzi LAN i
 * koncentryk (patrz `lowVoltageLengths`).
 *
 * Ta sama struktura co rozdzielnice, bo pytanie jest to samo: gdzie na tej kondygnacji
 * schodzą się kable, a gdzie jest punkt główny całego budynku. Dopóki na planie nie ma
 * ani jednej szafki, niskoprądówka mierzy się od rozdzielnicy — to założenie, nie fakt,
 * i teraz da się je zastąpić prawdą, stawiając szafkę tam, gdzie naprawdę stoi.
 */
export function findPunktyZbiorcze(allElements: InstallationElement[]): Rozdzielnice {
  return punktyZbiorcze(allElements, "szafkaTeletech");
}

function punktyZbiorcze(allElements: InstallationElement[], typ: ElementType): Rozdzielnice {
  const poKondygnacji = new Map<string, Point>();
  let glowna: Point | null = null;
  let glownaKondygnacja: string | null = null;
  for (const e of allElements) {
    if (e.type !== typ) continue;
    const punkt = { x: e.x, y: e.y };
    if (!poKondygnacji.has(e.floor)) poKondygnacji.set(e.floor, punkt);
    if (glowna === null) {
      glowna = punkt;
      glownaKondygnacja = e.floor;
    }
  }
  return { poKondygnacji, glowna, glownaKondygnacja };
}

/**
 * Pion, który przewód musi pokonać, idąc z kondygnacji `od` na `do` [m].
 *
 * Kolejność w `floors` jest kolejnością kondygnacji — nowe piętra dokładają się na
 * końcu listy (patrz `addFloor` w store'ie) i to jedyna informacja o ich układzie,
 * jaką projekt niesie. Liczy się SUMA wysokości pięter PO DRODZE, a nie różnica
 * poziomów razy jedna stała: od kiedy wysokość da się ustawić per kondygnacja
 * (`Floor.heightM`), wysoki parter i niskie poddasze dają różne piony.
 *
 * Sumowane są wysokości pięter DOLNYCH każdej pary, bo to one dzielą dwa poziomy:
 * droga z piętra `k` na `k+1` to wysokość piętra `k`. Gdy wszystkie kondygnacje mają
 * tę samą wysokość, wynik jest identyczny jak przed tą zmianą.
 *
 * To dokładka do `pionM`, nie zamiennik: tamta opisuje wyjście pod strop i zejście do
 * puszki W OBRĘBIE piętra, ta — przejście przez strop. Bez niej trasa z rozdzielnicy
 * na parterze do gniazda na piętrze dostawała sam rzut poziomy, czyli była krótsza
 * o kilka metrów. Znowu w stronę niebezpieczną, bo `worstCaseM` idzie do spadku
 * napięcia.
 *
 * Zero, gdy którejś kondygnacji nie ma na liście — lepiej nie doliczyć nic, niż
 * doliczyć z pozycji zgadywanej.
 */
function pionMiedzyKondygnacjami(od: string, doK: string, floors: Floor[]): number {
  const i = floors.findIndex((f) => f.id === od);
  const j = floors.findIndex((f) => f.id === doK);
  if (i < 0 || j < 0 || i === j) return 0;
  let suma = 0;
  for (let k = Math.min(i, j); k < Math.max(i, j); k++) suma += wysokoscKondygnacji(floors[k]);
  return suma;
}

/**
 * Rozdzielnica, od której liczy się trasy na danej kondygnacji: własna, a gdy jej nie
 * ma — główna.
 *
 * Zapasowa jest tu konieczna, nie wygodna: typowy dom ma JEDNĄ tablicę na parterze
 * i obwody na piętrze też muszą się od czegoś liczyć.
 */
export function panelDlaKondygnacji(panele: Rozdzielnice, floor: string): Point | null {
  return panele.poKondygnacji.get(floor) ?? panele.glowna;
}

/** Łamana Manhattan (jedno załamanie: najpierw poziomo, potem pionowo) — zapasowa
 *  trasa, gdy `routeAlongWalls` nie znajdzie połączenia (brak ścian/pomieszczeń na
 *  kondygnacji, albo końce siedzą w dwóch niepołączonych kawałkach narysowanej
 *  geometrii). Ten sam kształt trasy co przed dodaniem routingu po ścianach
 *  (krok 1) — wciąż lepszy niż linia prosta po przekątnej pokoju. Używana zarówno
 *  dla tras zasilania (rozdzielnica→punkt), jak i sterowania (łącznik→oprawa).
 *
 *  Załamanie ma DWIE możliwe orientacje (przez `{to.x, from.y}` albo przez
 *  `{from.x, to.y}`) — bez geometrii ścian nie da się ich porządnie routować, ale
 *  da się sprawdzić, która z dwóch prostych łamanych NIE przecina po drodze
 *  narysowanej ściany/obrysu (`crossesGeometry`), i wybrać tę. Gdy obie przecinają
 *  coś (albo nic nie narysowano), zostaje pierwsza — to nadal tylko SZACUNEK,
 *  sygnalizowany na rysunku przerywaną kreską, nie obietnica trasy. */
function manhattanFallback(from: Point, to: Point, walls: Wall[], roomShapes: RoomShape[]): Point[] {
  const cornerA: Point = { x: to.x, y: from.y };
  if (cornerA.x === from.x || cornerA.y === to.y) return [from, to];
  const cornerB: Point = { x: from.x, y: to.y };
  const blockedA = crossesGeometry(from, cornerA, walls, roomShapes) || crossesGeometry(cornerA, to, walls, roomShapes);
  if (!blockedA) return [from, cornerA, to];
  const blockedB = crossesGeometry(from, cornerB, walls, roomShapes) || crossesGeometry(cornerB, to, walls, roomShapes);
  return blockedB ? [from, cornerA, to] : [from, cornerB, to];
}

/** Długość łamanej w jednostkach planu — do `lengthUnits`, niezależnie od tego, czy
 *  trasa jest routowana po ścianach, czy to zapasowa łamana Manhattan. */
function polylineLengthUnits(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return sum;
}

/** Łącznik dwubiegunowy łączy RÓWNOCZEŚNIE fazę i neutralny — więc każdy odcinek
 *  za nim (aż do samych opraw) niesie fazę łączoną, neutralny łączony i PE, czyli
 *  4 żyły, a nie standardowe 3 (faza łączona, neutralny „na wprost", PE). Jedyny
 *  typ łącznika, gdzie 4-żyłowość dotyczy całego dalszego przewodu, nie tylko
 *  samej puszki łącznika (patrz `switchBoxCoreCount` niżej — łącznik grupowy ma
 *  4 żyły TYLKO w swojej puszce, dalej do każdej z opraw wraca do 3). */
function isDualPoleSwitch(type: ElementType): boolean {
  return type === "wlacznikDwubiegunowy";
}

/** Liczba żył kabla DOCHODZĄCEGO do puszki łącznika (zasilanie z rozdzielnicy,
 *  patrz `findControllingSwitch`/pętla zasilania w `buildCableRoutes`) — zależnie
 *  od budowy łącznika:
 *  - jednobiegunowy / schodowy: faza stała + faza łączona + PE = 3 żyły. Łącznik
 *    schodowy potrzebuje DODATKOWO żył wahadłowych, ale to okablowanie MIĘDZY
 *    dwoma łącznikami, którego ta aplikacja nie modeluje (patrz komentarz przy
 *    `findControllingSwitch`) — sama puszka od strony zasilania zostaje 3-żyłowa.
 *  - krzyżowy: 4 żyły wahadłowe PRZELATUJĄ przez niego do sąsiedniego łącznika,
 *    ale to również okablowanie międzyłącznikowe, którego tu nie rysujemy — od
 *    strony zasilania jego własna puszka i tak startuje od 3 żył.
 *  - dwubiegunowy: łączy fazę I neutralny naraz — 2 żyły wchodzą, 2 wychodzą (+PE) = 4.
 *  - grupowy: DWA niezależne mechanizmy w jednej ramce — jedna wspólna faza
 *    WCHODZI, DWIE osobne fazy łączone WYCHODZĄ (po jednej na obwód), plus PE = 4.
 */
function switchBoxCoreCount(type: ElementType): 3 | 4 {
  return isDualPoleSwitch(type) || type === "wlacznikGrupowy" ? 4 : 3;
}

function cableSpecForCores(cores: 3 | 4): string {
  return cores === 4 ? "YDYp 4x1,5 mm²" : "YDYp 3x1,5 mm²";
}

/** Podmienia WYŁĄCZNIE liczbę żył w opisie kabla obwodu (np. „YDYp 3x1,5 mm²" →
 *  „YDYp 4x1,5 mm²"), zostawiając przekrój — o przekroju decyduje obciążalność
 *  obwodu (sizing.ts), o liczbie żył w tym miejscu decyduje budowa łącznika
 *  (`switchBoxCoreCount`), więc to dwie NIEZALEŻNE decyzje. Format `"{N}x{przekrój}"`
 *  to ten sam, ustalony gdzie indziej (patrz `cableFor` w sizing.ts) — jeśli kiedyś
 *  się zmieni, ten regexp trzeba będzie zmienić razem z nim. */
function withCoreCount(cableSpec: string, cores: 3 | 4): string {
  return cableSpec.replace(/(\d+)x/, `${cores}x`);
}

/** Grupa sterowania: łączniki i oprawy dzielące ten sam numer (patrz `computeLightGroups`). */
type GrupaSterowania = Map<number, { controls: InstallationElement[]; lights: InstallationElement[] }>;

/**
 * OGNIWA łańcucha sterowania: łącznik → oprawa → oprawa → … dla każdej grupy.
 *
 * Wydzielone z `buildControlRoutes`, bo potrzebuje tego także `estimateRoutes`.
 * Dopóki tylko rysunek znał tę strukturę, kosztorys i dobór liczyły obwód
 * oświetleniowy tak, jakby przewód szedł z rozdzielnicy wprost do opraw — a idzie
 * najpierw do łącznika i dopiero stamtąd rozchodzi się do nich. Zmierzone na pokoju
 * z łącznikiem przy przeciwległej ścianie: rysunek 1000 jednostek, szacunek 672.
 *
 * START łańcucha to łącznik grupy leżący najbliżej KTÓREJKOLWIEK sterowanej oprawy —
 * od niego fizycznie zaczyna się pętla przewodu. Dalej najbliższy sąsiad.
 */
function ogniwaSterowania(byGroup: GrupaSterowania): { bestFrom: InstallationElement; light: InstallationElement; cable: string }[] {
  const out: { bestFrom: InstallationElement; light: InstallationElement; cable: string }[] = [];
  byGroup.forEach((bucket) => {
    if (bucket.controls.length === 0 || bucket.lights.length === 0) return;
    const cable = cableSpecForCores(bucket.controls.some((c) => isDualPoleSwitch(c.type)) ? 4 : 3);

    let chainEnd = bucket.controls[0];
    let startDistSq = Infinity;
    bucket.controls.forEach((c) => {
      bucket.lights.forEach((l) => {
        const distSq = (c.x - l.x) ** 2 + (c.y - l.y) ** 2;
        if (distSq < startDistSq) {
          startDistSq = distSq;
          chainEnd = c;
        }
      });
    });

    const remaining = [...bucket.lights];
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDistSq = Infinity;
      remaining.forEach((l, i) => {
        const distSq = (l.x - chainEnd.x) ** 2 + (l.y - chainEnd.y) ** 2;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIdx = i;
        }
      });
      const light = remaining[bestIdx];
      remaining.splice(bestIdx, 1);
      out.push({ bestFrom: chainEnd, light, cable });
      chainEnd = light;
    }
  });
  return out;
}

/** Grupy sterowania odczytane z planu — wspólne dla rysunku i szacunku. */
function grupySterowania(elements: InstallationElement[], groups: Map<string, (number | undefined)[]>): GrupaSterowania {
  const byGroup: GrupaSterowania = new Map();
  elements.forEach((e) => {
    const nums = groups.get(e.id);
    if (!nums) return;
    nums.forEach((n) => {
      if (n == null) return;
      const bucket = byGroup.get(n) ?? { controls: [], lights: [] };
      if (isLightControl(e)) bucket.controls.push(e);
      if (isLightPoint(e)) bucket.lights.push(e);
      byGroup.set(n, bucket);
    });
  });
  return byGroup;
}


/**
 * Ogniwa sterowania, których końce siedzą na RÓŻNYCH kondygnacjach — dokładka dla
 * `estimateRoutesByFloor`, patrz akapit przy jej wywołaniu.
 *
 * Liczy grupy dla CAŁEGO budynku, a nie piętro po piętrze, bo inaczej grupa rozpięta
 * między kondygnacje w ogóle się nie pojawia. To jednak wymaga jednego zawężenia,
 * i jest ono konieczne, nie ostrożnościowe: numery grup nadaje się w zasięgu
 * KONDYGNACJI, więc automatyczna grupa 1 na parterze i automatyczna 1 na piętrze to
 * dwa różne obwody o tym samym numerze. Sklejone, wyhodowałyby przewód między pokojami,
 * których nic nie łączy. Dlatego liczy się wyłącznie numer WPISANY RĘCZNIE po obu
 * stronach — a to zarazem jedyny sposób, w jaki grupę przez strop da się w tym modelu
 * wyrazić (automat jej nigdy nie utworzy).
 */
function ogniwaPrzezStrop(
  wszystkie: InstallationElement[],
  elements: InstallationElement[]
): { bestFrom: InstallationElement; light: InstallationElement }[] {
  const byGroup = grupySterowania(wszystkie, computeLightGroups(wszystkie));
  const out: { bestFrom: InstallationElement; light: InstallationElement }[] = [];
  byGroup.forEach((bucket, numer) => {
    const reczne = {
      controls: bucket.controls.filter((e) => manualGroups(e).includes(numer)),
      lights: bucket.lights.filter((e) => manualGroups(e).includes(numer)),
    };
    if (reczne.controls.length === 0 || reczne.lights.length === 0) return;
    if (new Set([...reczne.controls, ...reczne.lights].map((e) => e.floor)).size < 2) return;
    for (const o of ogniwaSterowania(new Map([[numer, reczne]]))) {
      // Ogniwa w obrębie jednego piętra policzyła już pętla po kondygnacjach.
      if (o.bestFrom.floor === o.light.floor) continue;
      if (elements.some((e) => e.id === o.light.id)) out.push(o);
    }
  });
  return out;
}

/**
 * Trasy STEROWANIA: łącznik → oprawa (i, gdy jeden łącznik steruje kilkoma
 * oprawami, dalej oprawa → kolejna oprawa) — patrz `computeLightGroups` w
 * lightGroups.ts, wspólny numer grupy łączy łącznik z oprawami, które steruje.
 *
 * Elektrycznie to inna para żył niż zasilanie z rozdzielnicy: fazę do oprawy łączy
 * (i rozłącza) SAM łącznik, więc bez tej trasy rysunek sugerowałby, że łącznik
 * wisi w powietrzu, niepodłączony do niczego — a jest odwrotnie: to jedyny
 * odbiornik/aparat na planie, który nie dostaje WŁASNEJ trasy z rozdzielnicy
 * (patrz pętla niżej: `computeCircuits` celowo nigdy nie wkłada łączników do
 * `circuit.elements`), bo jego zadaniem jest przełączanie już zasilonej oprawy,
 * a nie pobór własnej mocy z osobnego obwodu.
 *
 * WIELE opraw w jednej grupie NIE dostaje osobnego kabla z łącznika do KAŻDEJ z
 * nich — fizycznie jest to JEDEN przewód, który pętli od łącznika przez kolejne
 * oprawy (każda oprawa ma na listwie zaciskowej DWA zaciski tej samej pętli:
 * wejście i wyjście). To wymusza PROSTY ŁAŃCUCH, nie drzewo z rozgałęzieniami —
 * pierwsze podejście (najkrótsze POŁĄCZENIE z KTÓREGOKOLWIEK już podłączonego
 * punktu, odmiana Prima) potrafiło dołożyć DRUGĄ i TRZECIĄ oprawę do tej samej,
 * już podłączonej oprawy, czyli zrobić z niej rozgałęźnik — a żadna zwykła oprawa
 * nie ma trzeciego zacisku na trzeci przewód. Budujemy więc łańcuch najbliższego
 * sąsiada: START to łącznik grupy najbliższy KTÓREJKOLWIEK sterowanej oprawie
 * (przy schodowym/krzyżowym paruset łączników wybieramy jeden — reszta to
 * niemodelowane tu okablowanie międzyłącznikowe, patrz `findControllingSwitch`),
 * a każdy kolejny odcinek prowadzi z KOŃCA dotychczasowego łańcucha do
 * najbliższej JESZCZE niepodłączonej oprawy — nigdy z powrotem do wcześniejszego
 * ogniwa. Każda oprawa (poza ostatnią) ma więc dokładnie jedno wejście i jedno
 * wyjście, tak jak w rzeczywistej pętli.
 *
 * `breaker`/`circuitId`/`circuitName` przejęte od obwodu, do którego należy
 * DOCELOWA oprawa danego odcinka (nie tworzymy dla sterowania osobnego,
 * zmyślonego obwodu) — sterowanie należy do tego samego obwodu co zasilanie.
 * `cable` NIE jest już od obwodu — patrz `switchBoxCoreCount`/`isDualPoleSwitch`:
 * poza łącznikiem dwubiegunowym (żyły łączone: faza I neutralny na całej dalszej
 * trasie) odcinek sterowania jest zawsze 3-żyłowy, niezależnie od przekroju/typu
 * kabla wybranego dla samego obwodu oświetleniowego.
 */
function buildControlRoutes(
  elements: InstallationElement[],
  circuits: Circuit[],
  /** Kolor linii dla każdego obwodu, kluczowany jego id — patrz `kolorObwodu`. */
  kolory: Map<string, string>,
  walls: Wall[],
  roomShapes: RoomShape[],
  otwory: Opening[],
  groups: Map<string, (number | undefined)[]>
): CableRoute[] {
  const byGroup = grupySterowania(elements, groups);

  const out: CableRoute[] = [];
  for (const { bestFrom, light, cable } of ogniwaSterowania(byGroup)) {
    {
      const from: Point = { x: bestFrom.x, y: bestFrom.y };
      const to: Point = { x: light.x, y: light.y };
      // Oprawa wisi pod stropem — przewód biegnie do niej sufitem i może zejść do
      // KAŻDEJ ściany pokoju. Łącznik siedzi w murze tam, gdzie stoi (patrz
      // `swobodneWejscie` w routing.ts).
      const routed = routeAlongWalls(from, to, walls, roomShapes, { from: !przyscienny(bestFrom.type), to: !przyscienny(light.type) }, otwory);
      const points = routed ?? manhattanFallback(from, to, walls, roomShapes);
      const circuit = circuits.find((circ) => circ.elements.some((el) => el.id === light.id));
      out.push({
        id: `${bestFrom.id}->${light.id}`,
        circuitId: circuit?.id ?? "",
        circuitName: circuit?.name ?? "Sterowanie oświetleniem",
        type: light.type,
        cable,
        breaker: circuit?.breaker ?? "",
        room: light.room,
        color: (circuit && kolory.get(circuit.id)) ?? KOLOR_BEZ_OBWODU,
        floor: light.floor,
        points,
        viaWalls: routed !== null,
        kind: "sterowanie",
        lengthUnits: polylineLengthUnits(points),
      });
    }
  }
  return out;
}

/**
 * Łącznik sterujący daną oprawą, NAJBLIŻSZY jej ze wszystkich dzielących z nią
 * numer grupy (patrz `computeLightGroups`) — `null`, gdy oprawa nie jest w ogóle
 * sterowana żadnym łącznikiem na planie (np. jeszcze niepostawionym, albo
 * sterowaną inaczej niż łącznikiem ściennym).
 *
 * Używane do PRZEKIEROWANIA trasy zasilania: w typowej polskiej instalacji
 * zasilanie (faza + neutralny) dochodzi NAJPIERW do puszki łącznika, a dopiero
 * stamtąd 3-żyłowy przewód (faza stała, faza łączona, neutralny) idzie do oprawy
 * — a nie odwrotnie. Przy łączniku schodowym/krzyżowym (kilka łączników na jedną
 * oprawę) wybieramy najbliższy — sama instalacja międzyłącznikowa nie jest tu
 * modelowana, to uproszczenie na tym samym poziomie co reszta routingu.
 */
function findControllingSwitch(
  light: InstallationElement,
  elements: InstallationElement[],
  groups: Map<string, (number | undefined)[]>
): InstallationElement | null {
  const myGroups = new Set((groups.get(light.id) ?? []).filter((n): n is number => n != null));
  if (myGroups.size === 0) return null;

  let best: InstallationElement | null = null;
  let bestDistSq = Infinity;
  for (const e of elements) {
    if (!isLightControl(e)) continue;
    const nums = groups.get(e.id);
    if (!nums?.some((n) => n != null && myGroups.has(n))) continue;
    const distSq = (e.x - light.x) ** 2 + (e.y - light.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  }
  return best;
}

/**
 * Wizualne trasy przewodów do narysowania na planie — WZDŁUŻ narysowanych ścian i
 * obrysów pomieszczeń (`routeAlongWalls`, krok 2), a gdy to się nie uda (brak
 * geometrii, albo końce w dwóch niepołączonych jej kawałkach) — łamana Manhattan
 * jako zapasowa trasa (krok 1). `CableRoute.viaWalls` mówi, z której z tych dwóch
 * dana trasa pochodzi.
 *
 * DWA rodzaje tras, zgodnie z tym, jak faktycznie biegnie przewód (`CableRoute.kind`):
 * - „zasilanie" — rozdzielnica → każdy punkt obwodu (gniazdko, oprawa, roleta…).
 *   Obwody RÓŻNYCH rodzajów (oświetleniowy, gniazdowy…) mają WŁASNE, niezależne
 *   trasy — `computeCircuits` nigdy nie miesza ich w jeden obwód, więc nawet gdy
 *   dwie trasy fizycznie biegną tym samym odcinkiem ściany, to i tak dwa osobne
 *   przewody, nie jeden wspólny (patrz rozsuwanie równoległych tras w
 *   DesignCanvas.tsx — bez niego nakładające się trasy wyglądały jak jedna).
 *   WYJĄTEK: oprawa STEROWANA łącznikiem dostaje trasę zasilania NIE do siebie,
 *   tylko do TEGO łącznika (`findControllingSwitch`) — zasilanie fizycznie
 *   dochodzi najpierw do puszki łącznika, a dopiero stamtąd 3-żyłowy przewód
 *   (patrz „sterowanie" niżej) prowadzi do oprawy. Bez tego rysunek sugerowałby
 *   odwrotną, nierealistyczną kolejność: zasilanie prosto do oprawy, z
 *   niezależnym doczepionym sterowaniem, zamiast jednego logicznego łańcucha
 *   rozdzielnica → łącznik → oprawa. Gdy KILKA opraw TEGO SAMEGO obwodu dzieli
 *   TEN SAM łącznik, dostają WSPÓLNĄ, jedną trasę do niego (nie po jednej każda)
 *   — to fizycznie jeden kabel, a osobna linia na oprawę rysowałaby tyle kresek
 *   zbiegających się w jednym punkcie, ile opraw steruje łącznik, myląco
 *   sugerując tyle samo kabli wchodzących do jego puszki.
 * - „sterowanie" — łącznik → oprawa, którą przełącza (patrz `buildControlRoutes`).
 *   Sam łącznik NIE dostaje WŁASNEGO obwodu z rozdzielnicy (nie jest samodzielnym
 *   odbiornikiem) — trasa zasilania, którą dostaje (patrz wyżej), należy nadal do
 *   obwodu oprawy, nie do jakiegoś zmyślonego obwodu łącznika.
 *
 * Osobna funkcja od `estimateRoutes`: tamta liczy WYŁĄCZNIE metry do kosztorysu/doboru
 * (z narzutem na bieg pod stropem i zapasem montażowym, które nie mają odpowiednika na
 * rysunku 2D) i dlatego wymaga kalibracji skali. Ta zwraca same punkty ścieżki w
 * jednostkach planu — do narysowania linii nie trzeba znać jej długości w metrach,
 * więc trasy sterowania działają nawet bez skali I bez rozdzielnicy na planie
 * (`panel === null` gasi WYŁĄCZNIE trasy zasilania, nie sterowania — łącznik i
 * oprawa nie potrzebują rozdzielnicy, żeby pokazać swoją zależność).
 *
 * `circuits`/`elements`/`walls`/`roomShapes` powinny pochodzić z TEJ SAMEJ
 * kondygnacji co `panel` — trasa między kondygnacjami nie ma sensu na płaskim
 * rysunku (każda ma własny układ współrzędnych). To odpowiedzialność wywołującego
 * (patrz `useActiveFloorElements`/`useActiveFloorWalls`/`useActiveFloorRoomShapes`).
 */
export function buildCableRoutes(
  panel: Point | null,
  circuits: Circuit[],
  elements: InstallationElement[],
  walls: Wall[],
  roomShapes: RoomShape[],
  /** Otwory (drzwi) tej kondygnacji — tylko nimi przewód przechodzi między
   *  pomieszczeniami (patrz `dodajPrzejscie` w routing.ts). */
  otwory: Opening[] = [],
  /** Skala renderu symboli (`elementRenderScale`) — trasa musi wiedzieć, jak duże
   *  są symbole na rysunku, żeby zatrzymać się na ich krawędzi. Domyślna jedynka
   *  odpowiada skali podstawowej i zachowuje zachowanie wywołań bez tego argumentu. */
  skalaSymboli = 1,
  /** Elementy CAŁEGO budynku — potrzebne wyłącznie po to, żeby rozpoznać oprawę
   *  sterowaną łącznikiem z INNEJ kondygnacji (patrz pętla zasilania niżej).
   *  Brak = rysunek jak przed tą poprawką, czyli każdy punkt obwodu z własną trasą. */
  wszystkieElementy?: InstallationElement[]
): CableRoute[] {
  const lightGroups = computeLightGroups(elements);
  /**
   * Oprawy, których zasilanie przychodzi PRZEZ STROP — od łącznika stojącego piętro
   * wyżej albo niżej (patrz `ogniwaPrzezStrop`). Rzut 2D nie umie narysować kabla
   * przechodzącego przez strop, a narysowanie zamiast niego trasy z rozdzielnicy
   * wprost do oprawy pokazywałoby kabel, którego kosztorys od tej pory nie kupuje
   * (`estimateRoutesByFloor` prowadzi zasilanie do łącznika, także przez strop).
   * Rysunek pokazuje więc MNIEJ — i to jest właściwy wybór, bo zgodność rysunku
   * z szacunkiem jest w tym module własnością pierwszej kategorii.
   */
  const zasilaneZInnegoPietra = new Set(
    wszystkieElementy ? ogniwaPrzezStrop(wszystkieElementy, elements).map((o) => o.light.id) : []
  );
  // Kolor po OBWODZIE, nie po pomieszczeniu — patrz `KOLORY_OBWODOW`. Liczony raz,
  // z kolejności obwodów, żeby zasilanie i sterowanie tego samego obwodu wyszły
  // tym samym kolorem (różnią się grubością i kreską, nie barwą).
  const kolory = new Map(circuits.map((c, i) => [c.id, kolorObwodu(i)]));
  const control = buildControlRoutes(elements, circuits, kolory, walls, roomShapes, otwory, lightGroups);
  if (!panel) return control;

  /**
   * Rozdzielnica jako ELEMENT, nie tylko punkt — potrzebny jej obrót, żeby wiedzieć,
   * którą stroną stoi do ściany (patrz `punktPrzyscienny`).
   *
   * Szukana po POZYCJI, a nie „pierwsza z listy": `panel` bywa podrozdzielnicą
   * kondygnacji (patrz `panelDlaKondygnacji`), a wtedy pierwsza rozdzielnica
   * w projekcie jest zupełnie inną tablicą, stojącą gdzie indziej.
   */
  const rozdzielnicaEl = elements.find((e) => e.type === "rozdzielnica" && e.x === panel.x && e.y === panel.y);
  const rozdzielnica: Zakonczenie | null = rozdzielnicaEl
    ? { type: rozdzielnicaEl.type, rotation: rozdzielnicaEl.rotation, end: { x: rozdzielnicaEl.x, y: rozdzielnicaEl.y } }
    : null;

  const supply: CableRoute[] = [];
  for (const c of circuits) {
    // Oprawy TEGO SAMEGO obwodu sterowane TYM SAMYM łącznikiem dzielą JEDNĄ
    // trasę zasilania do niego, nie po jednej każda — to fizycznie JEDEN kabel
    // obwodu (ta sama faza, ten sam neutralny, to samo zabezpieczenie), rozdzielony
    // na poszczególne oprawy DOPIERO ZA łącznikiem (patrz trasy sterowania).
    // Rysowanie osobnej linii na oprawę dawało tyle równoległych kresek kończących
    // się w JEDNYM punkcie, ile opraw steruje łącznik — myląco sugerując tyle samo
    // kabli WCHODZĄCYCH do jego puszki, a nie jeden, którym ta ostatnia trasa i tak
    // jest (patrz `switchBoxCoreCount` — TA liczba żył dotyczy właśnie tego kabla).
    // `anchor` to element, którego id trafia do `CableRoute.id` — pierwszy
    // napotkany z opraw danego łącznika w tym obwodzie, żeby id zostało stabilnym,
    // prawdziwym id elementu (wymagane przez `pruneRouteOverrides` w store'ie).
    const bySwitch = new Map<string, { sw: InstallationElement; anchor: InstallationElement }>();
    const direct: InstallationElement[] = [];
    for (const e of c.elements) {
      const sw = isLightPoint(e) ? findControllingSwitch(e, elements, lightGroups) : null;
      if (sw) {
        if (!bySwitch.has(sw.id)) bySwitch.set(sw.id, { sw, anchor: e });
      } else if (!zasilaneZInnegoPietra.has(e.id)) {
        direct.push(e);
      }
    }

    const targets: (Zakonczenie & { id: string; room: string; floor: string; end: Point; cores: 3 | 4 | null })[] = [
      ...direct.map((e) => ({
        id: e.id,
        room: e.room,
        floor: e.floor,
        type: e.type,
        rotation: e.rotation,
        end: { x: e.x, y: e.y },
        cores: null as 3 | 4 | null,
      })),
      ...[...bySwitch.values()].map(({ sw, anchor }) => ({
        id: anchor.id,
        room: sw.room,
        floor: sw.floor,
        type: sw.type,
        rotation: sw.rotation,
        end: { x: sw.x, y: sw.y },
        // Przekrój wynika z obciążalności obwodu (`c.cable`, sizing.ts) i zostaje
        // bez zmian — koryguje się WYŁĄCZNIE liczba żył w puszce łącznika (patrz
        // `switchBoxCoreCount`): łącznik grupowy ma dwa niezależne mechanizmy w
        // jednej ramce (wspólna faza + dwie łączone + PE), więc bywa 4-żyłowy.
        cores: switchBoxCoreCount(sw.type),
      })),
    ];

    // ŁAŃCUCH, nie gwiazda: jeden kabel obwodu wchodzi po drodze do kolejnych
    // puszek. Rysowanie osobnej linii z rozdzielnicy do każdego punktu pokazywało
    // tyle kabli, ile punktów — przy dwóch gniazdach w pokoju wyglądało to na dwa
    // niezależne obwody, choć to jeden przewód pod jednym zabezpieczeniem.
    // Kolejność liczy `kolejnoscLancucha`, ta sama, którą liczy `estimateRoutes` —
    // inaczej kosztorys opisywałby inną instalację niż rysunek.
    const lancuch = kolejnoscLancucha(
      panel,
      targets.map((t) => ({ ...t, x: t.end.x, y: t.end.y }))
    );
    /**
     * Pierwszy odcinek startuje z OBUDOWY rozdzielnicy, a nie z jej środka.
     *
     * Rysunek kończył się w tym punkcie już wcześniej — `zakonczPrzyElemencie` podmieniał
     * środek na punkt przyścienny po policzeniu trasy. Różnica jest w tym, CO liczy
     * routing: startując ze środka, przewód doskakiwał do korytarza spod obudowy i musiał
     * potem wrócić do niej odczepem pod 45°. Przy rozdzielnicy ten odczep nie ma sensu —
     * schodzi się tu kilkanaście obwodów i wchodzą w ścianę pionem nad obudową, nie
     * ukosem przez pokój (ustalenie produktowe: do rozdzielnicy przewód wchodzi
     * prostopadle). Ze startem na obudowie doskok wypada PROSTOPADLE do ściany, przy
     * której rozdzielnica stoi, i żaden odczep nie jest już potrzebny.
     *
     * Dodatkowo skos przestaje rosnąć z numerem pasa: `spreadOverlappingRoutes` odsuwa
     * korytarz w głąb pokoju, a odcinek prostopadły tylko się przy tym wydłuża, zamiast
     * — jak odczep 45° — kłaść się coraz dalej w bok (przy czwartym obwodzie robiło się
     * z tego 28 jedn. ukosu).
     *
     * `panel` zostaje jako start, gdy rozdzielnicy nie ma na liście elementów: wtedy nie
     * wiadomo, którą stroną stoi do ściany, i nie ma z czego wyliczyć punktu na obudowie.
     */
    const wyjscieZObudowy = rozdzielnicaEl ? punktPrzyscienny(rozdzielnicaEl, skalaSymboli) : null;
    let poczatek: Point = panel;
    // Element, z którego wychodzi kolejny odcinek — potrzebny, żeby wiedzieć, gdzie
    // dokładnie przy nim zacząć przewód (nóżka albo krawędź symbolu). Na pierwszym
    // odcinku jest nim ROZDZIELNICA: to też osprzęt przyścienny, a przewody wychodzą
    // z jej obudowy, nie ze środka. Dopóki startowały ze środka, przy kilku obwodach
    // robiła się wiązka linii zbiegająca się w jednym punkcie NA symbolu — czyli
    // dokładnie tam, gdzie rysunek pokazuje aparaty. `null` tylko wtedy, gdy
    // rozdzielnicy nie ma na liście elementów (osobny szacunek, patrz `estimateRoutes`).
    let poprzedni: Zakonczenie | null = rozdzielnica;
    for (const t of lancuch) {
      // Punkty świadomie skopiowane do gołego `{x,y}` — `Point[]` ma zostać lekką
      // geometrią, a nie przeciekiem całego `InstallationElement` (rola, pokój,
      // kondygnacja…) tam, gdzie potrzebna jest tylko ścieżka do narysowania.
      // Do oprawy przewód idzie sufitem, więc wolno mu zejść do każdej ściany pokoju
      // i wybrać tę, przy której cała trasa jest najkrótsza. Osprzęt przyścienny —
      // rozdzielnica, gniazdo, łącznik — wchodzi w mur tam, gdzie stoi.
      // Pierwszy odcinek routuje się z OBUDOWY rozdzielnicy (patrz `wyjscieZObudowy`),
      // kolejne — ze środka poprzedniej puszki, bo ogniwo łańcucha zaczyna się tam, gdzie
      // skończyło się poprzednie. `poprzedni === rozdzielnica` jest prawdą wyłącznie na
      // pierwszym obrocie pętli: dalej `poprzedni` to już element z łańcucha.
      const startRoutingu = (poprzedni === rozdzielnica ? wyjscieZObudowy : null) ?? poczatek;
      const routed = routeAlongWalls(startRoutingu, t.end, walls, roomShapes, {
        from: poprzedni ? !przyscienny(poprzedni.type) : false,
        to: !przyscienny(t.type),
      }, otwory);
      // Szacunek zapasowy liczy się od ŚRODKA, nie od obudowy. Manhattan mówi „nie wiem,
      // którędy" i jest rysowany przerywaną kreską — start dokładnie na obudowie
      // sugerowałby staranność, której w tej linii nie ma (tak samo jak pomijany tu
      // odczep przy elemencie, patrz `zKoncem` niżej).
      const surowe = routed ?? manhattanFallback(poczatek, t.end, walls, roomShapes);
      // Skos przy OBU końcach: przewód ma dochodzić do krawędzi symbolu, a nie
      // przebijać go na wylot. Koniec liczony wprost, początek — na odwróconej
      // łamanej, bo to ta sama operacja widziana z drugiej strony.
      //
      // TYLKO dla trasy faktycznie routowanej po geometrii. Zapasowy szacunek
      // Manhattan (rysowany przerywaną kreską) mówi „nie wiem, którędy" — dorysowanie
      // mu starannego odczepu sugerowałoby dokładność, której tam nie ma.
      const zKoncem = routed ? zakonczPrzyElemencie(surowe, t, skalaSymboli) : surowe;
      const points =
        routed && poprzedni
          ? [...zakonczPrzyElemencie([...zKoncem].reverse(), poprzedni, skalaSymboli)].reverse()
          : zKoncem;
      const cable = t.cores ? withCoreCount(c.cable, t.cores) : c.cable;
      supply.push({
        id: t.id,
        circuitId: c.id,
        circuitName: c.name,
        type: t.type,
        cable,
        breaker: c.breaker,
        room: t.room,
        color: kolory.get(c.id) ?? KOLOR_BEZ_OBWODU,
        floor: t.floor,
        points,
        viaWalls: routed !== null,
        kind: "zasilanie",
        lengthUnits: polylineLengthUnits(points),
      });
      // Następny odcinek startuje z TEJ puszki, nie z rozdzielnicy — na tym polega
      // łańcuch. `id` odcinka zostaje id punktu, w którym się KOŃCZY, więc ręcznie
      // poprawione trasy (`routeOverrides`) dalej trafiają we właściwy odcinek.
      poczatek = t.end;
      poprzedni = t;
    }
  }
  return [...supply, ...control];
}

/** O ile jednostek planu rozsunąć sąsiednie „pasy" tras dzielących ten sam odcinek —
 *  dobrane pod grubość linii trasy w DesignCanvas.tsx (1,5), żeby sąsiednie pasy się
 *  nie stykały, ale też nie odjeżdżały bezsensownie daleko od samej ściany. Zeszło
 *  z 4 na 3 razem ze scienieniem linii: przy cieńszym pociągnięciu ciaśniejsze pasy
 *  nadal są rozróżnialne, a wiązka kilku tras trzyma się bliżej swojej ściany. */
const LANE_SPACING = 3;

/** Ile jednostek wspólnego przebiegu musi mieć para odcinków, żeby uznać, że NAPRAWDĘ
 *  biegną obok siebie i trzeba je rozsunąć. Jedna jednostka planu to 5 cm — krótszego
 *  nachodzenia i tak nie widać, a próg odsiewa zwykłe spotkania końcami w narożniku. */
const MIN_NAKLADANIE = 1;

/**
 * Kierunek odcinka sprowadzony do JEDNEJ półpłaszczyzny — a→b i b→a opisują tę samą
 * prostą, więc muszą dać ten sam wektor, inaczej dwie trasy biegnące tym korytarzem
 * w przeciwne strony trafiłyby do osobnych „korytarzy".
 */
function kierunekKanoniczny(a: Point, b: Point): { x: number; y: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const u = { x: dx / len, y: dy / len };
  const odwroc = u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0);
  return odwroc ? { x: -u.x, y: -u.y } : u;
}

/**
 * Klucz PROSTEJ, na której leży odcinek — nie samego odcinka.
 *
 * Poprzednia wersja kluczowała parę końców, więc za „wspólny" uznawała wyłącznie
 * odcinki o IDENTYCZNYCH końcach. Trasa biegnąca pół ściany i druga biegnąca całą
 * miały różne klucze i rysowały się jedna na drugiej — a to najczęstszy układ:
 * obwody wychodzą z jednej rozdzielnicy i rozchodzą się w różnych miejscach.
 * Zaokrąglenie zostaje, bo trasy liczone są niezależnie po tym samym grafie ścian
 * i te same przebiegi różnią się o ułamki jednostki.
 */
function liniaKey(u: { x: number; y: number }, a: Point): string {
  const odleglosc = -u.y * a.x + u.x * a.y; // rzut na normalną — pozycja prostej
  return `${u.x.toFixed(3)},${u.y.toFixed(3)}|${Math.round(odleglosc)}`;
}

/**
 * Który pas dostaje trasa, licząc OD ŚCIANY.
 *
 * Gniazda najbliżej muru — tak biegnie instalacja naprawdę: obwód gniazdowy idzie
 * bruzdą na wysokości puszek, oświetlenie wychodzi pod strop, a sterowanie to
 * odgałęzienia od łączników. Trzymanie tej kolejności sprawia, że rysunek czyta się
 * zawsze tak samo, niezależnie od tego, w jakiej kolejności ktoś stawiał elementy.
 */
function priorytetPasa(r: CableRoute): number {
  if (r.kind === "sterowanie") return 3;
  const rola = ELEMENT_TYPES[r.type]?.role;
  if (rola === "socket" || rola === "socketWet") return 0;
  if (rola === "light") return 2;
  return 1; // siła, dedykowane, ładowarka EV, roleta, teletechnika
}

/**
 * Rozsuwa trasy, które na jakimś odcinku biegną DOKŁADNIE tym samym śladem, w
 * równoległe „pasy" — bez tego dwie niezależne trasy (np. obwód oświetleniowy i
 * gniazdowy poprowadzone tym samym korytarzem) rysują się jedna na drugiej i
 * wyglądają jak WSPÓLNY przewód, mimo że to dwa osobne obwody, które w
 * rzeczywistości nigdy nie dzielą żyły.
 *
 * Działa na GOTOWYCH trasach z `buildCableRoutes` — nie zmienia ich `points`
 * (`CableRoute` zostaje semantycznie dokładną geometrią, `lengthUnits` się nie
 * rusza), tylko zwraca osobną mapę „co narysować" per trasa. Rozjeżdża się na
 * odcinku po odcinku: gdy dwie trasy rozchodzą się w różnych miejscach, kolejne
 * odcinki mogą mieć różny zestaw „współlokatorów" i różny pas — to naturalne
 * (tak jak w realnym pęku przewodów, część biegnie razem, część się rozchodzi),
 * kosztem drobnego „łamania" na stykach zamiast idealnie gładkiej linii.
 */
export function spreadOverlappingRoutes(routes: CableRoute[], roomShapes: RoomShape[] = []): Map<string, Point[]> {
  /** Odcinek trasy sprowadzony do pozycji na swojej prostej: [t0,t1] wzdłuż `u`. */
  interface Wpis {
    routeId: string;
    /** Pas przydziela się OBWODOWI, nie odcinkowi: jeden obwód to jeden kabel, więc
     *  kolejne ogniwa łańcucha mają trzymać się tej samej linii. */
    obwod: string;
    priorytet: number;
    idx: number;
    t0: number;
    t1: number;
  }
  const linie = new Map<string, { u: { x: number; y: number }; a: Point; wpisy: Wpis[] }>();

  routes.forEach((r) => {
    for (let i = 0; i < r.points.length - 1; i++) {
      // ODCINKI SKRAJNE zostają na miejscu: to nie przebieg korytarzem, tylko
      // przyłączenie do urządzenia — koniec przewodu siedzi na obudowie rozdzielnicy
      // albo na nóżce gniazda i przesunięcie go w bok byłoby kłamstwem o tym, gdzie
      // kabel wchodzi. Bez tego skos przy rozdzielnicy odjeżdżał wzdłuż własnej,
      // ukośnej normalnej i trasa zaczynała się POZA budynkiem.
      if (i === 0 || i === r.points.length - 2) continue;
      const a = r.points[i];
      const b = r.points[i + 1];
      const u = kierunekKanoniczny(a, b);
      // Zerowej długości odcinek (np. `from`===`to` po zaokrągleniu) nie ma kierunku,
      // więc nie leży na żadnej prostej i nie da się go z niczym zestawić.
      if (!u) continue;
      const key = liniaKey(u, a);
      const linia = linie.get(key) ?? { u, a, wpisy: [] };
      const ta = u.x * a.x + u.y * a.y;
      const tb = u.x * b.x + u.y * b.y;
      linia.wpisy.push({
        routeId: r.id,
        obwod: r.circuitId || r.id,
        priorytet: priorytetPasa(r),
        idx: i,
        t0: Math.min(ta, tb),
        t1: Math.max(ta, tb),
      });
      linie.set(key, linia);
    }
  });

  /** Pas dla konkretnego odcinka konkretnej trasy: `${routeId}#${idx}`. */
  const pasy = new Map<string, { lane: number; kierunek: { x: number; y: number } }>();

  linie.forEach((linia) => {
    const odScianyWGlab = kierunekOdSciany(linia, roomShapes);
    // GRUPY NAKŁADANIA: rozsuwamy tylko te trasy, które naprawdę biegną obok siebie.
    // Dwie trasy używające tej samej ściany w rozłącznych kawałkach nie zasłaniają
    // się nawzajem, więc obie mogą zostać przy murze.
    const posortowane = [...linia.wpisy].sort((p, q) => p.t0 - q.t0);
    let grupa: Wpis[] = [];
    let koniecGrupy = -Infinity;
    const domknij = () => {
      if (grupa.length === 0) return;
      const obwody = [...new Set(grupa.map((w) => w.obwod))].sort((x, y) => {
        const px = grupa.find((w) => w.obwod === x)!.priorytet;
        const py = grupa.find((w) => w.obwod === y)!.priorytet;
        // Priorytet, a przy remisie id obwodu — żeby ten sam rysunek dawał zawsze
        // ten sam układ pasów, a nie losowy przy każdym przeliczeniu.
        return px - py || (x < y ? -1 : x > y ? 1 : 0);
      });
      for (const w of grupa) pasy.set(`${w.routeId}#${w.idx}`, { lane: obwody.indexOf(w.obwod), kierunek: odScianyWGlab });
      grupa = [];
      koniecGrupy = -Infinity;
    };
    for (const w of posortowane) {
      // Samo DOTKNIĘCIE końcami to nie nakładanie: trasa skręcająca w narożniku dzieli
      // z sąsiednią dokładnie jeden punkt i nic tam nikogo nie zasłania. Bez tego progu
      // każde spotkanie na rogu rozsuwało obie trasy, choć biegną w różne strony.
      if (w.t0 >= koniecGrupy - MIN_NAKLADANIE) domknij();
      grupa.push(w);
      koniecGrupy = Math.max(koniecGrupy, w.t1);
    }
    domknij();
  });

  /**
   * JEDEN PAS NA PROSTĄ, a nie na grupę nakładania.
   *
   * Pasy wychodzą z grup wyżej, a grupa PĘKA tam, gdzie odcinki już tylko się stykają
   * (patrz `MIN_NAKLADANIE`). Przebieg wzdłuż jednej ściany prawie nigdy nie jest przy
   * tym jednym odcinkiem: trasa idzie po obrysach dwóch sąsiadujących pomieszczeń i po
   * brzegach przejścia w drzwiach, więc dzieli się na kawałki stykające się końcami.
   * Jeden kabel dostawał przez to pas 0 na pierwszym kawałku ściany i pas 1 na drugim,
   * jeśli dopiero w połowie jej długości dołączał do niej inny obwód.
   *
   * Skutek był widoczny, a nie teoretyczny. Dwa współliniowe odcinki nie mają
   * przecięcia, więc `przecieciePrzesunietych` zwracało `null`, wierzchołek spadał na
   * pas dalszy, a drugi koniec odcinka zostawał na swoim — i cały przebieg kładł się
   * ukosem przez pół pomieszczenia. Na rzucie przykładowego mieszkania wychodziły
   * z tego 2 m skosu wzdłuż wspólnej ściany salonu i kuchni.
   *
   * Podnosimy do MAKSIMUM, nie obniżamy do minimum: zejście niżej wepchnęłoby trasę
   * pod tę, która na swoim kawałku ściany stoi bliżej muru zgodnie z priorytetem
   * (patrz `priorytetPasa`). Podniesienie odsuwa ją o kilka jednostek dalej od ściany
   * tam, gdzie i tak nikt obok niej nie biegnie — cena widoczna dopiero pod linijką,
   * w zamian za linię równoległą do muru na CAŁEJ długości.
   */
  linie.forEach((linia) => {
    const najwyzszy = new Map<string, number>();
    for (const w of linia.wpisy) {
      const pas = pasy.get(`${w.routeId}#${w.idx}`);
      if (pas) najwyzszy.set(w.routeId, Math.max(najwyzszy.get(w.routeId) ?? 0, pas.lane));
    }
    for (const w of linia.wpisy) {
      const id = `${w.routeId}#${w.idx}`;
      const pas = pasy.get(id);
      const lane = najwyzszy.get(w.routeId);
      if (pas && lane !== undefined && lane !== pas.lane) pasy.set(id, { ...pas, lane });
    }
  });

  /** Przesunięcie odcinka `i` trasy `r`. Pas ZEROWY zostaje dokładnie na policzonej
   *  trasie, a kolejne odsuwają się w głąb pomieszczenia — dzięki temu obwód
   *  o najwyższym priorytecie (gniazdowy) biegnie tak blisko muru, jak pozwala
   *  `ODSUNIECIE_TRASY`, a nie o pół wiązki dalej, jak przy rozsuwaniu w obie strony. */
  const przesuniecieOdcinka = (routeId: string, i: number) => {
    const pas = pasy.get(`${routeId}#${i}`);
    if (!pas) return { lane: 0, x: 0, y: 0 };
    return { lane: pas.lane, x: pas.kierunek.x * pas.lane * LANE_SPACING, y: pas.kierunek.y * pas.lane * LANE_SPACING };
  };

  const out = new Map<string, Point[]>();
  routes.forEach((r) => {
    /**
     * Wierzchołek to PRZECIĘCIE odsuniętych prostych sąsiednich odcinków — tak samo,
     * jak `wsunObrys` w routing.ts liczy narożniki wsuniętego obrysu.
     *
     * Dwie odrzucone wersje i powód, dla którego obie były złe:
     *
     * „Po odcinku" wypisywała każdy punkt dwa razy, z osobnym przesunięciem dla odcinka
     * przed i po nim — na każdym załamaniu robił się widoczny uskok.
     *
     * „Wierzchołek bierze przesunięcie dalszego z sąsiadów" uskok usuwała, ale kosztem
     * rzeczy gorszej: odcinek między wierzchołkiem odsuniętym a nieodsuniętym przestawał
     * być RÓWNOLEGŁY do swojego pierwowzoru, czyli do ściany, wzdłuż której miał biec.
     * Przy ścianie salonu różnica dwóch pasów rozkładała się na 70 jedn. długości i na
     * rzucie wychodził przewód przecinający pomieszczenie po skosie — mimo że trasa pod
     * spodem była policzona idealnie po ścianach.
     *
     * Przecięcie daje jedno i drugie naraz: linia zostaje ciągła (żadnych uskoków), a
     * każdy odcinek trzyma kierunek swojego pierwowzoru. Zmiana pasa zjada wtedy kawałek
     * odcinka DOCHODZĄCEGO, zamiast przekrzywiać ten biegnący wzdłuż muru.
     */
    const przesun = (p: Point, o: { x: number; y: number } | null): Point => ({ x: p.x + (o?.x ?? 0), y: p.y + (o?.y ?? 0) });
    const points = r.points.map((p, i) => {
      const przed = i > 0 ? przesuniecieOdcinka(r.id, i - 1) : null;
      const po = i < r.points.length - 1 ? przesuniecieOdcinka(r.id, i) : null;
      // Koniec trasy ma tylko jednego sąsiada, a odcinki skrajne i tak nie dostają pasa
      // (patrz pętla zbierająca), więc oba końce zostają dokładnie na urządzeniu.
      if (!przed || !po) return przesun(p, przed ?? po);
      // Ten sam pas po obu stronach — nie ma czego przecinać, wierzchołek jedzie w całości.
      if (przed.lane === po.lane && przed.x === po.x && przed.y === po.y) return przesun(p, po);
      const rog = przecieciePrzesunietych(r.points[i - 1], p, r.points[i + 1], przed, po);
      // Odcinki (prawie) równoległe albo zerowej długości nie dają narożnika — zostaje
      // dawne zachowanie, czyli pas dalszy z dwóch. Zdarza się to tylko przy nawrocie
      // trasy w tym samym korytarzu, gdzie skos i tak nie ma jak się rozciągnąć.
      return rog ?? przesun(p, po.lane > przed.lane ? po : przed);
    });
    out.set(r.id, points);
  });
  return out;
}

/**
 * Narożnik dwóch odcinków łamanej po odsunięciu każdego z nich o własny wektor:
 * przecięcie prostych `a→b + oPrzed` i `b→c + oPo`.
 *
 * `null`, gdy przecięcia nie ma albo nie da się mu ufać: odcinek zerowej długości
 * (brak kierunku), odcinki równoległe (wyznacznik przy zerze) i narożnik odjeżdżający
 * absurdalnie daleko — przy odcinkach prawie równoległych przecięcie ucieka w
 * nieskończoność i lepiej narysować dawny uskok niż kreskę przez pół rysunku.
 */
function przecieciePrzesunietych(
  a: Point,
  b: Point,
  c: Point,
  oPrzed: { x: number; y: number },
  oPo: { x: number; y: number }
): Point | null {
  const d1 = { x: b.x - a.x, y: b.y - a.y };
  const d2 = { x: c.x - b.x, y: c.y - b.y };
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 1e-9) return null;
  const p1 = { x: a.x + oPrzed.x, y: a.y + oPrzed.y };
  const p2 = { x: b.x + oPo.x, y: b.y + oPo.y };
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / det;
  const rog = { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
  const zasieg = 4 * (Math.hypot(oPrzed.x, oPrzed.y) + Math.hypot(oPo.x, oPo.y)) + 1;
  return Math.hypot(rog.x - b.x, rog.y - b.y) > zasieg ? null : rog;
}

/**
 * Normalna prostej skierowana W GŁĄB pomieszczenia, czyli OD ściany.
 *
 * Trasa biegnie już `ODSUNIECIE_TRASY` od muru, więc „która strona jest bliżej
 * ściany" nie da się rozstrzygnąć testem „czy punkt leży w pokoju" — oba przesunięcia
 * lądują w środku. Pytamy więc wprost o najbliższy punkt obrysu: kierunek do niego
 * to kierunek ściany, a pasy układamy w przeciwną stronę.
 *
 * Bez obrysów (trasy zapasowe Manhattan, plan z samych ścian) nie ma do czego się
 * odnieść — zostaje sama normalna, bo równoległe pasy mają sens także wtedy, tylko
 * strona jest umowna.
 */
function kierunekOdSciany(linia: { u: { x: number; y: number }; a: Point }, roomShapes: RoomShape[]): { x: number; y: number } {
  const n = { x: -linia.u.y, y: linia.u.x };
  let najblizszy: { p: Point; d: number } | null = null;
  for (const pokoj of roomShapes) {
    if (pokoj.points.length < 2) continue;
    const trafienie = nearestPointOnPolyline(linia.a, [...pokoj.points, pokoj.points[0]]);
    if (!trafienie) continue;
    const d = Math.hypot(trafienie.point.x - linia.a.x, trafienie.point.y - linia.a.y);
    if (!najblizszy || d < najblizszy.d) najblizszy = { p: trafienie.point, d };
  }
  if (!najblizszy) return n;
  const doSciany = { x: najblizszy.p.x - linia.a.x, y: najblizszy.p.y - linia.a.y };
  return n.x * doSciany.x + n.y * doSciany.y > 0 ? { x: -n.x, y: -n.y } : n;
}

/**
 * Nakłada ręczne poprawki tras (przeciągnięte przez użytkownika na planie, patrz
 * `routeOverrides` w store'ie i edycję uchwytów w DesignCanvas.tsx) na świeżo
 * policzone trasy.
 *
 * Poprawka trzyma WYŁĄCZNIE środkowe punkty (załamania) — bez pierwszego i
 * ostatniego, które zawsze biorą się z aktualnej pozycji rozdzielnicy/łącznika i
 * punktu/oprawy (dokładnie tak zaczyna/kończy się `route.points` w `buildCableRoutes`
 * i `buildControlRoutes`). Dzięki temu przesunięcie elementu na planie nie gubi
 * ręcznie ułożonych zagięć — koniec trasy po prostu podąża za nowym miejscem
 * elementu, tak jak przy trasie automatycznej.
 */
export function applyRouteOverrides(routes: CableRoute[], overrides: Record<string, Point[]>): CableRoute[] {
  return routes.map((r) => {
    const mid = overrides[r.id];
    if (!mid || mid.length === 0) return r;
    const points = [r.points[0], ...mid, r.points[r.points.length - 1]];
    return { ...r, points, lengthUnits: polylineLengthUnits(points) };
  });
}

/**
 * Zasięg symbolu w jednostkach planu — o tyle trasa ma zatrzymać się przed jego
 * środkiem.
 *
 * Ta sama liczba, której `snapElementToWall` używa do odsunięcia symbolu od ściany
 * (`zasiegPrzyscienny`), przemnożona przez skalę renderu. Dzięki temu przewód
 * zatrzymuje się dokładnie na krawędzi, którą widać na rysunku — także wtedy, gdy
 * użytkownik pociągnie suwak „Rozmiar elementów".
 */
function promienSymbolu(type: ElementType, skala: number): number {
  return zasiegPrzyscienny(type) * skala;
}

/** Punkt na łamanej, oddalony o `odleglosc` od jej KOŃCA, mierząc wzdłuż niej.
 *  Zwraca też indeks ostatniego punktu przed nim — do przycięcia ogona. */
function cofnijSieWzdluz(points: Point[], odleglosc: number): { punkt: Point; indeks: number } | null {
  let zostalo = odleglosc;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    const dlug = Math.hypot(b.x - a.x, b.y - a.y);
    if (dlug >= zostalo) {
      const t = zostalo / dlug;
      return { punkt: { x: b.x - (b.x - a.x) * t, y: b.y - (b.y - a.y) * t }, indeks: i - 1 };
    }
    zostalo -= dlug;
  }
  // Cała łamana jest krótsza niż żądane cofnięcie — nie ma czego przycinać.
  return null;
}

/**
 * Zakończenie trasy przy oprawie sufitowej: przycięcie do krawędzi symbolu, BEZ ukosu.
 *
 * Trasa dochodziła dotąd do punktu `{x, y}` elementu, czyli przecinała cały symbol
 * i kończyła się w jego środku. Na rysunku wyglądało to tak, jakby przewód przebijał
 * oprawę, a nie do niej dochodził.
 *
 * Przycięcie liczone jest WZDŁUŻ ŁAMANEJ, nie w linii prostej do środka: skracamy
 * drogę dokładnie o tyle, ile zajmuje symbol, niezależnie od tego, pod jakim kątem
 * przewód nadchodzi.
 *
 * Kąt PROSTY, nie ukos — i to jest tu istota. Wcześniej ostatni odcinek ścinał zakręt
 * i wchodził do oprawy skosem; do osprzętu przyściennego tak właśnie ma być (patrz
 * `zakonczPrzyNozce`), ale oprawa wisi pod stropem i przewód schodzi do niej prosto
 * od strony, z której nadszedł. Ukos w tym miejscu opisywał przebieg, którego nikt
 * nie ułoży.
 */
export function przytnijDoKrawedzi(points: Point[], promien: number): Point[] {
  if (points.length < 2 || promien <= 0) return points;
  const koniec = cofnijSieWzdluz(points, promien);
  // Cała trasa mieści się w zasięgu symbolu — zostawiamy ją, żeby nie zniknęła.
  if (!koniec) return points;
  return [...points.slice(0, koniec.indeks + 1), koniec.punkt];
}

/**
 * Zakończenie trasy przy osprzęcie PRZYŚCIENNYM: odczep pod 45° do nóżki symbolu.
 *
 * Trasa biegnie równolegle do ściany, kilka jednostek od niej (`ODSUNIECIE_TRASY`),
 * a gniazdko stoi trzonkiem do muru. Doprowadzenie przewodu do ŚRODKA symbolu
 * wyglądało tak, jakby kabel wchodził gniazdku w łuk — czyli od strony pomieszczenia,
 * a nie od strony puszki. Przewód ma trafić w koniec trzonka (`cel`).
 *
 *      ─────E╮              E — miejsce, w którym trasa schodzi z „pasa" przy ścianie
 *             ╲             odcinek E→cel ma tyle samo wzdłuż co w poprzek trasy,
 *   ══════════◗cel          więc zawsze wychodzi dokładnie 45°
 *
 * KIEDY ten ukos w ogóle powstaje: tylko wtedy, gdy symbol sięga w głąb pokoju DALEJ
 * niż pas przewodów, czyli gdy trasa mija nóżkę i musi do niej zawrócić. Po zmniejszeniu
 * symboli (`BASE_ELEMENT_SCALE`) gniazdo mieści się między pasem a murem, `cofnij`
 * wychodzi ujemne i przewód dochodzi do nóżki WPROST — pod kątem prostym do ściany,
 * czyli tak samo jak do rozdzielnicy. Funkcja obsługuje oba przypadki jednym wzorem
 * i nie trzeba jej o tym uprzedzać.
 *
 * Kąt bierze się z geometrii, nie ze stałej: `E` odsuwamy od rzutu celu na trasę
 * o tyle, ile wynosi odległość celu OD tej trasy. Dzięki temu ukos zostaje pod 45°
 * niezależnie od tego, jak daleko od ściany biegnie pas przewodów i czy —
 * przy kilku trasach w wiązce — o `LANE_SPACING` dalej.
 */
export function zakonczPrzyNozce(points: Point[], cel: Point): Point[] {
  if (points.length < 2) return [...points, cel];
  const koniec = points[points.length - 1];
  const przed = points[points.length - 2];
  const dx = koniec.x - przed.x;
  const dy = koniec.y - przed.y;
  const dlug = Math.hypot(dx, dy);
  // Odcinek zerowej długości nie ma kierunku — nie ma jak rozłożyć dojścia na
  // „wzdłuż" i „w poprzek", więc zostaje samo doprowadzenie do celu.
  if (dlug === 0) return [...points, cel];
  const u = { x: dx / dlug, y: dy / dlug };
  const v = { x: cel.x - koniec.x, y: cel.y - koniec.y };
  const wzdluz = v.x * u.x + v.y * u.y;
  const wPoprzek = Math.hypot(v.x - u.x * wzdluz, v.y - u.y * wzdluz);
  const cofnij = wPoprzek - wzdluz;
  /**
   * Cel leży już PRZED końcem trasy (albo dokładnie na jej przedłużeniu) — ukos
   * wypadłby za elementem, więc przewód dochodzi wprost.
   *
   * Środek symbolu wypada wtedy NA odcinku „poprzedni → nóżka", czyli jest punktem
   * pośrodku prostej. Zostawiony w łamanej dzieli ją na dwa odcinki, a te przy
   * rozsuwaniu wiązki (`spreadOverlappingRoutes`) dostają osobne przesunięcia
   * i przy elemencie robi się mikroschodek. Dlatego go tu porzucamy.
   */
  if (cofnij <= 0) return [...points.slice(0, wPoprzek < 0.001 ? -1 : undefined), cel];
  const start = cofnijSieWzdluz(points, cofnij);
  if (!start) return [...points, cel];
  return [...points.slice(0, start.indeks + 1), start.punkt, cel];
}

/** Tyle o elemencie, ile potrzeba, żeby wiedzieć, GDZIE przy nim urwać przewód. */
interface Zakonczenie {
  type: ElementType;
  /** Obrót symbolu [stopnie] — z niego wynika, w którą stronę patrzy nóżka. */
  rotation?: number;
  end: Point;
}

/**
 * Doprowadzenie przewodu do jednego końca trasy — nóżką albo krawędzią.
 *
 * Osprzęt przyścienny (gniazda, łączniki, kinkiety) dostaje odczep pod 45° do punktu
 * styku ze ścianą: tam siedzi puszka i stamtąd naprawdę wchodzi kabel. Reszta —
 * punkt sufitowy, czujnik dymu — wisi na środku pomieszczenia i nie ma wyróżnionej
 * strony, więc dla niej zostaje przycięcie łamanej do krawędzi symbolu.
 */
function zakonczPrzyElemencie(points: Point[], el: Zakonczenie, skala: number): Point[] {
  const cel = punktPrzyscienny({ ...el, x: el.end.x, y: el.end.y }, skala);
  return cel ? zakonczPrzyNozce(points, cel) : przytnijDoKrawedzi(points, promienSymbolu(el.type, skala));
}

/** Rodzaj obwodu wg roli elementów — mapowanie na kategorie używane w doborze. */
export function kindForElements(elements: InstallationElement[]): "oswietlenie" | "gniazda" | "dedykowany" {
  const roles = elements.map((e) => ELEMENT_TYPES[e.type]?.role);
  if (roles.some((r) => r === "ev" || r === "socket3f" || r === "dedicated")) return "dedykowany";
  if (roles.some((r) => r === "light")) return "oswietlenie";
  return "gniazda";
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
