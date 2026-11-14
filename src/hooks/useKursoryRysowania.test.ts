import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useKursoryRysowania } from "./useKursoryRysowania";
import type { Przyciagniecie } from "@/lib/drawSnap";

const NAROZNIK = { point: { x: 100, y: 0 }, rodzaj: "naroznik" } as unknown as Przyciagniecie;

describe("useKursoryRysowania", () => {
  it("pokazPomoc ustawia zaczep i znacznik osi z jednego wyniku przyciągania", () => {
    const { result } = renderHook(() => useKursoryRysowania());
    act(() => result.current.pokazPomoc({ punkt: { x: 40, y: 0 }, zaczep: null, wyrownanie: { x: false, y: true } }));
    expect(result.current.zaczep).toBeNull();
    expect(result.current.osie).toEqual({ punkt: { x: 40, y: 0 }, x: false, y: true });

    act(() => result.current.pokazPomoc({ punkt: { x: 100, y: 0 }, zaczep: NAROZNIK, wyrownanie: { x: false, y: false } }));
    expect(result.current.zaczep).toBe(NAROZNIK);
    expect(result.current.osie).toEqual({ punkt: { x: 100, y: 0 }, x: false, y: false });
  });

  /** Zgaszenie samego zaczepu zostawiało znacznik osi przy domkniętej figurze. */
  it("bezPomocy gasi OBA sygnały naraz", () => {
    const { result } = renderHook(() => useKursoryRysowania());
    act(() => result.current.pokazPomoc({ punkt: { x: 1, y: 2 }, zaczep: NAROZNIK, wyrownanie: { x: true, y: true } }));
    act(() => result.current.bezPomocy());
    expect(result.current.zaczep).toBeNull();
    expect(result.current.osie).toBeNull();
  });

  it("kursory pokoju i ściany są niezależne od pomocy i od siebie", () => {
    const { result } = renderHook(() => useKursoryRysowania());
    act(() => {
      result.current.setKursorPokoju({ x: 5, y: 5 });
      result.current.setKursorSciany({ x: 9, y: 9 });
    });
    act(() => result.current.bezPomocy());
    expect(result.current.kursorPokoju).toEqual({ x: 5, y: 5 });
    expect(result.current.kursorSciany).toEqual({ x: 9, y: 9 });
    act(() => result.current.setKursorSciany(null));
    expect(result.current.kursorPokoju).toEqual({ x: 5, y: 5 });
  });

  it("funkcje są stabilne między renderami (bezpieczne w zależnościach efektów)", () => {
    const { result, rerender } = renderHook(() => useKursoryRysowania());
    const { pokazPomoc, bezPomocy, setKursorPokoju, setKursorSciany } = result.current;
    rerender();
    expect(result.current.pokazPomoc).toBe(pokazPomoc);
    expect(result.current.bezPomocy).toBe(bezPomocy);
    expect(result.current.setKursorPokoju).toBe(setKursorPokoju);
    expect(result.current.setKursorSciany).toBe(setKursorSciany);
  });
});
