import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  CZAS_PRZYTRZYMANIA,
  TOLERANCJA_RUCHU,
  useDlugiePrzytrzymanie,
  type ZdarzenieDotyku,
} from "./useDlugiePrzytrzymanie";

/**
 * Menu kontekstowe otwierał wyłącznie prawy przycisk myszy — a w nim mieszka wszystko,
 * co się robi z zaznaczoną rzeczą (usuń, obróć, zatwierdź ścianę). Na telefonie nie było
 * do tego żadnej drogi: skróty `Delete` i `R` też wymagają klawiatury.
 *
 * Gest sprawdzamy tu, a nie na płótnie, bo to czysta reguła czasu i odległości.
 */
describe("długie przytrzymanie palcem", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Zdarzenie dotyku w kształcie, w jakim przychodzi z Konvy. */
  function dotyk(...palce: { x: number; y: number }[]): ZdarzenieDotyku & { zablokowane: boolean } {
    const e = {
      evt: {
        touches: palce.map((p) => ({ clientX: p.x, clientY: p.y })),
        preventDefault: () => {
          e.zablokowane = true;
        },
      },
      cancelBubble: false,
      zablokowane: false,
    };
    return e;
  }

  it("przytrzymanie otwiera menu w miejscu palca", () => {
    const { result } = renderHook(() => useDlugiePrzytrzymanie());
    const menu = vi.fn();
    const p = result.current.propsy(menu);

    act(() => p.onTouchStart(dotyk({ x: 120, y: 240 })));
    expect(menu).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
    expect(menu).toHaveBeenCalledWith(120, 240);
  });

  it("zwykłe dotknięcie NIE otwiera menu — palec schodzi przed czasem", () => {
    const { result } = renderHook(() => useDlugiePrzytrzymanie());
    const menu = vi.fn();
    const p = result.current.propsy(menu);

    act(() => p.onTouchStart(dotyk({ x: 10, y: 10 })));
    act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA - 50));
    act(() => p.onTouchEnd(dotyk()));
    act(() => void vi.advanceTimersByTime(500));
    expect(menu).not.toHaveBeenCalled();
  });

  /**
   * Palec nie stoi w miejscu tak jak kursor — nawet „nieruchome" przytrzymanie daje
   * kilka pikseli wędrówki. Przy zerowej tolerancji menu nie otwierałoby się prawie nigdy.
   */
  it("drgnięcie palca mieści się w tolerancji, przesunięcie przerywa gest", () => {
    const { result } = renderHook(() => useDlugiePrzytrzymanie());
    const menu = vi.fn();
    const p = result.current.propsy(menu);

    act(() => p.onTouchStart(dotyk({ x: 100, y: 100 })));
    act(() => p.onTouchMove(dotyk({ x: 100 + TOLERANCJA_RUCHU - 1, y: 100 })));
    act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
    expect(menu).toHaveBeenCalledTimes(1);

    menu.mockClear();
    act(() => p.onTouchStart(dotyk({ x: 100, y: 100 })));
    act(() => p.onTouchMove(dotyk({ x: 100 + TOLERANCJA_RUCHU + 5, y: 100 })));
    act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
    expect(menu).not.toHaveBeenCalled();
  });

  /** Dwa palce to szczypanie (patrz `gestDotyku.ts`), nie przytrzymanie. */
  it("dwa palce nie otwierają menu", () => {
    const { result } = renderHook(() => useDlugiePrzytrzymanie());
    const menu = vi.fn();
    const p = result.current.propsy(menu);

    act(() => p.onTouchStart(dotyk({ x: 80, y: 80 }, { x: 200, y: 80 })));
    act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
    expect(menu).not.toHaveBeenCalled();
  });

  describe("echo dorobionego kliknięcia", () => {
    /**
     * Po `touchend` przeglądarka dorabia `click` w miejscu palca. Bez straży menu
     * otwierałoby się i NATYCHMIAST stawiało pod sobą element.
     */
    it("po otwarciu menu pierwsze kliknięcie jest połykane, drugie już nie", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
      expect(result.current.pochlonEchoKliku()).toBe(true);
      expect(result.current.pochlonEchoKliku()).toBe(false);
    });

    it("zwykłe dotknięcie niczego nie połyka", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => p.onTouchEnd(dotyk()));
      expect(result.current.pochlonEchoKliku()).toBe(false);
    });

    /**
     * Dotknięcie zaraz po zamknięciu menu wpadało jeszcze w okno pamięci i było
     * połykane — element nie stawiał się wcale. Nowy gest musi ją kasować.
     */
    it("nowe dotknięcie kasuje pamięć o echu", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
      act(() => p.onTouchEnd(dotyk()));

      act(() => p.onTouchStart(dotyk({ x: 300, y: 300 })));
      expect(result.current.pochlonEchoKliku()).toBe(false);
    });

    /**
     * Gdy `preventDefault` zadziała, dorobiony klik nie przyjdzie WCALE — a pamięć
     * o echu zostałaby na zawsze i połknęła prawdziwe kliknięcie kiedyś później.
     */
    it("niewykorzystana pamięć o echu gaśnie sama", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
      act(() => void vi.advanceTimersByTime(1000));
      expect(result.current.pochlonEchoKliku()).toBe(false);
    });

    /**
     * Echo przychodzi po PUSZCZENIU palca, a nie po otwarciu menu. Okno liczone od
     * otwarcia gasło, zanim echo doszło, gdy ktoś trzymał palec dłużej albo render
     * menu trwał — i pod menu stawał element (e2e `przytrzymanie-dotykiem` w CI).
     */
    it("pamięć o echu liczy się od puszczenia palca, nie od otwarcia menu", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
      // palec trzymany jeszcze 600 ms po otwarciu menu — dłużej niż całe okno echa
      act(() => void vi.advanceTimersByTime(600));
      act(() => p.onTouchEnd(dotyk()));
      act(() => void vi.advanceTimersByTime(300));
      expect(result.current.pochlonEchoKliku()).toBe(true);
    });

    it("podniesienie palca po otwarciu menu blokuje dorobione zdarzenia u źródła", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      act(() => void vi.advanceTimersByTime(CZAS_PRZYTRZYMANIA));
      const koniec = dotyk();
      act(() => p.onTouchEnd(koniec));
      expect(koniec.zablokowane).toBe(true);
    });

    it("po zwykłym dotknięciu nic nie jest blokowane — klik ma dojść", () => {
      const { result } = renderHook(() => useDlugiePrzytrzymanie());
      const p = result.current.propsy(vi.fn());

      act(() => p.onTouchStart(dotyk({ x: 50, y: 50 })));
      const koniec = dotyk();
      act(() => p.onTouchEnd(koniec));
      expect(koniec.zablokowane).toBe(false);
    });
  });
});
