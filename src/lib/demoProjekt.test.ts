import { describe, it, expect } from "vitest";
import { zbudujProjektPrzykladowy } from "./demoProjekt";
import { nearestPointOnPolyline, pointInPolygon, polygonAreaM2 } from "./geometry";
import { computeCosts } from "./costs";
import { gniazdoPodwojne } from "./elements";
import { ODSUNIECIE_TRASY } from "./panel/routing";
import { computeCircuits, computeRcdGroups } from "./panel/circuits";
import { buildCableRoutes, findPanel, spreadOverlappingRoutes } from "./panel/loads";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "./symbolScale";
import { MANUAL_DRAW_SCALE_MPU } from "./design";
import { scaleOf } from "./design";

/**
 * Projekt przykładowy to DANE wpisane ręcznie, więc łatwo je po cichu popsuć —
 * przesunięty narożnik albo literówka w nazwie pomieszczenia nie wywalają niczego,
 * tylko sprawiają, że pierwsze, co widzi nowy użytkownik, jest bez sensu.
 *
 * Te testy pilnują tego, co w przykładzie musi być PRAWDĄ, a nie tego, jak dokładnie
 * jest narysowany — żeby dało się swobodnie przestawiać osprzęt, nie przepisując
 * przy tym testów.
 */
describe("projekt przykładowy", () => {
  const payload = zbudujProjektPrzykladowy();
  const { elements, walls, roomShapes, openings } = payload.draft;
  const floor = payload.activeFloorId;

  it("obiecuje 70 m² i tyle naprawdę ma", () => {
    const mpu = scaleOf(payload.scales, floor)!;
    const metraz = roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
    // Nazwa projektu jest obietnicą złożoną na ekranie startowym („mieszkanie 70 m²")
    // — a powierzchnia pokazuje się potem w pasku stanu pod rysunkiem. Rozjazd tych
    // dwóch liczb to jedyna rzecz, którą użytkownik na tym ekranie może SPRAWDZIĆ.
    expect(payload.projectName).toContain("70 m²");
    expect(metraz).toBeCloseTo(70, 1);
  });

  it("każdy element stoi w pomieszczeniu, które naprawdę istnieje", () => {
    const nazwy = new Set(roomShapes.map((r) => r.name));
    for (const el of elements) expect(nazwy, `element ${el.id}`).toContain(el.room);
  });

  it("element LEŻY w pomieszczeniu, które ma wpisane — nie tylko je nazywa", () => {
    /**
     * Pole `room` to wolny tekst, a pozycję elementom nadaje tu `przyklejDoScian`, czyli
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
     */
    for (const el of elements) {
      const wew = roomShapes.filter((r) => pointInPolygon({ x: el.x, y: el.y }, r.points)).map((r) => r.name);
      expect(wew, `element ${el.id} wpisany do „${el.room}"`).toContain(el.room);
    }
  });

  it("wszystko siedzi na jednej kondygnacji i w obszarze planu", () => {
    const { w, h } = payload.planSize;
    for (const el of elements) {
      expect(el.floor).toBe(floor);
      expect(el.x, `element ${el.id} w poziomie`).toBeGreaterThanOrEqual(0);
      expect(el.x).toBeLessThanOrEqual(w);
      expect(el.y, `element ${el.id} w pionie`).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeLessThanOrEqual(h);
    }
    for (const s of walls) expect(s.floor).toBe(floor);
    for (const r of roomShapes) expect(r.floor).toBe(floor);
  });

  it("ma rozdzielnicę na planie, więc kosztorys mierzy trasy zamiast zgadywać", () => {
    // Bez rozdzielnicy metraż kabla spada na ryczałt „5 mb na punkt" i przykład
    // pokazywałby gorszy wynik, niż aplikacja potrafi — patrz `elementy`.
    expect(findPanel(elements)).toBeTruthy();
  });

  it("wypełnia rozdzielnicę i kosztorys — po to w ogóle istnieje", () => {
    const circuits = computeCircuits(elements, roomShapes);
    expect(circuits.length).toBeGreaterThan(3);
    const { quantities } = computeCosts(elements, circuits, computeRcdGroups(circuits));
    expect(quantities.gniazdko).toBeGreaterThan(0);
    // Klucz CENNIKA, nie typ elementu: `oswietlenie`/`kinkiet`/`oswietlenieZewn`
    // wpadają razem do pozycji „oprawa" (patrz `TYPE_TO_PRICE_KEY` w costs.ts).
    expect(quantities.oprawa).toBeGreaterThan(0);
  });

  it("każde pomieszczenie ma drzwi do PRZEDPOKOJU, a nie do sąsiada", () => {
    /**
     * Sedno zgłoszenia o poprzednim rzucie: do sypialni wchodziło się przez kuchnię,
     * a „przedpokój" był kwadratem 3×3 m, czyli szóstym pokojem, nie komunikacją.
     *
     * Test pyta o TOPOLOGIĘ, nie o współrzędne: dla każdego pomieszczenia szuka otworu
     * leżącego jednocześnie na jego obrysie i na obrysie przedpokoju. Dzięki temu wolno
     * swobodnie przesuwać drzwi wzdłuż ściany i zmieniać wymiary pokoi, dopóki rozkład
     * pozostaje taki, że z niczego do niczego się nie przechodzi.
     */
    const przedpokoj = roomShapes.find((r) => r.name === "Przedpokój")!;
    expect(przedpokoj).toBeTruthy();
    // Otwór stoi na OSI ściany, a obrys pomieszczenia biegnie tą samą osią — pół metra
    // luzu bierze się z grubości muru, nie z niedokładności rysunku.
    const LUZ = 0.5 / MANUAL_DRAW_SCALE_MPU;
    const naObrysie = (o: { x: number; y: number }, r: typeof przedpokoj) => {
      const rzut = nearestPointOnPolyline(o, [...r.points, r.points[0]]);
      return rzut !== null && Math.hypot(rzut.point.x - o.x, rzut.point.y - o.y) <= LUZ;
    };
    for (const r of roomShapes) {
      if (r.id === przedpokoj.id) continue;
      const doPrzedpokoju = openings.filter((o) => naObrysie(o, r) && naObrysie(o, przedpokoj));
      expect(doPrzedpokoju.length, `pomieszczenie „${r.name}" bez drzwi do przedpokoju`).toBeGreaterThan(0);
    }
  });

  it("pomieszczenia mokre mają jawny typ, nie zgadywanie po nazwie", () => {
    // Od typu zależą strefy ochronne i osobne obwody — a `guessRoomType` po nazwie
    // to droga awaryjna dla starych zapisów, nie coś, na czym przykład ma stać.
    const kuchnia = roomShapes.find((r) => r.name === "Kuchnia");
    const lazienka = roomShapes.find((r) => r.name === "Łazienka");
    expect(kuchnia?.type).toBe("kuchnia");
    expect(lazienka?.type).toBe("lazienka");
  });

  it("jest oznaczony jako przykład — to on włącza pasek i blokadę zapisu w chmurze", () => {
    expect(payload.projektPrzykladowy).toBe(true);
  });

  it("nie wlecze ze sobą podkładu", () => {
    // Podkład to data URL — setki kilobajtów base64 w paczce i w każdym autozapisie.
    expect(payload.bgImages).toEqual({});
  });

  it("buduje się od nowa przy każdym wywołaniu", () => {
    // `loadProjectPayload` bierze te obiekty WPROST do store'a, więc wspólna stała
    // dałaby się zmodyfikować pierwszym przeciągnięciem elementu na planie.
    const drugi = zbudujProjektPrzykladowy();
    expect(drugi.draft.elements).not.toBe(elements);
    expect(drugi.draft.elements).toEqual(elements);
  });
});

/**
 * Przewody na rzucie przykładu mają iść WZDŁUŻ ścian albo prostopadle do nich.
 *
 * Zgłoszenie brzmiało „przewody do różnych obwodów nie idą prostopadle do ścian
 * pomieszczeń" i dotyczyło dokładnie tego rysunku. Były wtedy dwa niezależne powody
 * (oba w kodzie, nie w danych przykładu):
 *   — `nodeIndex` w panel/routing.ts wciągało wsunięte narożniki pomieszczeń do węzłów
 *     ścian, więc trasa wchodziła na ścianę odsunięta, a schodziła z niej narożnikiem
 *     leżącym na osi muru;
 *   — `spreadOverlappingRoutes` w panel/loads.ts przesuwało WIERZCHOŁKI, a nie odcinki,
 *     więc odcinek między dwoma różnymi pasami tracił równoległość do ściany.
 * Skutek obu był ten sam i widoczny: linia biegnąca „prawie wzdłuż" ściany, przez całą
 * długość pomieszczenia.
 *
 * Test stoi na GEOMETRII RYSOWANEJ (`spreadOverlappingRoutes`), bo to ona trafia na
 * ekran — surowe `points` bywały poprawne wtedy, gdy rysunek już nie był.
 */
describe("projekt przykładowy — przebieg przewodów", () => {
  const payload = zbudujProjektPrzykladowy();
  const { elements, walls, roomShapes, openings } = payload.draft;
  const skalaSymboli = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
  const trasy = buildCableRoutes(
    findPanel(elements),
    computeCircuits(elements, roomShapes),
    elements,
    walls,
    roomShapes,
    openings,
    skalaSymboli
  );
  const rysowane = spreadOverlappingRoutes(trasy, roomShapes);

  it("każdy ukos na rzucie jest ODCZEPEM pod 45°, a nie przebiegiem", () => {
    /**
     * Reguła rysunku po naprawie: przewód biegnie równolegle albo prostopadle do ściany,
     * a jedyny dopuszczony ukos to ODCZEP — krótkie dojście do nóżki osprzętu pod 45°
     * (`zakonczPrzyNozce`), które ma z definicji równe składowe. Do rozdzielnicy przewód
     * wchodzi prostopadle, więc odczepu tam nie ma w ogóle.
     *
     * Poza sprawdzeniem są odcinki krótsze niż `ODSUNIECIE_TRASY` — i to nie jest
     * dobrana liczba, tylko granica wynikająca z geometrii. Tyle właśnie wynosi odstęp
     * między ścianą a pasem, po którym biegnie przewód, więc nic krótszego nie może być
     * PRZEBIEGIEM wzdłuż ściany: to zawsze detal dojścia do osprzętu (przycięcie do
     * krawędzi symbolu, przeskok między pasami wiązki). Na rzucie przykładu takie
     * resztki mają 2,9-3,4 jedn., czyli ok. 15 cm.
     *
     * Przed naprawą ten warunek łamało kilkanaście odcinków, najdłuższy na 81 jedn. —
     * czyli przewód ciągnący się ukosem przez cały salon.
     */
    const zle: string[] = [];
    for (const [id, pts] of rysowane) {
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i].x - pts[i - 1].x);
        const dy = Math.abs(pts[i].y - pts[i - 1].y);
        if (dx <= 0.01 || dy <= 0.01) continue; // pion albo poziom — tak ma być
        if (Math.hypot(dx, dy) < ODSUNIECIE_TRASY) continue;
        if (Math.abs(dx - dy) <= 0.1) continue; // odczep pod 45°
        zle.push(`${id}: (${pts[i - 1].x.toFixed(1)},${pts[i - 1].y.toFixed(1)})→(${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)})`);
      }
    }
    expect(zle).toEqual([]);
  });

  it("skosy zostają marginesem rysunku, a nie jego treścią", () => {
    // Miara całościowa, odporna na przestawienie pojedynczego gniazda: ile DŁUGOŚCI
    // wszystkich przewodów biegnie ukosem. Przed naprawą było to 68% (2116 z 3127
    // jedn.) — czyli rysunek składał się głównie ze skosów. Po naprawie jest to 5%.
    let dlugosc = 0;
    let ukos = 0;
    for (const [, pts] of rysowane) {
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i].x - pts[i - 1].x);
        const dy = Math.abs(pts[i].y - pts[i - 1].y);
        const len = Math.hypot(dx, dy);
        dlugosc += len;
        if (dx > 0.01 && dy > 0.01) ukos += len;
      }
    }
    expect(ukos / dlugosc).toBeLessThan(0.1);
  });
});

describe("projekt przykładowy — gniazdo podwójne", () => {
  const payload = zbudujProjektPrzykladowy();
  const { elements } = payload.draft;

  it("ma gniazdo podwójne i wycenia je jako JEDNĄ sztukę osobnej pozycji", () => {
    // Przykład jest jedynym miejscem, w którym użytkownik widzi wariant podwójny, zanim
    // sam go postawi — a `gangs` wpisywane tu w kodzie omija interfejs, więc łatwo
    // wpisać liczbę, której interfejs nigdy by nie dopuścił (kiedyś było tu `3`).
    const podwojne = elements.filter((e) => gniazdoPodwojne(e));
    expect(podwojne.length).toBeGreaterThan(0);
    for (const e of podwojne) expect(e.gangs).toBe(2);

    const { quantities } = computeCosts(elements, [], []);
    expect(quantities.gniazdkoPodwojne).toBe(podwojne.length);
  });

  it("liczba puszek podtynkowych nie zależy od wariantu gniazd", () => {
    // Podwójne zajmuje jedno miejsce w ścianie, tak samo jak pojedyncze.
    const { quantities } = computeCosts(elements, [], []);
    const punkty = elements.filter(
      (e) => !["rozdzielnica", "puszka", "szafkaTeletech"].includes(e.type) && !["wanna", "prysznic", "umywalka"].includes(e.type)
    );
    expect(quantities.puszkaPodtynkowa).toBe(punkty.length);
  });
});
