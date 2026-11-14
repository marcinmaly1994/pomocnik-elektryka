import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWarstwyWidoku } from "./useWarstwyWidoku";
import { DEFAULT_ELEMENT_SCALE } from "@/lib/symbolScale";

describe("useWarstwyWidoku", () => {
  /** Domyślne wartości są decyzjami (powody w hooku) — zmiana którejś ma być świadoma. */
  it("wartości domyślne", () => {
    const { result } = renderHook(() => useWarstwyWidoku());
    const w = result.current;
    expect({
      showZones: w.showZones,
      showRoutes: w.showRoutes,
      showDimensions: w.showDimensions,
      showAreas: w.showAreas,
      showHeights: w.showHeights,
      showUnderlay: w.showUnderlay,
      snapOn: w.snapOn,
      gridOn: w.gridOn,
      wallSnapOn: w.wallSnapOn,
      elementScale: w.elementScale,
      ukryteKategorie: w.ukryteKategorie,
    }).toEqual({
      showZones: true,
      showRoutes: false,
      showDimensions: false,
      showAreas: false,
      showHeights: false,
      showUnderlay: false,
      snapOn: false,
      gridOn: true,
      wallSnapOn: true,
      elementScale: DEFAULT_ELEMENT_SCALE,
      ukryteKategorie: [],
    });
  });

  it("przełączniki paska zmieniają wartość, którą widzi też DesignTab", () => {
    const { result } = renderHook(() => useWarstwyWidoku());
    act(() => result.current.paskowi.onToggleZones());
    act(() => result.current.paskowi.onToggleDimensions());
    act(() => result.current.paskowi.onToggleUnderlay());
    act(() => result.current.paskowi.onGridChange(false));
    act(() => result.current.paskowi.onElementScaleChange(1.5));
    expect(result.current.showZones).toBe(false);
    expect(result.current.showDimensions).toBe(true);
    expect(result.current.showUnderlay).toBe(true);
    expect(result.current.gridOn).toBe(false);
    expect(result.current.elementScale).toBe(1.5);
    expect(result.current.paskowi.showDimensions).toBe(true);
  });

  it("rysowanie od zera włącza przyciąganie do siatki z zewnątrz (startManualDrawing)", () => {
    const { result } = renderHook(() => useWarstwyWidoku());
    act(() => result.current.setSnapOn(true));
    expect(result.current.snapOn).toBe(true);
    expect(result.current.paskowi.snapOn).toBe(true);
  });

  describe("filtry kategorii (F8)", () => {
    it("przełączenie ukrywa i pokazuje kategorię", () => {
      const { result } = renderHook(() => useWarstwyWidoku());
      act(() => result.current.paskowi.onPrzelaczKategorie("Gniazda"));
      act(() => result.current.paskowi.onPrzelaczKategorie("Oświetlenie"));
      expect(result.current.ukryteKategorie).toEqual(["Gniazda", "Oświetlenie"]);
      act(() => result.current.paskowi.onPrzelaczKategorie("Gniazda"));
      expect(result.current.ukryteKategorie).toEqual(["Oświetlenie"]);
    });

    /** Stawiany element ukrytej kategorii zniknąłby spod kursora. */
    it("pokazKategorie przywraca tylko ukrytą — a widocznej NIE ukrywa (to nie przełącznik)", () => {
      const { result } = renderHook(() => useWarstwyWidoku());
      act(() => result.current.paskowi.onPrzelaczKategorie("Gniazda"));
      act(() => result.current.pokazKategorie("Gniazda"));
      expect(result.current.ukryteKategorie).toEqual([]);
      act(() => result.current.pokazKategorie("Gniazda"));
      expect(result.current.ukryteKategorie).toEqual([]);
    });

    it("pokazWszystkieKategorie czyści filtr", () => {
      const { result } = renderHook(() => useWarstwyWidoku());
      act(() => result.current.paskowi.onPrzelaczKategorie("Gniazda"));
      act(() => result.current.paskowi.onPrzelaczKategorie("Teletechnika"));
      act(() => result.current.pokazWszystkieKategorie());
      expect(result.current.ukryteKategorie).toEqual([]);
    });
  });
});
