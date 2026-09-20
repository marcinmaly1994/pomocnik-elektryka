import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOtwory } from "./useOtwory";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Trzecie skupisko stanu wyjęte z `DesignTab`. Dwie rzeczy są tu warte pilnowania
 * testem, bo obie wyszły z konkretnych zgłoszeń: świeżo postawiony otwór ma być OD RAZU
 * zaznaczony (inaczej „R" tuż po postawieniu nie ma czego obrócić), a otwór da się
 * zaczepić ZARÓWNO o ścianę, JAK I o krawędź pomieszczenia — bo pomieszczenia
 * narysowane bez osobnej ściany inaczej w ogóle nie miałyby jak dostać drzwi.
 */
describe("useOtwory", () => {
  beforeEach(() => useProjectStore.getState().resetProject());

  const otwory = () => useProjectStore.getState().draft.openings;
  const punkt = { x: 40, y: 0 };

  it("otwór na ŚCIANIE zapamiętuje ścianę, miejsce i kierunek", () => {
    const { result } = renderHook(() => useOtwory({}));
    act(() => result.current.wstawNaScianie("w1", punkt, 0));
    expect(otwory()).toHaveLength(1);
    expect(otwory()[0]).toMatchObject({
      wallId: "w1",
      x: 40,
      y: 0,
      angle: 0,
      kind: "drzwi",
      floor: useProjectStore.getState().activeFloorId,
    });
    expect(otwory()[0].roomId).toBeUndefined();
  });

  it("otwór na KRAWĘDZI POMIESZCZENIA zapamiętuje pomieszczenie zamiast ściany", () => {
    const { result } = renderHook(() => useOtwory({}));
    act(() => result.current.wstawNaKrawedziPokoju("r1", punkt, Math.PI / 2));
    expect(otwory()[0]).toMatchObject({ roomId: "r1", angle: Math.PI / 2 });
    expect(otwory()[0].wallId).toBeUndefined();
  });

  it("wstawiony otwór od razu melduje się do zaznaczenia", () => {
    const zaznaczone: string[] = [];
    const { result } = renderHook(() => useOtwory({ onZaznacz: (id) => zaznaczone.push(id) }));
    act(() => result.current.wstawNaScianie("w1", punkt, 0));
    expect(zaznaczone).toEqual([otwory()[0].id]);
  });

  it("rodzaj otworu decyduje o tym, co powstaje i jak szerokie", () => {
    const { result } = renderHook(() => useOtwory({}));
    act(() => result.current.setOpeningKind("okno"));
    act(() => result.current.wstawNaScianie("w1", punkt, 0));
    expect(otwory()[0].kind).toBe("okno");
    // Bez skalibrowanej skali szerokość jest w jednostkach planu, ale ma być dodatnia —
    // otwór o zerowej szerokości nie narysowałby się wcale.
    expect(otwory()[0].width).toBeGreaterThan(0);
  });

  it("obrót i odbicie to DWIE różne rzeczy i nie ruszają siebie nawzajem", () => {
    const { result } = renderHook(() => useOtwory({}));
    act(() => result.current.wstawNaScianie("w1", punkt, 0));
    const id = otwory()[0].id;
    act(() => result.current.obroc(id));
    expect(otwory()[0]).toMatchObject({ flip: true });
    expect(otwory()[0].lustro).toBeFalsy();
    act(() => result.current.odbij(id));
    expect(otwory()[0]).toMatchObject({ flip: true, lustro: true });
  });

  it("szerokość da się poprawić po wstawieniu", () => {
    const { result } = renderHook(() => useOtwory({}));
    act(() => result.current.wstawNaScianie("w1", punkt, 0));
    act(() => result.current.ustawSzerokosc(otwory()[0].id, 33));
    expect(otwory()[0].width).toBe(33);
  });

  /** Menu kontekstowe najpierw ZAZNACZA otwór, a dopiero potem się otwiera — inaczej
   *  pozycje menu dotyczyłyby czegoś innego niż to, w co użytkownik kliknął. */
  it("menu kontekstowe zaznacza otwór, zanim się pokaże", () => {
    const kolejnosc: string[] = [];
    const { result } = renderHook(() =>
      useOtwory({
        onZaznacz: () => kolejnosc.push("zaznacz"),
        onMenuKontekstowe: () => kolejnosc.push("menu"),
      })
    );
    act(() => result.current.menuKontekstowe("o1", 10, 20));
    expect(kolejnosc).toEqual(["zaznacz", "menu"]);
  });
});
