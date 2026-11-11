import type { InstallationElement, RoomShape, RoomType } from "@/types";
import { ELEMENT_TYPES, fixtureSizeM, NO_ROOM, SANITARY_FIXTURES } from "@/lib/elements";
import { guessRoomType, ROOM_TYPE_LABELS } from "@/lib/design";
import { distanceToRect, obrysyNachodza } from "@/lib/geometry";
import { isLightControl, isLightPoint } from "@/lib/lightGroups";

/**
 * Sprawdzenie rzutu — odpowiednik `computeSelectivity` z rozdzielnicy, tylko dla planu.
 *
 * Powód powstania: strefy ochronne w łazience były do tej pory czystą DEKORACJĄ.
 * `computeSanitaryZones` rysowało okręgi 0,65 / 1,25 m wokół wanny i na tym się
 * kończyło — nikt nie sprawdzał, co w nich stoi, więc gniazdo postawione tuż przy
 * wannie nie wywoływało żadnej reakcji aplikacji. Rozdzielnica miała diagnostykę
 * od dawna; rzut, na którym wszystko się zaczyna, nie miał żadnej.
 *
 * Poziomy i kształt wyniku są celowo TE SAME co w `SelectivityFinding`, żeby oba
 * widoki dało się czytać tak samo i żeby renderowanie mogło być bliźniacze.
 * Różnica jest jedna: tutaj spostrzeżenie zna `elementIds`, więc da się z listy
 * skoczyć na plan i zobaczyć, o który element chodzi.
 *
 * Zakres: JEDNA kondygnacja. Strefy, obwody i grupy sterowania i tak nie sięgają
 * między piętra (patrz `computeLightGroups`, `buildCableRoutes`), a mieszanie
 * kondygnacji w jednej liście dawałoby spostrzeżenia o rzeczach poza ekranem —
 * ten sam błąd, który popełniało zaznaczenie przed poprawką w DesignTab.
 */

export type PlanIssueLevel = "error" | "warn" | "info" | "ok";

export interface PlanIssue {
  /**
   * Stabilny identyfikator reguły. Nie do pokazania użytkownikowi — służy testom
   * (asercja na regule, nie na jej tekście) i jako klucz React zamiast indeksu,
   * żeby zmiana kolejności nie mieszała podświetleń.
   */
  rule: string;
  level: PlanIssueLevel;
  title: string;
  detail: string;
  /** Elementy, których spostrzeżenie dotyczy — klik w nie zaznacza je na planie.
   *  Puste dla regul mowiacych o BRAKU czegos (nie ma czego pokazać). */
  elementIds: string[];
  /** Pomieszczenia, których spostrzeżenie dotyczy — „Pokaż na planie" zaznacza
   *  pierwsze z nich (zaznaczenie obejmuje jedno pomieszczenie naraz). */
  roomIds?: string[];
}

/** Role osprzętu, który w strefie ochronnej jest problemem. Rozbite na dwie listy,
 *  bo norma traktuje je różnie: w strefie 2 gniazda dalej są zabronione, a łączniki
 *  już nie (patrz reguły niżej). */
const ROLE_GNIAZDA = new Set(["socket", "socketWet", "socket3f", "dedicated", "ev"]);
const ROLE_LACZNIKI = new Set(["control"]);

/** Pomieszczenia, w ktorych gniazdo musi byc bryzgoszczelne. WĘŻSZE niż
 *  `isWetRoomName` uzywane przy doborze przekroju: tamta lista obejmuje tez
 *  kuchnie (bo tam chodzi o grupowanie obwodow), a zwykle gniazdo w kuchni jest
 *  najzupelniej normalne. Wymóg IP44 dotyczy lazienki i pralni. */
const POMIESZCZENIA_IP44: readonly RoomType[] = ["lazienka", "pralnia"];

/** Pomieszczenia z odbiornikami spalającymi paliwo — tam czujnik czadu ma sens. */
const POMIESZCZENIA_CZAD: readonly RoomType[] = ["kotlownia", "garaz"];

export interface PlanCheckInput {
  /** Elementy JEDNEJ kondygnacji. */
  elements: InstallationElement[];
  /** Obrysy pomieszczeń tej samej kondygnacji. */
  roomShapes: RoomShape[];
  /** Metrów na jednostkę planu. `null` wyłącza reguły metryczne — patrz niżej. */
  metersPerUnit: number | null;
}

function typOf(r: RoomShape): RoomType {
  return r.type ?? guessRoomType(r.name);
}

function lista(nazwy: string[], limit = 4): string {
  return nazwy.length <= limit
    ? nazwy.join(", ")
    : `${nazwy.slice(0, limit).join(", ")} i ${nazwy.length - limit} więcej`;
}

function opis(e: InstallationElement): string {
  const label = ELEMENT_TYPES[e.type]?.label ?? e.type;
  return e.room === NO_ROOM ? label : `${label} (${e.room})`;
}

/**
 * Podsumowanie do nagłówka karty: „1 błąd · 3 uwagi", albo „bez zastrzeżeń".
 *
 * Liczy WYŁĄCZNIE to, co wymaga reakcji — `info` i `ok` są treścią listy, ale nie są
 * problemem i doliczanie ich do licznika robiłoby z czystego rzutu „3 uwagi".
 */
export function podsumowanieProblemow(issues: PlanIssue[]): string {
  const bledy = issues.filter((i) => i.level === "error").length;
  const uwagi = issues.filter((i) => i.level === "warn").length;
  if (bledy === 0 && uwagi === 0) return "bez zastrzeżeń";
  const czesci: string[] = [];
  if (bledy > 0) czesci.push(`${bledy} ${bledy === 1 ? "błąd" : bledy < 5 ? "błędy" : "błędów"}`);
  if (uwagi > 0) czesci.push(`${uwagi} ${uwagi === 1 ? "uwaga" : uwagi < 5 ? "uwagi" : "uwag"}`);
  return czesci.join(" · ");
}

/**
 * Stan sprawdzenia w jednym słowie — do paska stanu pod płótnem.
 *
 * Karta „Sprawdzenie rzutu" stoi POD edytorem, a edytor zajmuje całą wysokość okna:
 * przy 1440×900 zaczynała się na ok. 945 px, więc ostrzeżenie o braku czujnika czadu
 * w kotłowni było widać dopiero po przewinięciu pod rysunek, a w pełnym ekranie wcale.
 * Pasek stanu jest zawsze w kadrze.
 *
 * Tekst jest ZAWSZE, także przy czystym rzucie: pozycja, która pojawia się dopiero
 * z pierwszą uwagą, mogłaby zawinąć pasek, a jego wysokość idzie prosto w wysokość
 * płótna (patrz `zapasPod` w DesignTab.tsx) — rzut przeskakiwałby spod kursora
 * dokładnie w chwili stawiania elementu.
 */
export function stanSprawdzenia(issues: PlanIssue[]): {
  poziom: "error" | "warn" | "ok" | "pusto";
  /** Pełne podsumowanie — do dymka i czytnika ekranu. */
  tekst: string;
  /** Wersja do paska: sam najpoważniejszy rodzaj. Pasek ma policzoną szerokość
   *  (patrz komentarz w EditorStatusBar), „1 błąd · 2 uwagi" by go zawijało. */
  krotko: string;
} {
  const bledy = issues.filter((i) => i.level === "error").length;
  const uwagi = issues.filter((i) => i.level === "warn").length;
  if (bledy > 0)
    return { poziom: "error", tekst: podsumowanieProblemow(issues), krotko: `${bledy} ${bledy === 1 ? "błąd" : bledy < 5 ? "błędy" : "błędów"}` };
  if (uwagi > 0)
    return { poziom: "warn", tekst: podsumowanieProblemow(issues), krotko: `${uwagi} ${uwagi === 1 ? "uwaga" : uwagi < 5 ? "uwagi" : "uwag"}` };
  if (issues.some((i) => i.rule === "pusto")) return { poziom: "pusto", tekst: "nic do sprawdzenia", krotko: "" };
  return { poziom: "ok", tekst: "bez zastrzeżeń", krotko: "bez uwag" };
}

export function checkPlan({ elements, roomShapes, metersPerUnit }: PlanCheckInput): PlanIssue[] {
  const out: PlanIssue[] = [];

  if (elements.length === 0 && roomShapes.length === 0) {
    return [
      {
        rule: "pusto",
        level: "info",
        title: "Na tej kondygnacji nic jeszcze nie ma",
        detail: "Obrysuj pomieszczenia i rozstaw elementy — sprawdzenie ruszy samo, gdy będzie co sprawdzać.",
        elementIds: [],
      },
    ];
  }

  // --- strefy ochronne ---------------------------------------------------------
  /**
   * Reguły metryczne wymagają SKALI. Bez niej `computeSanitaryZones` podstawia
   * zastępczy przelicznik (patrz `FALLBACK_MPU`), żeby w ogóle było co narysować —
   * ale sprawdzanie odległości wyliczonych ze zmyślonej skali dawałoby ostrzeżenia
   * wzięte z sufitu i, co gorsza, milczenie tam, gdzie problem naprawdę jest.
   * Lepiej powiedzieć wprost, że tej części nie sprawdzamy.
   */
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : null;
  const sanitarne = elements.filter((e) => SANITARY_FIXTURES[e.type]);

  if (mpu === null && sanitarne.length > 0) {
    out.push({
      rule: "strefy-bez-skali",
      level: "info",
      title: "Strefy ochronne niesprawdzone — brak skali",
      detail:
        "Na rzucie jest wyposażenie sanitarne, ale bez skalibrowanej skali nie da się zmierzyć odległości w metrach. Ustaw skalę (narzędzie „Kalibracja skali”), żeby sprawdzić rozmieszczenie osprzętu względem stref.",
      elementIds: sanitarne.map((e) => e.id),
    });
  }

  if (mpu !== null && sanitarne.length > 0) {
    interface Trafienie {
      el: InstallationElement;
      zrodlo: string;
    }
    const strefa1: Trafienie[] = [];
    const strefa2: Trafienie[] = [];
    const przyUmywalce: Trafienie[] = [];

    /**
     * Pętla idzie po ELEMENTACH, a przybory są w środku — nie odwrotnie. Element
     * potrafi być blisko dwóch przyborów naraz (wanna i umywalka stoją obok
     * siebie), a wtedy ma trafić na JEDNĄ listę, tę od ostrzejszej strefy. Przy
     * pętli po przyborach to samo gniazdo lądowało w dwóch spostrzeżeniach
     * jednocześnie i użytkownik dostawał podwojoną listę zamiast jednej diagnozy.
     *
     * Odległość mierzymy od KRAWĘDZI przyboru (`distanceToRect`), bo tak liczy je
     * norma: strefa 1 to przestrzeń nad samą wanną, a strefa 2 sięga 0,6 m poza jej
     * obrys. Stąd `odlM === 0` (punkt nad wanną) oznacza strefę 1.
     *
     * Umywalka jest liczona osobno, bo nie tworzy stref 701 (`hasZone1: false`) —
     * obowiązuje przy niej praktyczny odstęp. Wrzucenie jej do tego samego worka co
     * wanna dawało komunikat o transformatorze separacyjnym przy umywalce, czyli
     * poradę nie na temat.
     */
    for (const e of elements) {
      const rola = ELEMENT_TYPES[e.type]?.role;
      if (!rola) continue;
      const gniazdo = ROLE_GNIAZDA.has(rola);
      const lacznik = ROLE_LACZNIKI.has(rola);
      if (!gniazdo && !lacznik) continue;

      let w1: string | null = null;
      let w2: string | null = null;
      let wU: string | null = null;
      for (const s of sanitarne) {
        const f = SANITARY_FIXTURES[s.type]!;
        // Wymiary KONKRETNEGO przyboru, nie katalogowe: użytkownik mógł podać własne
        // (patrz `fixtureSizeM`), a wtedy rysunek pokazuje jeden obrys, a strefa liczy
        // się od drugiego — czyli sprawdzenie kłamie dokładnie tam, gdzie ma nie kłamać.
        const wymiary = fixtureSizeM(s)!;
        // Wymiary w metrach, więc i punkt przeliczamy na metry — inaczej trzeba by
        // dzielić każdy bok przez `mpu` przy każdym porównaniu.
        const odlM = distanceToRect(
          { x: e.x * mpu, y: e.y * mpu },
          s.x * mpu,
          s.y * mpu,
          wymiary.widthM,
          wymiary.depthM,
          s.rotation ?? 0
        );
        if (f.hasZone1) {
          if (odlM === 0) w1 = w1 ?? f.label;
          else if (odlM <= f.zone2M && gniazdo) w2 = w2 ?? f.label;
        } else if (odlM <= f.zone2M && gniazdo) {
          wU = wU ?? f.label;
        }
      }
      if (w1) strefa1.push({ el: e, zrodlo: w1 });
      else if (w2) strefa2.push({ el: e, zrodlo: w2 });
      else if (wU) przyUmywalce.push({ el: e, zrodlo: wU });
    }

    if (strefa1.length > 0) {
      out.push({
        rule: "strefa1",
        level: "error",
        title: "Osprzęt w strefie 1 (nad wanną / brodzikiem)",
        detail: `${lista(strefa1.map((w) => `${opis(w.el)} — przy: ${w.zrodlo}`))}. Wg PN-HD 60364-7-701 w strefie 1 nie wolno montować gniazd ani zwykłych łączników; dopuszczalne są wyłącznie odbiorniki przystosowane do tej strefy, zasilane SELV 12 V AC / 30 V DC. Przesuń osprzęt poza strefę albo zmień sposób zasilania.`,
        elementIds: strefa1.map((w) => w.el.id),
      });
    }

    if (strefa2.length > 0) {
      out.push({
        rule: "strefa2",
        level: "warn",
        title: "Gniazdo w strefie 2",
        detail: `${lista(strefa2.map((w) => `${opis(w.el)} — przy: ${w.zrodlo}`))}. W strefie 2 gniazda są dopuszczone tylko jako golarkowe, zasilane przez transformator separacyjny, a osprzęt musi mieć co najmniej IPX4. Zwykłe gniazdo przesuń poza strefę.`,
        elementIds: strefa2.map((w) => w.el.id),
      });
    }

    if (przyUmywalce.length > 0) {
      out.push({
        rule: "umywalka",
        level: "warn",
        title: "Gniazdo za blisko umywalki",
        detail: `${lista(przyUmywalce.map((w) => opis(w.el)))} — mniej niż 0,6 m od umywalki. Zachowaj ten odstęp w poziomie albo zastosuj osprzęt bryzgoszczelny przystosowany do tego miejsca.`,
        elementIds: przyUmywalce.map((w) => w.el.id),
      });
    }
  }

  // --- IP44 w pomieszczeniach mokrych ------------------------------------------
  const mokreNazwy = new Set(roomShapes.filter((r) => POMIESZCZENIA_IP44.includes(typOf(r))).map((r) => r.name));
  const bezIp = elements.filter((e) => e.type === "gniazdko" && mokreNazwy.has(e.room));
  if (bezIp.length > 0) {
    out.push({
      rule: "ip44",
      level: "warn",
      title: "Zwykłe gniazdo w pomieszczeniu wilgotnym",
      detail: `${lista(bezIp.map(opis))} — w łazience i pralni osprzęt powinien być bryzgoszczelny (min. IP44). Podmień na „Gniazdko hermetyczne” albo potwierdź, że w tym miejscu wilgoć nie występuje.`,
      elementIds: bezIp.map((e) => e.id),
    });
  }

  // --- oświetlenie i sterowanie -------------------------------------------------
  // Grupy sterowania działają WYŁĄCZNIE w obrębie jednego pomieszczenia (patrz
  // lib/lightGroups.ts), więc te dwie reguły sprawdzają dokładnie to samo, na czym
  // stoi tamten automat: czy w pokoju jest komplet „jest czym świecić i czym włączyć”.
  const bezSwiatla: string[] = [];
  const bezLacznika: string[] = [];
  const lacznikBezLampy: string[] = [];
  for (const r of roomShapes) {
    const wPokoju = elements.filter((e) => e.room === r.name);
    const lampy = wPokoju.filter(isLightPoint);
    const laczniki = wPokoju.filter(isLightControl);
    if (lampy.length === 0) bezSwiatla.push(r.name);
    else if (laczniki.length === 0) bezLacznika.push(r.name);
    if (lampy.length === 0 && laczniki.length > 0) lacznikBezLampy.push(r.name);
  }

  if (bezSwiatla.length > 0) {
    out.push({
      rule: "brak-swiatla",
      level: "warn",
      title: "Pomieszczenie bez punktu świetlnego",
      detail: `${lista(bezSwiatla)} — nie ma tam ani punktu sufitowego, ani kinkietu, ani taśmy LED. Jeśli to celowe (np. pomieszczenie techniczne oświetlone z zewnątrz), zignoruj.`,
      elementIds: [],
    });
  }

  if (bezLacznika.length > 0) {
    out.push({
      rule: "brak-lacznika",
      level: "warn",
      title: "Oświetlenie bez łącznika w tym samym pomieszczeniu",
      detail: `${lista(bezLacznika)} — automatyczne grupowanie sterowania działa tylko w obrębie jednego pomieszczenia, więc te oprawy nie dostaną numeru grupy i trafią do rozdzielnicy bez przypisanego sterowania. Dostaw łącznik albo czujnik ruchu.`,
      elementIds: [],
    });
  }

  if (lacznikBezLampy.length > 0) {
    out.push({
      rule: "lacznik-bez-lampy",
      level: "warn",
      title: "Łącznik bez oprawy do sterowania",
      detail: `${lista(lacznikBezLampy)} — stoi tam łącznik, ale nie ma punktu świetlnego, którym mógłby sterować. Albo brakuje oprawy, albo łącznik jest w złym pomieszczeniu.`,
      elementIds: [],
    });
  }

  // --- nachodzące pomieszczenia -------------------------------------------------
  /**
   * Obrysy, które zachodzą na siebie (audyt 5.11.2026, B8). Wspólna ściana sąsiadów się
   * nie liczy — patrz `obrysyNachodza`. Skutki są dwa i oba ciche: element w części
   * wspólnej należy do jednego z pokoi według kolejności rysowania (nie wiadomo
   * którego), a powierzchnia kondygnacji liczy część wspólną podwójnie.
   */
  const pary: [RoomShape, RoomShape][] = [];
  for (let i = 0; i < roomShapes.length; i++) {
    for (let j = i + 1; j < roomShapes.length; j++) {
      if (obrysyNachodza(roomShapes[i].points, roomShapes[j].points)) pary.push([roomShapes[i], roomShapes[j]]);
    }
  }
  if (pary.length > 0) {
    const pokoje = [...new Set(pary.flat())];
    out.push({
      rule: "pomieszczenia-nachodza",
      level: "warn",
      title: pary.length === 1 ? "Pomieszczenia nachodzą na siebie" : `Pomieszczenia nachodzą na siebie (${pary.length} pary)`,
      detail: `${lista(pary.map(([a, b]) => `${a.name} i ${b.name}`), 3)} — obrysy zachodzą na siebie. Osprzęt w części wspólnej trafi tylko do jednego z nich, a powierzchnia kondygnacji policzy tę część dwa razy. Przeciągnij narożniki tak, żeby pokoje stykały się ścianą.`,
      elementIds: [],
      roomIds: pokoje.map((r) => r.id),
    });
  }

  // --- elementy bez pomieszczenia ----------------------------------------------
  const niczyje = elements.filter((e) => e.room === NO_ROOM);
  if (niczyje.length > 0) {
    out.push({
      rule: "bez-pomieszczenia",
      level: "warn",
      title: `Elementy poza obrysem pomieszczenia (${niczyje.length})`,
      detail:
        "Te elementy nie leżą w żadnym narysowanym pomieszczeniu, więc rozdzielnica zbierze je w jeden wspólny obwód „Bez pomieszczenia”, a strefa mokra nie zadziała przy doborze przekroju. Obrysuj brakujące pomieszczenie albo przesuń elementy do środka.",
      elementIds: niczyje.map((e) => e.id),
    });
  }

  // --- rozdzielnica --------------------------------------------------------------
  // `info`, nie `warn`: na piętrze rozdzielnicy zwykle NIE MA i to jest normalne.
  // Wart odnotowania jest tylko skutek — brak punktu odniesienia dla tras zasilania.
  if (elements.length > 0 && !elements.some((e) => e.type === "rozdzielnica")) {
    out.push({
      rule: "brak-rozdzielnicy",
      level: "info",
      title: "Brak rozdzielnicy na tej kondygnacji",
      detail:
        "Trasy zasilania liczą się od rozdzielnicy postawionej na TEJ kondygnacji, więc na razie zostaną puste, a długości przewodów w kosztorysie będą oszacowane ryczałtowo. Przy jednej rozdzielnicy w budynku to normalne dla pięter.",
      elementIds: [],
    });
  }

  // --- czujnik czadu -------------------------------------------------------------
  const czadowe = roomShapes.filter((r) => POMIESZCZENIA_CZAD.includes(typOf(r)));
  if (czadowe.length > 0 && !elements.some((e) => e.type === "czujnikCzadu")) {
    out.push({
      rule: "brak-czujnika-czadu",
      level: "warn",
      title: "Kotłownia lub garaż bez czujnika czadu",
      detail: `${lista(czadowe.map((r) => `${r.name} (${ROOM_TYPE_LABELS[typOf(r)]})`))} — przy odbiornikach spalających paliwo czujnik tlenku węgla jest podstawowym zabezpieczeniem życia. Dołóż go z sekcji „Teletechnika”.`,
      elementIds: [],
    });
  }

  // --- zdublowany osprzęt (R14 z audytu Instalacji 11.11.2026) -------------------
  // Litera wypustu AGD i jego opis (`note`, nazwa odbiornika) mówią, KTÓRY to odbiornik,
  // a każdy wypust to osobny obwód. Dwa wypusty z tą samą literą I tym samym opisem
  // w jednej kuchni to prawie zawsze pomyłka (podwójne wklejenie, szablon), która
  // dokłada zbędny obwód B16 do rozdzielnicy i kosztorysu. Ta sama litera przy różnych
  // opisach („Zmywarka", „Piekarnik") to dwa różne odbiorniki — tak je rozróżnia też
  // nazwa obwodu w `computeCircuits`.
  const agdPoPokoju = new Map<string, InstallationElement[]>();
  for (const e of elements) {
    if (e.type !== "wypustAGD") continue;
    const k = `${e.roomId ?? e.room}|${e.agdLetter || "A"}|${e.note.trim().toLowerCase()}`;
    agdPoPokoju.set(k, [...(agdPoPokoju.get(k) ?? []), e]);
  }
  const powtorzoneAgd = [...agdPoPokoju.values()].filter((g) => g.length > 1);
  if (powtorzoneAgd.length > 0) {
    out.push({
      rule: "agd-ta-sama-litera",
      level: "warn",
      title: "Wypusty AGD z tą samą literą w jednym pomieszczeniu",
      detail: `${lista(powtorzoneAgd.map((g) => `${g[0].room}: ${g.length} × (${g[0].agdLetter || "A"}${g[0].note.trim() ? `, ${g[0].note.trim()}` : ""})`))} — każdy wypust to osobny obwód w rozdzielnicy. Jeśli to dwa różne odbiorniki, nadaj im różne litery albo opisy; jeśli to pomyłka, usuń nadmiarowy.`,
      elementIds: powtorzoneAgd.flat().map((e) => e.id),
    });
  }

  // Dwa takie same symbole w jednym punkcie — na rysunku wyglądają jak jeden, a liczą
  // się podwójnie w obwodach, zestawieniu i kosztorysie.
  const jedenNaDrugim: InstallationElement[] = [];
  elements.forEach((a, i) => {
    if (jedenNaDrugim.includes(a)) return;
    const kopie = elements.slice(i + 1).filter((b) => b.type === a.type && Math.hypot(a.x - b.x, a.y - b.y) < 0.5);
    if (kopie.length) jedenNaDrugim.push(a, ...kopie.filter((b) => !jedenNaDrugim.includes(b)));
  });
  if (jedenNaDrugim.length > 0) {
    out.push({
      rule: "elementy-jeden-na-drugim",
      level: "warn",
      title: `Elementy postawione jeden na drugim (${jedenNaDrugim.length})`,
      detail: `${lista([...new Set(jedenNaDrugim.map(opis))])} — w tym samym miejscu stoi kilka takich samych symboli. Na rysunku widać jeden, ale w obwodach i kosztorysie liczą się wszystkie. Usuń nadmiarowe albo rozsuń je.`,
      elementIds: jedenNaDrugim.map((e) => e.id),
    });
  }

  // --- podsumowanie ---------------------------------------------------------------
  // Ten sam wzorzec co w rozdzielnicy: brak błędów i ostrzeżeń to też wynik i trzeba
  // go pokazać, inaczej pusta lista czyta się jak niedziałające narzędzie.
  if (!out.some((o) => o.level === "error" || o.level === "warn")) {
    out.push({
      rule: "ok",
      level: "ok",
      title: "Nie wykryto problemów",
      detail:
        "Przyjęte reguły są spełnione. Sprawdzenie jest orientacyjne i nie zastępuje projektu ani odbioru przez osobę z uprawnieniami.",
      elementIds: [],
    });
  }

  return out;
}
