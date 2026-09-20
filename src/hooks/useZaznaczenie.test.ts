import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useZaznaczenie } from "./useZaznaczenie";
import { useProjectStore } from "@/store/useProjectStore";
import type { InstallationElement } from "@/types";

/**
 * Piąte skupisko z `DesignTab` — i najbardziej opłacalne. Wzorzec „zaznacz jedno,
 * porzuć zaznaczenie wielokrotne" stał w komponencie DZIEWIĘĆ razy, a sześć razy
 * towarzyszyło mu otwarcie menu kontekstowego. Tutaj jest to jedno `zaznacz` i jedno
 * `menuKontekstowe`.
 */
describe("useZaznaczenie", () => {
  beforeEach(() => useProjectStore.getState().resetProject());

  const draft = () => useProjectStore.getState().draft;
  const el = (id: string): InstallationElement => ({
    id,
    type: "gniazdko",
    x: 0,
    y: 0,
    room: "Salon",
    floor: useProjectStore.getState().activeFloorId,
    dedicated: false,
    note: "",
    gangs: 1,
  });
  const zElementami = (...ids: string[]) =>
    act(() => useProjectStore.getState().setDraft((d) => ({ ...d, elements: ids.map(el) })));

  it("zaznaczenie pojedyncze porzuca zaznaczenie wielokrotne", () => {
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.setMultiSelected(["a", "b"]));
    act(() => result.current.zaznacz("el", "c"));
    expect(result.current.selected).toEqual({ kind: "el", id: "c" });
    expect(result.current.multiSelected).toEqual([]);
  });

  /** Menu najpierw ZAZNACZA, dopiero potem się otwiera — inaczej jego pozycje
   *  dotyczyłyby czegoś innego niż to, w co użytkownik kliknął. */
  it("menu kontekstowe zaznacza to, na czym je otwarto", () => {
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.menuKontekstowe("room", "r1", 10, 20));
    expect(result.current.selected).toEqual({ kind: "room", id: "r1" });
    expect(result.current.contextMenu).toEqual({ x: 10, y: 20, kind: "room", id: "r1", multi: false });
  });

  /** PPM na elemencie NALEŻĄCYM do zaznaczenia wielokrotnego nie rozbija go — menu
   *  ma wtedy dotyczyć całej grupy, a nie tego jednego elementu pod kursorem. */
  it("menu na elemencie z zaznaczonej grupy zostawia grupę w całości", () => {
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.setMultiSelected(["a", "b"]));
    act(() => result.current.menuElementu("a", 5, 6));
    expect(result.current.multiSelected).toEqual(["a", "b"]);
    expect(result.current.contextMenu).toMatchObject({ kind: "el", id: "a", multi: true });
  });

  it("menu na elemencie spoza grupy przestawia zaznaczenie na niego", () => {
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.setMultiSelected(["a", "b"]));
    act(() => result.current.menuElementu("c", 5, 6));
    expect(result.current.multiSelected).toEqual([]);
    expect(result.current.selected).toEqual({ kind: "el", id: "c" });
    expect(result.current.contextMenu).toMatchObject({ id: "c", multi: false });
  });

  it("usuwa zaznaczenie wielokrotne w całości", () => {
    zElementami("a", "b", "c");
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.setMultiSelected(["a", "b"]));
    act(() => result.current.usunZaznaczone());
    expect(draft().elements.map((e) => e.id)).toEqual(["c"]);
    expect(result.current.multiSelected).toEqual([]);
  });

  /** Usunięcie ściany kasuje też JEJ otwory — inaczej zostałyby osierocone,
   *  z `wallId` wskazującym na nieistniejącą ścianę. */
  it("usunięcie ściany zabiera ze sobą jej otwory", () => {
    act(() =>
      useProjectStore.getState().setDraft((d) => ({
        ...d,
        walls: [{ id: "w1", floor: "f", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thickness: 5 }],
        openings: [
          { id: "o1", floor: "f", wallId: "w1", x: 5, y: 0, angle: 0, width: 18, kind: "drzwi" as const },
          { id: "o2", floor: "f", wallId: "inna", x: 5, y: 0, angle: 0, width: 18, kind: "drzwi" as const },
        ],
      }))
    );
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.zaznacz("wall", "w1"));
    act(() => result.current.usunZaznaczone());
    expect(draft().walls).toHaveLength(0);
    expect(draft().openings.map((o) => o.id)).toEqual(["o2"]);
    expect(result.current.selected).toBeNull();
  });

  it("wyczyszczenie zdejmuje wszystko naraz", () => {
    const { result } = renderHook(() => useZaznaczenie());
    act(() => result.current.menuKontekstowe("el", "a", 1, 2));
    act(() => result.current.setMultiSelected(["a", "b"]));
    act(() => result.current.wyczysc());
    expect(result.current.selected).toBeNull();
    expect(result.current.multiSelected).toEqual([]);
    expect(result.current.contextMenu).toBeNull();
  });
});
