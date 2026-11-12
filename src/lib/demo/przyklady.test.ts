import { describe, it, expect, beforeAll } from "vitest";
import { PRZYKLADY, zbudujPrzyklad } from "./index";
import { nearestPointOnPolyline, pointInPolygon, polygonAreaM2 } from "@/lib/geometry";
import { scaleOf, MANUAL_DRAW_SCALE_MPU, guessRoomType, typPomieszczenia } from "@/lib/design";
import { computeCircuits, computeRcdGroups } from "@/lib/panel/circuits";
import { buildCableRoutes, estimateRoutesByFloor, findPanel, findPanels, spreadOverlappingRoutes } from "@/lib/panel/loads";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";
import { ODSUNIECIE_TRASY } from "@/lib/panel/routing";
import { computeCosts } from "@/lib/costs";
import { gniazdoPodwojne, SANITARY_FIXTURES } from "@/lib/elements";
import { glyphBoxSize } from "@/lib/glyphs";
import { checkPlan } from "@/lib/planCheck";
import type { ProjectPayload } from "@/store/useProjectStore";
import type { InstallationElement, RoomType } from "@/types";

/**
 * Projekt przykładowy to DANE wpisane ręcznie, więc łatwo je po cichu popsuć —
 * przesunięty narożnik albo literówka w nazwie pomieszczenia nie wywalają niczego,
 * tylko sprawiają, że pierwsze, co widzi nowy użytkownik, jest bez sensu.
 *
 * Te testy pilnują tego, co w KAŻDYM przykładzie z rejestru musi być PRAWDĄ, a nie
 * tego, jak dokładnie jest narysowany — żeby dało się swobodnie przestawiać osprzęt,
 * nie przepisując przy tym testów. Stąd pętla po `PRZYKLADY`: kolejny przykład dostaje
 * ten sam komplet reguł za darmo, bez pisania nowego pliku testów.
 */
describe.each(PRZYKLADY.map((x) => [x.id] as const))('przykład „%s"', (id) => {
  let payload: ProjectPayload;
  beforeAll(async () => {
    payload = await zbudujPrzyklad(id);
  });

  it("obiecuje metraż w nazwie i tyle naprawdę ma", () => {
    // Nazwa projektu jest obietnicą złożoną na ekranie startowym („mieszkanie 70 m²")
    // — a powierzchnia pokazuje się potem w pasku stanu pod rysunkiem. Rozjazd tych
    // dwóch liczb to jedyna rzecz, którą użytkownik na tym ekranie może SPRAWDZIĆ.
    const mpu = scaleOf(payload.scales, payload.activeFloorId)!;
    const metraz = payload.draft.roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
    const zNazwy = Number(payload.projectName.replace(/[^\d,]/g, "").replace(",", "."));
    expect(zNazwy, payload.projectName).toBeCloseTo(metraz, 0);
  });

  it("przechodzi własne sprawdzenie rzutu bez błędów i uwag na każdej kondygnacji", () => {
    // R10 z audytu Instalacji 11.11.2026: przykład, który ma pokazać, co aplikacja
    // potrafi, witał nowego użytkownika ostrzeżeniem o własnym błędzie.
    for (const f of payload.floors) {
      const issues = checkPlan({
        elements: payload.draft.elements.filter((e) => e.floor === f.id),
        roomShapes: payload.draft.roomShapes.filter((r) => r.floor === f.id),
        metersPerUnit: scaleOf(payload.scales, f.id),
      });
      const problemy = issues.filter((i) => i.level === "error" || i.level === "warn").map((i) => `${i.title}: ${i.detail}`);
      expect(problemy, f.name).toEqual([]);
    }
  });

  it("element LEŻY w pomieszczeniu, które ma wpisane — nie tylko je nazywa", () => {
    /**
     * Pole `room` to wolny tekst, a pozycję elementom nadaje `przyklejDoScian`, czyli
     * to samo przyciąganie co przy kliknięciu na planie. Te dwie rzeczy potrafią się
     * rozjechać po cichu i raz już się rozjechały: `snapToWall` wybierał stronę ściany
     * względem średniej wierzchołków obrysu, a przy obrysie wklęsłym (przedpokój jest
     * literą L) ta średnia wypada poza pomieszczeniem — dwa elementy przedpokoju lądowały
     * więc za murem, w Pokoju, zachowując starą nazwę w `room`. Naprawione w `stronaWnetrza`
     * (wallSnap.ts); ten test stoi tu, żeby rozjazd nie wrócił inną drogą.
     *
     * Skutek nie jest kosmetyczny: od pomieszczenia zależy podział na obwody i strefy
     * ochronne, a aplikacja wita wtedy użytkownika ostrzeżeniem „elementy zostały
     * w starych pokojach" — na PIERWSZYM ekranie, jaki widzi.
     *
     * Test sprawdza od razu i to, że taki element w ogóle istnieje: `wew` to podzbiór
     * WSZYSTKICH nazw pomieszczeń, więc jeśli zawiera `el.room`, ta nazwa musi być
     * prawdziwa — osobny test na samo istnienie nazwy byłby więc powtórką słabszą
     * o dokładnie ten warunek.
     */
    for (const el of payload.draft.elements) {
      const wew = payload.draft.roomShapes
        .filter((r) => r.floor === el.floor && pointInPolygon({ x: el.x, y: el.y }, r.points))
        .map((r) => r.name);
      expect(wew, `element ${el.id} wpisany do „${el.room}"`).toContain(el.room);
    }
  });

  it("wszystko siedzi na znanej kondygnacji i w obszarze planu", () => {
    // `planSize` jest WSPÓLNY dla wszystkich kondygnacji (patrz store), więc granice
    // sprawdzamy raz dla wszystkich elementów. Kondygnację weryfikujemy przez istnienie
    // w rejestrze pięter, a nie przez porównanie z jedną, aktywną — dom ma ich więcej.
    const { w, h } = payload.planSize;
    const idPieter = new Set(payload.floors.map((f) => f.id));
    for (const el of payload.draft.elements) {
      expect(idPieter, `element ${el.id} na nieistniejącej kondygnacji`).toContain(el.floor);
      expect(el.x, `element ${el.id} w poziomie`).toBeGreaterThanOrEqual(0);
      expect(el.x).toBeLessThanOrEqual(w);
      expect(el.y, `element ${el.id} w pionie`).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeLessThanOrEqual(h);
    }
    for (const s of payload.draft.walls) {
      expect(idPieter, `ściana na nieistniejącej kondygnacji`).toContain(s.floor);
    }
    for (const r of payload.draft.roomShapes) {
      expect(idPieter, `pomieszczenie „${r.name}" na nieistniejącej kondygnacji`).toContain(r.floor);
    }
  });

  it("nazwy pomieszczeń są unikalne w obrębie CAŁEGO przykładu, nie tylko kondygnacji", () => {
    // `computeCircuits` (lib/panel/circuits.ts) kubełkuje mokre gniazda po samej
    // NAZWIE pomieszczenia (`byRoom[e.room]`), bez oglądania się na kondygnację. Dwa
    // pomieszczenia o tej samej nazwie na różnych piętrach scaliłyby się więc w jeden
    // obwód przez strop — dlatego dom nazywa łazienkę piętra „Łazienka na piętrze",
    // a nie „Łazienka" (patrz `LAZIENKA_G` w dom.ts). Ten test pilnuje, żeby ta
    // niespodzianka nie wróciła w kolejnym przykładzie z rejestru.
    const nazwy = payload.draft.roomShapes.map((r) => r.name);
    expect(nazwy.length, "przykład bez pomieszczeń").toBeGreaterThan(0);
    const duplikaty = nazwy.filter((n, i) => nazwy.indexOf(n) !== i);
    expect(duplikaty, "zduplikowane nazwy pomieszczeń między kondygnacjami").toEqual([]);
  });

  it("ma rozdzielnicę na planie, więc kosztorys mierzy trasy zamiast zgadywać", () => {
    // Bez rozdzielnicy metraż kabla spada na ryczałt „5 mb na punkt" i przykład
    // pokazywałby gorszy wynik, niż aplikacja potrafi — patrz `elementy`.
    expect(findPanel(payload.draft.elements)).toBeTruthy();
  });

  it("KAŻDA kondygnacja z elementami ma na sobie rozdzielnicę", () => {
    /**
     * To nie jest kosmetyka. `buildCableRoutes` dostaje elementy przefiltrowane po
     * kondygnacji (patrz `trasyPotrzebne` w DesignTab.tsx), więc `findPanel` szuka
     * rozdzielnicy TEJ kondygnacji. Piętro bez własnej nie dostaje ŻADNEJ trasy
     * zasilania — zostają same linie sterowania łącznik→oprawa, a rzut wygląda na pusty.
     */
    const zElementami = [...new Set(payload.draft.elements.map((e) => e.floor))];
    const panele = findPanels(payload.draft.elements);
    for (const f of zElementami) expect(panele.poKondygnacji.has(f), `kondygnacja ${f}`).toBe(true);
  });

  it("wypełnia rozdzielnicę i kosztorys — po to w ogóle istnieje", () => {
    const circuits = computeCircuits(payload.draft.elements, payload.draft.roomShapes);
    expect(circuits.length).toBeGreaterThan(3);
    const { quantities } = computeCosts(payload.draft.elements, circuits, computeRcdGroups(circuits));
    expect(quantities.gniazdko).toBeGreaterThan(0);
    // Klucz CENNIKA, nie typ elementu: `oswietlenie`/`kinkiet`/`oswietlenieZewn`
    // wpadają razem do pozycji „oprawa" (patrz `TYPE_TO_PRICE_KEY` w costs.ts).
    expect(quantities.oprawa).toBeGreaterThan(0);
  });

  it("każde pomieszczenie ma drzwi do KOMUNIKACJI, a nie do sąsiada", () => {
    /**
     * Uogólnienie reguły, która wcześniej wisiała na nazwie „Przedpokój". Komunikacja to
     * pomieszczenia typu `inne` — w mieszkaniu Przedpokój, w domu Hol i Korytarz.
     *
     * Sama spójność grafu drzwi by nie wystarczyła: przepuściłaby sypialnię dostępną
     * przez kuchnię, czyli dokładnie to, co było nie tak z pierwszą wersją rzutu.
     */
    const LUZ = 0.5 / MANUAL_DRAW_SCALE_MPU;
    const naObrysie = (o: { x: number; y: number }, pts: { x: number; y: number }[]) => {
      const rzut = nearestPointOnPolyline(o, [...pts, pts[0]]);
      return rzut !== null && Math.hypot(rzut.point.x - o.x, rzut.point.y - o.y) <= LUZ;
    };
    // Komunikacja to `inne` ORAZ `klatka`: klatka schodowa jest przestrzenią
    // komunikacyjną tak samo jak hol czy korytarz, tylko niesie dodatkowo informację
    // o schodach. Typ czytany przez `typPomieszczenia`, bo pole `RoomShape.type` jest
    // OPCJONALNE — zapisy sprzed jego dodania go nie mają i wracają do zgadywania
    // po nazwie.
    const KOMUNIKACJA: RoomType[] = ["inne", "klatka"];
    const jestKomunikacja = (r: (typeof payload.draft.roomShapes)[number]) =>
      KOMUNIKACJA.includes(typPomieszczenia(r.name, payload.draft.roomShapes));
    const komunikacja = payload.draft.roomShapes.filter(jestKomunikacja);
    expect(komunikacja.length, "przykład bez pomieszczenia komunikacyjnego").toBeGreaterThan(0);

    for (const r of payload.draft.roomShapes) {
      if (jestKomunikacja(r)) continue;
      const drzwi = payload.draft.openings.filter(
        (o) =>
          o.floor === r.floor &&
          naObrysie(o, r.points) &&
          komunikacja.some((k) => k.floor === r.floor && naObrysie(o, k.points))
      );
      expect(drzwi.length, `„${r.name}" bez drzwi do komunikacji`).toBeGreaterThan(0);
    }
  });

  it("pomieszczenia mokre mają jawny typ, nie zgadywanie po nazwie", () => {
    // Od typu zależą strefy ochronne i osobne obwody — a `guessRoomType` po nazwie
    // to droga awaryjna dla starych zapisów, nie coś, na czym przykład ma stać.
    //
    // Uogólnione z literałów "Kuchnia"/"Łazienka" — dokładnie ta wada, z której ta
    // gałąź wyleczyła regułę drzwi wyżej. Skutek literałów: w domu sprawdzała się
    // tylko łazienka PARTERU (nazwa piętra to celowo "Łazienka na piętrze", patrz
    // `LAZIENKA_G` w dom.ts), a trzeci przykład bez kuchni wywaliłby test bez powodu.
    // Sprawdzamy więc KAŻDY obrys, którego nazwa zgaduje się na typ mokry: jego jawny
    // `type` musi się z tym zgadywaniem zgadzać. Lista musi odpowiadać `WET_ROOM_TYPES`
    // w lib/design.ts — nie importujemy stamtąd, bo ta stała nie jest eksportowana.
    const TYPY_MOKRE: readonly RoomType[] = ["kuchnia", "lazienka", "pralnia", "kotlownia"];
    const zgadnieteMokre = payload.draft.roomShapes.filter((r) => TYPY_MOKRE.includes(guessRoomType(r.name)));
    // Test nie może być pusty — inaczej pętla niżej przechodzi bez sprawdzenia niczego.
    expect(zgadnieteMokre.length, "przykład bez pomieszczenia, którego nazwa zgaduje się na typ mokry").toBeGreaterThan(0);
    for (const r of zgadnieteMokre) {
      const zgadniety = guessRoomType(r.name);
      expect(r.type, `„${r.name}" zgaduje się na „${zgadniety}", ale ma jawny typ „${r.type}"`).toBe(zgadniety);
    }
  });

  it("jest oznaczony jako przykład — to on włącza pasek i blokadę zapisu w chmurze", () => {
    expect(payload.projektPrzykladowy).toBe(true);
  });

  it("KAŻDA kondygnacja ma skalę, a otwiera się pierwsza z listy", () => {
    // Kondygnacja bez wpisu w `scales` renderuje się w skali domyślnej, więc rzut
    // piętra wychodziłby w innym rozmiarze niż parteru — a widać to dopiero po
    // przełączeniu zakładki, czyli już u użytkownika.
    for (const f of payload.floors) expect(scaleOf(payload.scales, f.id)).toBe(MANUAL_DRAW_SCALE_MPU);
    expect(payload.activeFloorId).toBe(payload.floors[0].id);
  });

  it("otwiera się na gotowym wyniku, a nie na przewodniku i pustej rozdzielnicy", () => {
    // Rozdzielnica ma się ODBUDOWAĆ z obwodów policzonych z tego rzutu — o to
    // w przykładzie chodzi. Gotowa lista aparatów zamrażałaby wynik doboru z dnia,
    // w którym powstał plik z danymi.
    expect(payload.panelTryb).toBe("zRzutu");
    expect(payload.panelDevices).toEqual([]);
    // Przewodnik „Zacznij w 3 krokach" jest na gotowym projekcie bezprzedmiotowy —
    // wszystkie trzy kroki są w nim z definicji wykonane.
    expect(payload.onboarding.krok1Done).toBe(true);
    expect(payload.onboarding.krok2Done).toBe(true);
    expect(payload.onboarding.krok3Done).toBe(true);
    expect(payload.onboarding.pominiety).toBe(true);
  });

  it("nie wlecze ze sobą podkładu", () => {
    // Podkład to data URL — setki kilobajtów base64 w paczce i w każdym autozapisie.
    expect(payload.bgImages).toEqual({});
  });

  it("buduje się od nowa przy każdym wywołaniu", async () => {
    // Store bierze te obiekty WPROST do siebie, więc wspólna stała dałaby się
    // zmodyfikować pierwszym przeciągnięciem elementu na planie.
    const drugi = await zbudujPrzyklad(id);
    expect(drugi.draft.elements).not.toBe(payload.draft.elements);
    expect(drugi.draft.elements).toEqual(payload.draft.elements);
  });

  it("przewody biegną wzdłuż ścian — na KAŻDEJ kondygnacji", () => {
    /**
     * Reguła rysunku: przewód biegnie równolegle albo prostopadle do ściany, jedyny
     * dopuszczony ukos to ODCZEP pod 45° do nóżki osprzętu. Sprawdzane OSOBNO dla
     * każdej kondygnacji (nie dla całego budynku), bo `buildCableRoutes` też liczy
     * trasy osobno na piętro — błąd na jednym piętrze nie może się uśrednić z dobrym
     * wynikiem na innym.
     */
    const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
    for (const f of payload.floors.map((x) => x.id)) {
      const el = payload.draft.elements.filter((e) => e.floor === f);
      if (el.length === 0) continue;
      const sc = payload.draft.walls.filter((w) => w.floor === f);
      const rs = payload.draft.roomShapes.filter((r) => r.floor === f);
      const ot = payload.draft.openings.filter((o) => o.floor === f);
      const rysowane = spreadOverlappingRoutes(
        buildCableRoutes(findPanel(el), computeCircuits(el, rs), el, sc, rs, ot, skala),
        rs
      );
      const zle: string[] = [];
      let dlugosc = 0;
      let ukos = 0;
      for (const [rid, pts] of rysowane) {
        for (let i = 1; i < pts.length; i++) {
          const dx = Math.abs(pts[i].x - pts[i - 1].x);
          const dy = Math.abs(pts[i].y - pts[i - 1].y);
          const len = Math.hypot(dx, dy);
          dlugosc += len;
          if (dx > 0.01 && dy > 0.01) ukos += len;
          if (dx <= 0.01 || dy <= 0.01) continue;
          if (len < ODSUNIECIE_TRASY) continue;
          if (Math.abs(dx - dy) <= 0.1) continue;
          zle.push(`${f}/${rid}: (${pts[i - 1].x.toFixed(1)},${pts[i - 1].y.toFixed(1)})→(${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)})`);
        }
      }
      expect(zle, `kondygnacja ${f}`).toEqual([]);
      expect(ukos / dlugosc, `kondygnacja ${f}`).toBeLessThan(0.1);
    }
  });

  it("żaden obwód nie ma trasy SZACOWANEJ — rozdzielnica nie ostrzega przykładu przed samym sobą", () => {
    /**
     * Gdy routing nie znajdzie drogi między dwoma punktami, długość spada do odległości
     * prostokątnej i dobór dopisuje do obwodu ostrzeżenie "DLUGOSC_SZACOWANA". W przykładzie
     * to zawsze błąd danych: geometria jest narysowana, więc trasa MUSI się znaleźć. Poprzednio
     * gniazdko stało na styku dwóch ścian (przyciągnięte do końca jednej, w osi drugiej), tuż
     * po otwarciu przykładu rozdzielnica pokazywała ostrzeżenie o braku ścian na planie
     * z ścianami — i nikt tego nie zauważył, bo żaden test nie pytał o szacunek.
     */
    const geometria = { walls: payload.draft.walls, roomShapes: payload.draft.roomShapes, openings: payload.draft.openings };
    const panele = findPanels(payload.draft.elements);
    const szacowane = computeCircuits(payload.draft.elements, payload.draft.roomShapes)
      .filter(
        (c) =>
          estimateRoutesByFloor(panele, c.elements, payload.scales, undefined, {
            geometria,
            kondygnacje: payload.floors,
            wszystkieElementy: payload.draft.elements,
          })?.szacunek
      )
      .map((c) => c.name);
    expect(szacowane).toEqual([]);
  });

  it("żadne dwa symbole w jednym pomieszczeniu nie NACHODZĄ na siebie", () => {
    /**
     * Mierzymy NACHODZENIE, a nie odstęp „co najmniej 0,8 m". Ta druga liczba to reguła
     * kciuka i pliki danych nigdy nie zgadzały się co do jej statusu; test na niej byłby
     * kruchy — pierwszy przykład z gęstszym osprzętem (blat kuchenny, listwa nad biurkiem)
     * zapaliłby go bez żadnego defektu. Nachodzenie jest za to wielkością OBIEKTYWNĄ:
     * bierze się wprost z `glyphBoxSize` i skali renderu, więc próg zmienia się razem
     * z rozmiarem symboli, zamiast zostawać w tyle jako zapamiętana stała.
     *
     * TYLKO W OBRĘBIE JEDNEGO POMIESZCZENIA i jednej kondygnacji — i to jest sedno, a nie
     * zawężenie na wszelki wypadek. Osprzęt montuje się w murze z obu stron, więc łącznik
     * w kuchni i łącznik w garażu przy tej samej ścianie mają środki 0,3 m od siebie
     * i „nachodzą" według każdej miary odległości. Na rysunku dzieli je ściana i nie ma
     * tam żadnego defektu. Bez tego filtra test zgłosiłby dziesięć takich par w dwóch
     * przykładach i nie dałoby się go utrzymać.
     *
     * PRZYBORY SANITARNE poza testem: wanna, prysznic i umywalka nie są symbolami
     * umownymi, tylko obrysem rzeczywistego wyposażenia w prawdziwych wymiarach
     * (`SANITARY_FIXTURES`). Oprawa pod stropem NAD wanną to normalny układ, a nie
     * kolizja rysunku; o tym, co wolno postawić nad przyborem, rozstrzygają strefy
     * ochronne, nie czytelność kresek.
     */
    const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
    // Promień zastępczy: symbol obraca się razem ze ścianą, więc prostokąt obrysu nie ma
    // stałej orientacji. Koło o promieniu połowy dłuższego boku jest niezależne od obrotu.
    const promien = (t: InstallationElement["type"]) => (Math.max(glyphBoxSize(t).w, glyphBoxSize(t).h) / 2) * skala;
    const osprzet = payload.draft.elements.filter((e) => !SANITARY_FIXTURES[e.type]);

    const nachodzace: string[] = [];
    for (let i = 0; i < osprzet.length; i++) {
      for (let j = i + 1; j < osprzet.length; j++) {
        const a = osprzet[i];
        const b = osprzet[j];
        if (a.floor !== b.floor || a.room !== b.room) continue;
        const odleglosc = Math.hypot(a.x - b.x, a.y - b.y);
        const styk = promien(a.type) + promien(b.type);
        if (odleglosc < styk) {
          nachodzace.push(
            `${a.id} ↔ ${b.id} w „${a.room}": ${(odleglosc * MANUAL_DRAW_SCALE_MPU).toFixed(2)} m < ${(styk * MANUAL_DRAW_SCALE_MPU).toFixed(2)} m`
          );
        }
      }
    }
    expect(nachodzace).toEqual([]);
    // Test ma na czym pracować: w każdym przykładzie są pomieszczenia z kilkoma symbolami.
    expect(osprzet.length).toBeGreaterThan(10);
  });

  it("ma gniazdo podwójne i wycenia je jako JEDNĄ sztukę osobnej pozycji", () => {
    // Przykład jest jedynym miejscem, w którym użytkownik widzi wariant podwójny, zanim
    // sam go postawi — a `gangs` wpisywane tu w kodzie omija interfejs, więc łatwo
    // wpisać liczbę, której interfejs nigdy by nie dopuścił (kiedyś było tu `3`).
    const podwojne = payload.draft.elements.filter((e) => gniazdoPodwojne(e));
    expect(podwojne.length).toBeGreaterThan(0);
    for (const e of podwojne) expect(e.gangs).toBe(2);

    const { quantities } = computeCosts(payload.draft.elements, [], []);
    expect(quantities.gniazdkoPodwojne).toBe(podwojne.length);
  });

  it("liczba puszek podtynkowych nie zależy od wariantu gniazd", () => {
    // Podwójne zajmuje jedno miejsce w ścianie, tak samo jak pojedyncze.
    const { quantities } = computeCosts(payload.draft.elements, [], []);
    const punkty = payload.draft.elements.filter(
      (e) => !["rozdzielnica", "puszka", "szafkaTeletech"].includes(e.type) && !["wanna", "prysznic", "umywalka"].includes(e.type)
    );
    expect(quantities.puszkaPodtynkowa).toBe(punkty.length);
  });
});
