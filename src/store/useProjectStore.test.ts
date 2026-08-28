import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./useProjectStore";

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
});
