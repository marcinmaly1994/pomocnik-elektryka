import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectStore, useActiveFloorWalls, useActiveFloorElements } from "./useProjectStore";

const sampleElement = {
  id: "e1", type: "gniazdko" as const, x: 100, y: 100, room: "Salon", floor: "f1",
  dedicated: false, note: "", gangs: 1,
};

describe("useProjectStore", () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject();
  });

  describe("dziedziczenie skali przez kolejne kondygnacje", () => {
    it("nowa kondygnacja przejmuje skalę bieżącej", () => {
      const { setScale, addFloor } = useProjectStore.getState();
      setScale("f1", 0.05);
      addFloor("Piętro");

      const { activeFloorId, scales } = useProjectStore.getState();
      expect(activeFloorId).not.toBe("f1");
      // piętro rysuje się w tej samej skali co parter — inaczej ten sam rzut
      // dostałby dwa różne przeliczniki
      expect(scales[activeFloorId]).toBe(0.05);
    });

    it("bez skali na parterze nowa kondygnacja też jej nie ma — nic nie zmyślamy", () => {
      useProjectStore.getState().addFloor("Piętro");
      const { activeFloorId, scales } = useProjectStore.getState();
      expect(scales[activeFloorId]).toBeUndefined();
    });

    it("sięga po pierwszą skalibrowaną, gdy bieżąca kondygnacja skali nie ma", () => {
      const { setScale, addFloor } = useProjectStore.getState();
      setScale("f1", 0.04);
      addFloor("Piętro"); // dziedziczy 0,04 i staje się aktywne
      const pietro = useProjectStore.getState().activeFloorId;
      useProjectStore.getState().clearScale(pietro); // user kasuje skalę piętra

      useProjectStore.getState().addFloor("Poddasze");
      const poddasze = useProjectStore.getState().activeFloorId;
      expect(useProjectStore.getState().scales[poddasze]).toBe(0.04);
    });

    it("odziedziczona skala nie nadpisuje istniejącej na innych kondygnacjach", () => {
      const { setScale, addFloor } = useProjectStore.getState();
      setScale("f1", 0.05);
      addFloor("Piętro");
      expect(useProjectStore.getState().scales.f1).toBe(0.05);
    });
  });

  it("dodaje element i pozwala go cofnąć", () => {
    const { setDraft, undo } = useProjectStore.getState();

    setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] }));
    expect(useProjectStore.getState().draft.elements).toHaveLength(1);

    undo();
    expect(useProjectStore.getState().draft.elements).toHaveLength(0);
  });

  it("redo przywraca stan po undo", () => {
    const { setDraft, undo, redo } = useProjectStore.getState();
    setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] }));

    undo();
    expect(useProjectStore.getState().draft.elements).toHaveLength(0);

    redo();
    expect(useProjectStore.getState().draft.elements).toHaveLength(1);
  });

  it("commit:false (np. podczas przeciągania) nie tworzy nowego wpisu w historii", () => {
    const { setDraft } = useProjectStore.getState();
    setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] })); // commit=true (domyślnie)

    // symulacja kilku kroków przeciągania — żaden nie powinien trafić do historii
    for (let i = 0; i < 5; i++) {
      setDraft(
        (d) => ({ ...d, elements: d.elements.map((e) => ({ ...e, x: e.x + 1 })) }),
        { commit: false }
      );
    }
    expect(useProjectStore.getState().past).toHaveLength(1); // tylko dodanie elementu, nie 6 kroków
  });

  it("nową akcję po undo czyści redo (future)", () => {
    const { setDraft, undo } = useProjectStore.getState();
    setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] }));
    undo();
    expect(useProjectStore.getState().future).toHaveLength(1);

    setDraft((d) => ({ ...d, elements: [...d.elements, { ...sampleElement, id: "e2" }] }));
    expect(useProjectStore.getState().future).toHaveLength(0);
  });

  it("usunięcie kondygnacji porządkuje jej elementy, ściany, podkład i skalę", () => {
    const { addFloor, setDraft, setBgImage, setScale, removeFloor } = useProjectStore.getState();
    addFloor("Piętro 1");
    const floorId = useProjectStore.getState().activeFloorId;

    setDraft((d) => ({ ...d, elements: [...d.elements, { ...sampleElement, id: "e2", floor: floorId }] }));
    setBgImage(floorId, "data:image/png;base64,xxx");
    setScale(floorId, 0.02);

    removeFloor(floorId);

    const state = useProjectStore.getState();
    expect(state.floors.find((f) => f.id === floorId)).toBeUndefined();
    expect(state.draft.elements.find((e) => e.floor === floorId)).toBeUndefined();
    expect(state.bgImages[floorId]).toBeUndefined();
    expect(state.scales[floorId]).toBeUndefined();
  });

  it("setScale/clearScale kalibrują i czyszczą skalę kondygnacji", () => {
    const { setScale, clearScale } = useProjectStore.getState();
    setScale("f1", 0.025);
    expect(useProjectStore.getState().scales.f1).toBe(0.025);

    clearScale("f1");
    expect(useProjectStore.getState().scales.f1).toBeUndefined();
  });

  it("nie da się usunąć ostatniej kondygnacji", () => {
    const { removeFloor } = useProjectStore.getState();
    const onlyFloorId = useProjectStore.getState().floors[0].id;
    removeFloor(onlyFloorId);
    expect(useProjectStore.getState().floors).toHaveLength(1);
  });

  it("addRoomShape dobiera domyślną nazwę i kolor wg liczby pomieszczeń na kondygnacji", () => {
    const { addRoomShape } = useProjectStore.getState();
    addRoomShape("f1", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    addRoomShape("f1", [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], "Kuchnia");

    const rooms = useProjectStore.getState().draft.roomShapes;
    expect(rooms).toHaveLength(2);
    expect(rooms[0].name).toBe("Pomieszczenie 1");
    expect(rooms[1].name).toBe("Kuchnia");
    expect(rooms[0].color).not.toBe(rooms[1].color);
  });

  it("renameRoomShape synchronizuje nazwę pomieszczenia u elementów, które w nim stoją", () => {
    const { addRoomShape, setDraft, renameRoomShape } = useProjectStore.getState();
    addRoomShape("f1", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], "Salon");
    const roomId = useProjectStore.getState().draft.roomShapes[0].id;

    setDraft((d) => ({ ...d, elements: [...d.elements, { ...sampleElement, room: "Salon" }] }));
    renameRoomShape(roomId, "Salon z aneksem");

    const state = useProjectStore.getState();
    expect(state.draft.roomShapes[0].name).toBe("Salon z aneksem");
    expect(state.draft.elements[0].room).toBe("Salon z aneksem");
  });

  it("recolorRoomShape przechodzi do kolejnego koloru w palecie", () => {
    const { addRoomShape, recolorRoomShape } = useProjectStore.getState();
    addRoomShape("f1", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    const roomId = useProjectStore.getState().draft.roomShapes[0].id;
    const before = useProjectStore.getState().draft.roomShapes[0].color;

    recolorRoomShape(roomId);
    expect(useProjectStore.getState().draft.roomShapes[0].color).not.toBe(before);
  });

  it("deleteRoomShape usuwa pomieszczenie", () => {
    const { addRoomShape, deleteRoomShape } = useProjectStore.getState();
    addRoomShape("f1", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    const roomId = useProjectStore.getState().draft.roomShapes[0].id;

    deleteRoomShape(roomId);
    expect(useProjectStore.getState().draft.roomShapes).toHaveLength(0);
  });

  it("removeElements usuwa wiele elementów naraz (zaznaczenie wielokrotne)", () => {
    const { setDraft, removeElements } = useProjectStore.getState();
    setDraft((d) => ({
      ...d,
      elements: [
        { ...sampleElement, id: "e1" },
        { ...sampleElement, id: "e2" },
        { ...sampleElement, id: "e3" },
      ],
    }));

    removeElements(["e1", "e3"]);
    const remaining = useProjectStore.getState().draft.elements;
    expect(remaining.map((e) => e.id)).toEqual(["e2"]);
  });

  it("setProtocolState zapisuje wiersze protokołu i przetrwałaby przełączenie zakładki (stan globalny, nie lokalny)", () => {
    const { setProtocolState } = useProjectStore.getState();
    setProtocolState("ogledziny", { rows: [{ text: "x", status: "tak" }] });
    expect(useProjectStore.getState().protocols.ogledziny?.rows).toHaveLength(1);

    setProtocolState("ogledziny", { limit: 5 });
    const state = useProjectStore.getState().protocols.ogledziny;
    expect(state?.limit).toBe(5);
    expect(state?.rows).toHaveLength(1); // patch częściowy nie kasuje wcześniej zapisanych wierszy
  });

  it("setSession zapisuje i czyści sesję w localStorage", () => {
    const { setSession } = useProjectStore.getState();
    const session = { token: "tok123", user: { id: "u1", email: "a@b.pl" } };
    setSession(session);
    expect(useProjectStore.getState().session).toEqual(session);
    expect(localStorage.getItem("pomocnikelektryka_sesja")).toContain("tok123");

    setSession(null);
    expect(useProjectStore.getState().session).toBeNull();
    expect(localStorage.getItem("pomocnikelektryka_sesja")).toBeNull();
  });

  it("setRouteOverride/clearRouteOverride zapisują i kasują ręczną poprawkę trasy, obie przez historię cofnij/ponów", () => {
    const { setRouteOverride, clearRouteOverride, undo } = useProjectStore.getState();
    setRouteOverride("e1", [{ x: 30, y: 40 }]);
    expect(useProjectStore.getState().draft.routeOverrides.e1).toEqual([{ x: 30, y: 40 }]);

    clearRouteOverride("e1");
    expect(useProjectStore.getState().draft.routeOverrides.e1).toBeUndefined();

    undo(); // cofa clearRouteOverride
    expect(useProjectStore.getState().draft.routeOverrides.e1).toEqual([{ x: 30, y: 40 }]);
  });

  it("removeElements sprząta poprawki tras odwołujące się do skasowanego elementu — obie strony trasy sterowania", () => {
    const { setDraft, setRouteOverride, removeElements } = useProjectStore.getState();
    setDraft((d) => ({
      ...d,
      elements: [
        { ...sampleElement, id: "e1" },
        { ...sampleElement, id: "sw1" },
        { ...sampleElement, id: "lamp1" },
      ],
    }));
    setRouteOverride("e1", [{ x: 1, y: 1 }]); // trasa zasilania (id = jeden element)
    setRouteOverride("sw1->lamp1", [{ x: 2, y: 2 }]); // trasa sterowania (dwa id)

    removeElements(["e1"]);
    let overrides = useProjectStore.getState().draft.routeOverrides;
    expect(overrides.e1).toBeUndefined();
    expect(overrides["sw1->lamp1"]).toEqual([{ x: 2, y: 2 }]); // oba elementy nadal istnieją

    removeElements(["lamp1"]);
    overrides = useProjectStore.getState().draft.routeOverrides;
    expect(overrides["sw1->lamp1"]).toBeUndefined(); // jedna strona zniknęła — poprawka też
  });

  it("getProjectPayload/loadProjectPayload zapisują i przywracają stan projektu bez historii cofnij/ponów", () => {
    const { setDraft, undo, getProjectPayload, loadProjectPayload, setProjectName } = useProjectStore.getState();
    setDraft((d) => ({ ...d, elements: [{ ...sampleElement, id: "e1" }] }));
    setProjectName("Dom testowy");

    const payload = getProjectPayload();
    expect(payload.projectName).toBe("Dom testowy");
    expect(payload.draft.elements).toHaveLength(1);

    // zmieniamy coś jeszcze i wczytujemy zapisaną migawkę z powrotem
    setDraft((d) => ({ ...d, elements: [...d.elements, { ...sampleElement, id: "e2" }] }));
    loadProjectPayload(payload);

    const state = useProjectStore.getState();
    expect(state.draft.elements.map((e) => e.id)).toEqual(["e1"]);
    expect(state.projectName).toBe("Dom testowy");
    expect(state.past).toHaveLength(0); // nowy punkt startowy, nie krok do cofnięcia
    undo(); // nie powinno nic zmienić — historia jest pusta
    expect(useProjectStore.getState().draft.elements.map((e) => e.id)).toEqual(["e1"]);
  });

  describe("remont przypisań do pomieszczeń przy wczytaniu projektu", () => {
    // Kwadrat 100×100 jedn. w lewym górnym rogu; skala jak przy rysowaniu od zera.
    const kuchnia = {
      id: "r1", floor: "f1", name: "Kuchnia", color: "#C1793F",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    };

    function payloadZ(elements: (typeof sampleElement)[]) {
      const { getProjectPayload } = useProjectStore.getState();
      const base = getProjectPayload();
      return {
        ...base,
        scales: { f1: 0.05 },
        draft: { ...base.draft, elements, roomShapes: [kuchnia] },
      };
    }

    it("prostuje element opisany starym pokojem i mówi, ilu poprawek dokonano", () => {
      // Zapis sprzed poprawki: gniazdko stoi w kuchni, ale twierdzi, że jest w salonie.
      const { loadProjectPayload } = useProjectStore.getState();
      loadProjectPayload(payloadZ([{ ...sampleElement, x: 50, y: 50, room: "Salon" }]));

      const state = useProjectStore.getState();
      expect(state.draft.elements[0].room).toBe("Kuchnia");
      expect(state.roomsFixedOnLoad).toBe(1);
      // Poprawka jest punktem WYJŚCIA projektu, nie krokiem do cofnięcia.
      expect(state.past).toHaveLength(0);
    });

    it("spójny zapis nie jest ruszany i nie pokazuje komunikatu", () => {
      const { loadProjectPayload } = useProjectStore.getState();
      loadProjectPayload(payloadZ([{ ...sampleElement, x: 50, y: 50, room: "Kuchnia" }]));

      expect(useProjectStore.getState().draft.elements[0].room).toBe("Kuchnia");
      expect(useProjectStore.getState().roomsFixedOnLoad).toBe(0);
    });

    it("komunikat da się zamknąć i nie wraca do końca sesji", () => {
      const { loadProjectPayload } = useProjectStore.getState();
      loadProjectPayload(payloadZ([{ ...sampleElement, x: 50, y: 50, room: "Salon" }]));
      expect(useProjectStore.getState().roomsFixedOnLoad).toBe(1);

      useProjectStore.getState().dismissRoomsFixedOnLoad();
      expect(useProjectStore.getState().roomsFixedOnLoad).toBe(0);
    });
  });

  describe("duplikowanie kondygnacji", () => {
    function parterZGeometria() {
      const { setDraft } = useProjectStore.getState();
      setDraft((d) => ({
        ...d,
        walls: [{ id: "w1", floor: "f1", thickness: 5, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
        roomShapes: [{ id: "r1", floor: "f1", name: "Salon", color: "#3B8C63", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] }],
        openings: [
          { id: "o1", floor: "f1", wallId: "w1", x: 50, y: 0, angle: 0, width: 18, kind: "drzwi" as const },
          { id: "o2", floor: "f1", roomId: "r1", x: 25, y: 0, angle: 0, width: 18, kind: "okno" as const },
        ],
        elements: [{ ...sampleElement, id: "e1", floor: "f1" }],
      }));
    }

    it("kopiuje cala geometrie i osprzet na nowa kondygnacje", () => {
      parterZGeometria();
      useProjectStore.getState().duplicateFloor("f1", "Pietro 1");
      const s = useProjectStore.getState();
      const nowa = s.activeFloorId;
      expect(nowa).not.toBe("f1");
      expect(s.draft.walls.filter((w) => w.floor === nowa)).toHaveLength(1);
      expect(s.draft.roomShapes.filter((r) => r.floor === nowa)).toHaveLength(1);
      expect(s.draft.openings.filter((o) => o.floor === nowa)).toHaveLength(2);
      expect(s.draft.elements.filter((e) => e.floor === nowa)).toHaveLength(1);
      // Orygital zostaje nietkniety.
      expect(s.draft.walls.filter((w) => w.floor === "f1")).toHaveLength(1);
    });

    it("otwory wskazuja na KOPIE scian i pokoi, nie na oryginaly", () => {
      parterZGeometria();
      useProjectStore.getState().duplicateFloor("f1", "Pietro 1");
      const s = useProjectStore.getState();
      const nowa = s.activeFloorId;
      const kopieOtworow = s.draft.openings.filter((o) => o.floor === nowa);
      const kopiaSciany = s.draft.walls.find((w) => w.floor === nowa)!;
      const kopiaPokoju = s.draft.roomShapes.find((r) => r.floor === nowa)!;
      // Bez przemapowania drzwi z pietra wisialyby na scianie z parteru i kasowaly sie
      // razem z nia — na pietrze, ktorego nikt nie dotykal.
      expect(kopieOtworow.find((o) => o.wallId)!.wallId).toBe(kopiaSciany.id);
      expect(kopieOtworow.find((o) => o.roomId)!.roomId).toBe(kopiaPokoju.id);
      expect(kopiaSciany.id).not.toBe("w1");
    });

    it("dziedziczy skale i podklad zrodlowej kondygnacji", () => {
      useProjectStore.getState().setScale("f1", 0.05);
      useProjectStore.getState().setBgImage("f1", "data:image/png;base64,xxx");
      useProjectStore.getState().duplicateFloor("f1", "Pietro 1");
      const s = useProjectStore.getState();
      expect(s.scales[s.activeFloorId]).toBe(0.05);
      expect(s.bgImages[s.activeFloorId]).toBe("data:image/png;base64,xxx");
    });

    it("da sie cofnac jednym krokiem", () => {
      parterZGeometria();
      const przed = useProjectStore.getState().draft.elements.length;
      useProjectStore.getState().duplicateFloor("f1", "Pietro 1");
      expect(useProjectStore.getState().draft.elements.length).toBe(przed + 1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().draft.elements.length).toBe(przed);
    });

    it("nieistniejaca kondygnacja nic nie zmienia", () => {
      const przed = useProjectStore.getState().floors.length;
      useProjectStore.getState().duplicateFloor("nie-ma", "X");
      expect(useProjectStore.getState().floors).toHaveLength(przed);
    });
  });
});

/**
 * Liczba modulow w rzedzie to cecha KONKRETNEJ tablicy (2 x 18 to inny produkt niz
 * 3 x 12), a nie preferencja widoku: idzie na rysunek rozdzielnicy, do legendy PDF
 * i na paski opisowe. Do niedawna siedziala w stanie komponentu i po kazdym
 * odswiezeniu strony wracala do 12.
 */
describe("perRow w konfiguracji rozdzielnicy", () => {
  it("trafia do zapisu projektu razem z reszta konfiguracji", () => {
    useProjectStore.getState().setPanelConfig({ perRow: 18 });
    expect(useProjectStore.getState().getProjectPayload().panelConfig.perRow).toBe(18);
  });

  it("wczytanie projektu przywraca zapisana wartosc", () => {
    const payload = { ...useProjectStore.getState().getProjectPayload(), panelConfig: { supply3f: false, mainRating: 63, perRow: 24 } };
    useProjectStore.getState().loadProjectPayload(payload);
    expect(useProjectStore.getState().panelConfig).toMatchObject({ perRow: 24, mainRating: 63 });
  });

  /**
   * `perRow` doszlo pozniej niz sam `panelConfig`, wiec brakuje go takze w migawkach,
   * ktore panelConfig JUZ maja. Bez domyslnej wartosci nalozonej NA obiekt rozdzielnica
   * dostalaby rzad szerokosci `undefined` i nie policzylaby modulow.
   */
  it("stary zapis bez perRow dostaje wartosc domyslna", () => {
    const payload = useProjectStore.getState().getProjectPayload();
    const stary = { ...payload, panelConfig: { supply3f: true, mainRating: 40 } as never };
    useProjectStore.getState().loadProjectPayload(stary);
    expect(useProjectStore.getState().panelConfig.perRow).toBe(12);
  });

  it("nowy projekt zaczyna od dwunastu modulow w rzedzie", () => {
    useProjectStore.getState().setPanelConfig({ perRow: 24 });
    useProjectStore.getState().resetProject();
    expect(useProjectStore.getState().panelConfig.perRow).toBe(12);
  });
});

/**
 * Tozsamosc wyniku selektorow kondygnacji.
 *
 * `filter` tworzy NOWA tablice przy kazdym odczycie, wiec bez porownania po zawartosci
 * kazda zmiana store'a — takze zupelnie niezwiazana — dawala nowa tozsamosc i kazde
 * `useMemo` oparte na tych tablicach liczylo sie od nowa. Na wiekszym planie to
 * kilkadziesiat milisekund na przeliczenie tras przewodow, wydane bez powodu.
 */
describe("selektory kondygnacji — stabilna tozsamosc", () => {
  it("zmiana NIEZWIAZANA ze scianami nie zmienia tozsamosci tablicy scian", () => {
    const { result } = renderHook(() => useActiveFloorWalls());
    const przed = result.current;

    act(() => {
      useProjectStore.getState().setProjectName("Inna nazwa");
    });

    expect(result.current).toBe(przed);
  });

  it("dorzucenie elementu nie zmienia tozsamosci tablicy SCIAN", () => {
    const { result } = renderHook(() => useActiveFloorWalls());
    const przed = result.current;

    act(() => {
      useProjectStore.getState().setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] }));
    });

    expect(result.current).toBe(przed);
  });

  /** Stabilnosc nie moze isc za daleko: zmiana, ktora naprawde dotyczy tej tablicy,
   *  MA dac nowa tozsamosc — inaczej widok przestalby sie odswiezac. */
  it("dorzucenie elementu ZMIENIA tozsamosc tablicy elementow", () => {
    const { result } = renderHook(() => useActiveFloorElements());
    const przed = result.current;

    act(() => {
      useProjectStore.getState().setDraft((d) => ({ ...d, elements: [...d.elements, sampleElement] }));
    });

    expect(result.current).not.toBe(przed);
    expect(result.current).toHaveLength(przed.length + 1);
  });
});

/**
 * Zapisy projektów sprzed dodania danego pola po prostu go NIE MAJĄ — dotyczy to także
 * projektów leżących w chmurze, wczytywanych na dowolnym urządzeniu. Store uzupełnia
 * już tak `prices`, `costOverrides` i `panelConfig`; `docHeader` jako jedyny szedł
 * z zapisu surowy, przez co brak jednego pola kładł całą aplikację.
 */
describe("wczytanie projektu z niepełnym nagłówkiem dokumentów", () => {
  it("brakujące pola nagłówka są uzupełniane wartościami domyślnymi", () => {
    const { getProjectPayload, loadProjectPayload } = useProjectStore.getState();
    const payload = getProjectPayload();

    // Tak wygląda zapis sprzed dodania pola „obiekt".
    const niepelny = { ...payload, docHeader: { wykonawca: "Jan Kowalski" } as never };
    loadProjectPayload(niepelny);

    const { docHeader } = useProjectStore.getState();
    expect(docHeader.obiekt).toBe("");
    expect(docHeader.uklad).toBe("TN-S");
    // To, co w zapisie BYŁO, musi przetrwać uzupełnianie.
    expect(docHeader.wykonawca).toBe("Jan Kowalski");
  });

  it("brak całego nagłówka nie wywraca wczytywania", () => {
    const { getProjectPayload, loadProjectPayload } = useProjectStore.getState();
    const payload = getProjectPayload();
    const bezNaglowka = { ...payload, docHeader: undefined as never };

    expect(() => loadProjectPayload(bezNaglowka)).not.toThrow();
    expect(useProjectStore.getState().docHeader.uklad).toBe("TN-S");
  });
});
