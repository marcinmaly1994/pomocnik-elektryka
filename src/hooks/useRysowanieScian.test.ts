import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRysowanieScian } from "./useRysowanieScian";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Rysowanie ścian to pierwsze skupisko stanu wyjęte z `DesignTab` do własnego hooka.
 * Testy pilnują TEGO, CO HOOK OBIECUJE na zewnątrz — że szkic trafia do projektu
 * na właściwą kondygnację i z ustawioną grubością, a po zatwierdzeniu znika.
 * Same przepływy klikania po planie pilnuje e2e (`wall-drawing.spec.ts`).
 */
describe("useRysowanieScian", () => {
  beforeEach(() => useProjectStore.getState().resetProject());

  const sciany = () => useProjectStore.getState().draft.walls;

  it("zatwierdzona ściana trafia do projektu z ustawioną grubością i na aktywną kondygnację", () => {
    const { result } = renderHook(() => useRysowanieScian({}));
    act(() => {
      result.current.setWallThickness(9);
      result.current.setDrawingWall([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);
    });
    act(() => result.current.finishWall());
    expect(sciany()).toHaveLength(1);
    expect(sciany()[0]).toMatchObject({ thickness: 9, floor: useProjectStore.getState().activeFloorId });
    // Szkic znika, inaczej kolejne kliknięcie dopisywałoby punkty do zatwierdzonej ściany.
    expect(result.current.drawingWall).toEqual([]);
  });

  it("z jednego punktu nie powstaje ściana", () => {
    const { result } = renderHook(() => useRysowanieScian({}));
    act(() => result.current.setDrawingWall([{ x: 0, y: 0 }]));
    act(() => result.current.finishWall());
    expect(sciany()).toHaveLength(0);
    expect(result.current.drawingWall).toEqual([]);
  });

  /**
   * `closeWall` NIE może czytać punktu domykającego ze stanu — `setDrawingWall` jest
   * asynchroniczny, więc w chwili tego kliknięcia stan go jeszcze nie zna. Punkt
   * przychodzi argumentem i ma wylądować na końcu zapisanej ściany.
   */
  it("domknięcie dokłada punkt zamykający i melduje pętlę do nazwania", () => {
    const zamkniete: string[] = [];
    const { result } = renderHook(() => useRysowanieScian({ onPetlaZamknieta: (id) => zamkniete.push(id) }));
    act(() =>
      result.current.setDrawingWall([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ])
    );
    act(() => result.current.closeWall({ x: 0, y: 0 }));
    expect(sciany()).toHaveLength(1);
    expect(sciany()[0].points).toHaveLength(4);
    expect(sciany()[0].points[3]).toEqual({ x: 0, y: 0 });
    expect(zamkniete).toEqual([sciany()[0].id]);
  });

  /** Ściana domknięta w pętlę o ZEROWYM polu nie jest obrysem pomieszczenia, więc
   *  nie ma czego proponować do nazwania. */
  it("zdegenerowana pętla nie jest zgłaszana do nazwania", () => {
    const zamkniete: string[] = [];
    const { result } = renderHook(() => useRysowanieScian({ onPetlaZamknieta: (id) => zamkniete.push(id) }));
    act(() =>
      result.current.setDrawingWall([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ])
    );
    act(() => result.current.closeWall({ x: 0, y: 0 }));
    expect(sciany()).toHaveLength(1);
    expect(zamkniete).toEqual([]);
  });

  it("ściana z obrysu pomieszczenia powtarza jego kształt i domyka się pierwszym punktem", () => {
    const punkty = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    act(() =>
      useProjectStore.getState().setDraft((d) => ({
        ...d,
        roomShapes: [
          { id: "r1", floor: useProjectStore.getState().activeFloorId, name: "Salon", color: "#3B8C63", points: punkty },
        ],
      }))
    );
    const { result } = renderHook(() => useRysowanieScian({}));
    act(() => result.current.createWallFromRoom("r1"));
    expect(sciany()).toHaveLength(1);
    expect(sciany()[0].points).toEqual([...punkty, punkty[0]]);
  });

  it("nieznane pomieszczenie nie tworzy ściany", () => {
    const { result } = renderHook(() => useRysowanieScian({}));
    act(() => result.current.createWallFromRoom("nie-ma-takiego"));
    expect(sciany()).toHaveLength(0);
  });
});
