import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useProstokatPrzeciagany } from "./useProstokatPrzeciagany";

/**
 * Ramka zaznaczania i prostokąt pomieszczenia na płótnie — wspólny cykl
 * `zacznij` (mousedown) → `rozciagnij` (mousemove) → `zakoncz` (mouseup).
 */
describe("useProstokatPrzeciagany", () => {
  it("przeciągnięcie: kotwica, rozciąganie w dowolną stronę, wynik przy puszczeniu", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.zacznij({ x: 100, y: 100 }));
    expect(result.current.trwa()).toBe(true);
    expect(result.current.prostokat).toEqual({ x: 100, y: 100, w: 0, h: 0 });

    // w lewo i w górę — prostokąt nadal z dodatnimi wymiarami
    act(() => result.current.rozciagnij({ x: 40, y: 70 }));
    expect(result.current.prostokat).toEqual({ x: 40, y: 70, w: 60, h: 30 });

    let wynik = null as ReturnType<typeof result.current.zakoncz>;
    act(() => void (wynik = result.current.zakoncz()));
    expect(wynik).toEqual({ x: 40, y: 70, w: 60, h: 30 });
    expect(result.current.trwa()).toBe(false);
  });

  /**
   * Sedno refa: `mousemove` i `mouseup` w jednej turze — React jeszcze nie przerysował,
   * a `zakoncz` ma oddać rozmiar z OSTATNIEGO ruchu, nie sprzed niego.
   */
  it("zakoncz w tej samej turze co ostatni ruch oddaje rozmiar z tego ruchu", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.zacznij({ x: 0, y: 0 }));
    let wynik = null as ReturnType<typeof result.current.zakoncz>;
    act(() => {
      result.current.rozciagnij({ x: 10, y: 10 });
      result.current.rozciagnij({ x: 50, y: 20 });
      wynik = result.current.zakoncz();
    });
    expect(wynik).toEqual({ x: 0, y: 0, w: 50, h: 20 });
  });

  it("zakoncz NIE chowa podglądu — o tym decyduje wołający (tryb dwóch kliknięć)", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.zacznij({ x: 0, y: 0 }));
    act(() => result.current.rozciagnij({ x: 3, y: 3 }));
    act(() => void result.current.zakoncz());
    expect(result.current.prostokat).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    act(() => result.current.schowaj());
    expect(result.current.prostokat).toBeNull();
  });

  it("bez kotwicy rozciąga od podanego punktu (kotwica trybu dwóch kliknięć), a bez niego nic nie robi", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.rozciagnij({ x: 50, y: 50 }));
    expect(result.current.prostokat).toBeNull();
    act(() => result.current.rozciagnij({ x: 50, y: 50 }, { x: 10, y: 20 }));
    expect(result.current.prostokat).toEqual({ x: 10, y: 20, w: 40, h: 30 });
    expect(result.current.trwa()).toBe(false);
  });

  it("kotwica przeciągnięcia ma pierwszeństwo przed punktem z trybu dwóch kliknięć", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.zacznij({ x: 0, y: 0 }));
    act(() => result.current.rozciagnij({ x: 20, y: 20 }, { x: 100, y: 100 }));
    expect(result.current.prostokat).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  /**
   * Escape z wciśniętym przyciskiem: bez wyzerowania KOTWICY puszczenie przycisku
   * i tak zakładało pomieszczenie, mimo „anuluj" (patrz `anulujPodglad`).
   */
  it("porzuc kasuje kotwicę i podgląd — późniejszy mouseup nie ma czego oddać", () => {
    const { result } = renderHook(() => useProstokatPrzeciagany());
    act(() => result.current.zacznij({ x: 0, y: 0 }));
    act(() => result.current.rozciagnij({ x: 80, y: 80 }));
    act(() => result.current.porzuc());
    expect(result.current.trwa()).toBe(false);
    expect(result.current.prostokat).toBeNull();
    let wynik: unknown = "nie wołano";
    act(() => void (wynik = result.current.zakoncz()));
    expect(wynik).toBeNull();
  });
});
