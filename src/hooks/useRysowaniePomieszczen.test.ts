import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRysowaniePomieszczen } from "./useRysowaniePomieszczen";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Drugie skupisko stanu wyjęte z `DesignTab`. Testy pilnują tego, co hook obiecuje
 * na zewnątrz — a najwięcej wartości jest w sprzężeniu nazwy z typem, bo to ono
 * decyduje o regułach doboru (strefa mokra, gniazda hermetyczne), a nie o samym
 * napisie na rzucie. Klikanie po planie pilnuje e2e.
 */
describe("useRysowaniePomieszczen", () => {
  beforeEach(() => useProjectStore.getState().resetProject());

  const pokoje = () => useProjectStore.getState().draft.roomShapes;
  const trojkat = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("propozycja bierze kolejną nazwę zastępczą i typ zgadnięty z tej nazwy", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    expect(result.current.pendingRoom).toMatchObject({ points: trojkat, type: "inne", typeTouched: false });
    expect(result.current.pendingRoom!.name).toBeTruthy();
  });

  /** Podpowiedź typu śledzi nazwę tylko dopóki użytkownik sam nic nie wybrał z listy. */
  it("zmiana nazwy przestawia typ, dopóki typ nie został wybrany ręcznie", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienNazwe("Łazienka"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Łazienka", type: "lazienka" });
  });

  it("po ręcznym wyborze typu nazwa już go nie nadpisuje", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienTyp("kotlownia"));
    act(() => result.current.zmienNazwe("Łazienka"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Łazienka", type: "kotlownia" });
  });

  /** Wybór z listy ustawia też nazwę na etykietę typu — dla większości pomieszczeń
   *  to i tak docelowa nazwa, więc bez tego trzeba wpisać to samo słowo dwa razy. */
  it("wybór typu podstawia jego etykietę jako nazwę", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienTyp("kuchnia"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Kuchnia", type: "kuchnia" });
  });

  /** Wpisana nazwa przetrwa wybór typu z listy (audyt 5.11.2026, B6) — wcześniej
   *  „Łazienka dzieci" + typ „Łazienka / WC" zapisywało się jako „Łazienka / WC". */
  it("wybór typu nie nadpisuje nazwy wpisanej ręcznie", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienNazwe("Łazienka dzieci"));
    act(() => result.current.zmienTyp("lazienka"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Łazienka dzieci", type: "lazienka" });
  });

  it("wyczyszczona nazwa znów podąża za wyborem typu", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienNazwe(""));
    act(() => result.current.zmienTyp("kuchnia"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Kuchnia", type: "kuchnia" });
  });

  /** Okno pokazuje nazwę, która naprawdę trafi do projektu — z numerem, gdy taki pokój
   *  już jest na kondygnacji (audyt 5.11.2026, B7). */
  it("wybór typu, którego pokój już jest, podstawia nazwę z numerem", () => {
    useProjectStore.getState().addRoomShape(useProjectStore.getState().activeFloorId, trojkat, "Sypialnia");
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienTyp("sypialnia"));
    expect(result.current.pendingRoom).toMatchObject({ name: "Sypialnia 2", type: "sypialnia" });
    act(() => result.current.zapisz());
    expect(useProjectStore.getState().draft.roomShapes.map((r) => r.name)).toEqual(["Sypialnia", "Sypialnia 2"]);
  });

  it("zapis dodaje pomieszczenie na aktywnej kondygnacji i zamyka propozycję", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zmienTyp("kuchnia"));
    act(() => result.current.zapisz());
    expect(pokoje()).toHaveLength(1);
    expect(pokoje()[0]).toMatchObject({
      name: "Kuchnia",
      type: "kuchnia",
      points: trojkat,
      floor: useProjectStore.getState().activeFloorId,
    });
    expect(result.current.pendingRoom).toBeNull();
  });

  it("figura z dwóch punktów nie tworzy propozycji, ale szkic i tak znika", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.setDrawingRoomPoints(trojkat.slice(0, 2)));
    act(() => result.current.zakonczRysowanie());
    expect(result.current.pendingRoom).toBeNull();
    expect(result.current.drawingRoomPoints).toEqual([]);
  });

  it("zakończenie rysowania zamienia szkic w propozycję", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.setDrawingRoomPoints(trojkat));
    act(() => result.current.zakonczRysowanie());
    expect(result.current.pendingRoom).toMatchObject({ points: trojkat });
    expect(result.current.drawingRoomPoints).toEqual([]);
  });

  /** Ta sama tablica trzyma kotwicę prostokąta co punkty wieloboku, więc zmiana trybu
   *  musi ją wyczyścić — inaczej pierwszy klik w nowym trybie liczyłby się od kotwicy
   *  zostawionej w poprzednim. */
  it("zmiana trybu przerywa figurę zaczętą w poprzednim", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.setDrawingRoomPoints(trojkat));
    act(() => result.current.ustawTryb("wielobok"));
    expect(result.current.roomMode).toBe("wielobok");
    expect(result.current.drawingRoomPoints).toEqual([]);
  });

  it("zamknięcie propozycji nie tworzy pomieszczenia", () => {
    const { result } = renderHook(() => useRysowaniePomieszczen());
    act(() => result.current.zaproponuj(trojkat));
    act(() => result.current.zamknijPropozycje());
    expect(result.current.pendingRoom).toBeNull();
    expect(pokoje()).toHaveLength(0);
  });
});
