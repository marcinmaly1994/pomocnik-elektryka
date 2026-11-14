import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement, createRef, useImperativeHandle, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { act, render } from "@testing-library/react";
import { useKadrPlotna, PO_GESCIE_KADRU_MS, type OpcjeKadru, type WidokSterowanie } from "./useKadrPlotna";
import { MAX_ZOOM } from "@/components/design/zoomPlanu";

type Kadr = ReturnType<typeof useKadrPlotna>;

/**
 * Hook podpięty pod PRAWDZIWY `div` — nasłuch dotyku montuje się na kontenerze, więc
 * sam `renderHook` (bez elementu) nie sprawdziłby z gestów niczego.
 */
function Plotno({ opcje, uchwyt }: { opcje: OpcjeKadru; uchwyt: Ref<Kadr> }) {
  const kadr = useKadrPlotna(opcje);
  useImperativeHandle(uchwyt, () => kadr);
  return createElement("div", { ref: kadr.kontenerRef });
}

function zamontuj(opcje: Partial<OpcjeKadru> = {}) {
  const uchwyt = createRef<Kadr>();
  const onZoomChange = vi.fn();
  const pelne: OpcjeKadru = { zoom: 1, onZoomChange, narzedziePrzesuwania: false, ...opcje };
  const r = render(createElement(Plotno, { opcje: pelne, uchwyt }));
  const okno = r.container.firstElementChild as HTMLElement;
  // jsdom nie zna przechwytywania wskaźnika.
  okno.setPointerCapture = vi.fn();
  okno.releasePointerCapture = vi.fn();
  return {
    kadr: () => uchwyt.current!,
    okno,
    onZoomChange: opcje.onZoomChange ?? onZoomChange,
    /** Nowe propsy — jak rodzic po zmianie powiększenia. */
    zmien: (nowe: Partial<OpcjeKadru>) => r.rerender(createElement(Plotno, { opcje: { ...pelne, ...nowe }, uchwyt })),
  };
}

/** Zdarzenie dotyku z listą palców. jsdom nie ma konstruktora `Touch`, a hookowi
 *  wystarczy `clientX`/`clientY`. */
function dotyk(okno: HTMLElement, typ: string, palce: [number, number][], naKsztalcie = false) {
  const e = new Event(typ, { cancelable: true, bubbles: true });
  Object.defineProperty(e, "touches", { value: palce.map(([clientX, clientY]) => ({ clientX, clientY })) });
  if (naKsztalcie) e.preventDefault(); // tak zostawia je Konva po trafieniu w kształt
  act(() => {
    okno.dispatchEvent(e);
  });
  return e;
}

function wskaznik(p: Partial<ReactPointerEvent<HTMLDivElement>>) {
  return { button: 0, pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, preventDefault: vi.fn(), ...p } as unknown as ReactPointerEvent<HTMLDivElement>;
}

describe("useKadrPlotna", () => {
  afterEach(() => vi.useRealTimers());

  describe("Ctrl + kółko", () => {
    it("przybliża, a punkt spod kursora zostaje pod kursorem", () => {
      const t = zamontuj();
      const evt = new WheelEvent("wheel", { clientX: 100, clientY: 50, deltaY: -1, cancelable: true });
      act(() => t.kadr().przyblizKolkiem(evt));
      expect(evt.defaultPrevented).toBe(true);
      expect(t.onZoomChange).toHaveBeenCalledWith(1.1);
      t.zmien({ zoom: 1.1 });
      const { widok } = t.kadr();
      expect(widok.x + 100 / 1.1).toBeCloseTo(100);
      expect(widok.y + 50 / 1.1).toBeCloseTo(50);
    });

    it("na granicy powiększenia nic nie zmienia", () => {
      const t = zamontuj({ zoom: MAX_ZOOM });
      act(() => t.kadr().przyblizKolkiem(new WheelEvent("wheel", { deltaY: -1, cancelable: true })));
      expect(t.onZoomChange).not.toHaveBeenCalled();
    });
  });

  describe("mysz", () => {
    it("wciśnięta rolka przesuwa rzut za kursorem — przy każdym narzędziu", () => {
      const t = zamontuj({ zoom: 2 });
      act(() => t.kadr().zacznijPrzesuwanie(wskaznik({ button: 1, clientX: 10, clientY: 10 })));
      expect(t.kadr().przesuwa).toBe(true);
      expect(t.kadr().trwaPrzesuwanie()).toBe(true);
      act(() => t.kadr().przesun(wskaznik({ clientX: 60, clientY: 30 })));
      // 50 px w prawo przy powiększeniu 2 = 25 jednostek planu; rysunek jedzie za myszą.
      expect(t.kadr().widok).toEqual({ x: -25, y: -10 });
      act(() => t.kadr().zakonczPrzesuwanie(wskaznik({})));
      expect(t.kadr().przesuwa).toBe(false);
      expect(t.kadr().trwaPrzesuwanie()).toBe(false);
    });

    it("lewy przycisk przesuwa tylko w „Przesuń widok”", () => {
      const t = zamontuj();
      act(() => t.kadr().zacznijPrzesuwanie(wskaznik({ button: 0 })));
      expect(t.kadr().przesuwa).toBe(false);
      t.zmien({ narzedziePrzesuwania: true });
      act(() => t.kadr().zacznijPrzesuwanie(wskaznik({ button: 0 })));
      expect(t.kadr().przesuwa).toBe(true);
    });

    /** Palec ma własną drogę, która zna też szczypanie — dwie naraz biłyby się o kadr. */
    it("wskaźnik typu „touch” nie zaczyna przesuwania myszą", () => {
      const t = zamontuj({ narzedziePrzesuwania: true });
      act(() => t.kadr().zacznijPrzesuwanie(wskaznik({ pointerType: "touch" })));
      expect(t.kadr().przesuwa).toBe(false);
    });
  });

  describe("jeden palec", () => {
    it("ruch w bok przesuwa rzut i zatrzymuje przewijanie strony", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100]]);
      const ruch = dotyk(t.okno, "touchmove", [[60, 102]]);
      expect(ruch.defaultPrevented).toBe(true);
      // Punkt chwycony w miejscu dotknięcia jedzie dokładnie pod palcem.
      expect(t.kadr().widok).toEqual({ x: 40, y: -2 });
    });

    it("ruch w pionie zostaje stronie (przewijanie) — rzut stoi", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100]]);
      const ruch = dotyk(t.okno, "touchmove", [[101, 40]]);
      expect(ruch.defaultPrevented).toBe(false);
      dotyk(t.okno, "touchmove", [[160, 40]]); // gest raz oddany — oddany do końca
      expect(t.kadr().widok).toEqual({ x: 0, y: 0 });
      expect(t.kadr().poGescieKadru()).toBe(false);
    });

    it("pion jednak należy do rzutu w „Przesuń widok” i na narysowanym kształcie", () => {
      const pan = zamontuj({ narzedziePrzesuwania: true });
      dotyk(pan.okno, "touchstart", [[100, 100]]);
      dotyk(pan.okno, "touchmove", [[100, 40]]);
      expect(pan.kadr().widok).toEqual({ x: 0, y: 60 });

      const ksztalt = zamontuj();
      dotyk(ksztalt.okno, "touchstart", [[100, 100]], true);
      dotyk(ksztalt.okno, "touchmove", [[100, 40]]);
      expect(ksztalt.kadr().widok).toEqual({ x: 0, y: 60 });
    });

    it("drżenie palca poniżej progu to nadal dotknięcie, nie gest kadru", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100]]);
      dotyk(t.okno, "touchmove", [[104, 103]]);
      dotyk(t.okno, "touchend", []);
      expect(t.kadr().widok).toEqual({ x: 0, y: 0 });
      expect(t.kadr().poGescieKadru()).toBe(false);
    });

    /** Konva odpala `tap` także po przesunięciu — straż ma go połknąć, i to chwilę
     *  PO zejściu palca, bo dorobione zdarzenia przychodzą po `touchend`. */
    it("po przesunięciu straż `poGescieKadru` trzyma jeszcze chwilę", () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100]]);
      dotyk(t.okno, "touchmove", [[40, 100]]);
      expect(t.kadr().poGescieKadru()).toBe(true);
      dotyk(t.okno, "touchend", []);
      expect(t.kadr().poGescieKadru()).toBe(true);
      vi.setSystemTime(10_000 + PO_GESCIE_KADRU_MS);
      expect(t.kadr().poGescieKadru()).toBe(false);
    });
  });

  describe("szczypanie", () => {
    it("rozsunięcie palców przybliża proporcjonalnie, środek gestu zostaje pod palcami", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100]]);
      dotyk(t.okno, "touchstart", [[100, 100], [200, 100]]);
      expect(t.kadr().szczypie).toBe(true);
      const ruch = dotyk(t.okno, "touchmove", [[50, 100], [250, 100]]);
      expect(ruch.defaultPrevented).toBe(true);
      expect(t.onZoomChange).toHaveBeenCalledWith(2);
      t.zmien({ zoom: 2 });
      // Punkt planu (150, 100) spod środka palców leży nadal pod środkiem (150, 100).
      const { widok } = t.kadr();
      expect(widok.x + 150 / 2).toBeCloseTo(150);
      expect(widok.y + 100 / 2).toBeCloseTo(100);
    });

    it("palce w stałym rozstawie przesuwają rzut bez zmiany powiększenia", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100], [200, 100]]);
      dotyk(t.okno, "touchmove", [[130, 120], [230, 120]]);
      expect(t.onZoomChange).not.toHaveBeenCalled();
      expect(t.kadr().widok).toEqual({ x: -30, y: -20 });
    });

    /** Na czas szczypania nic nie jest przeciągalne — przeciąganie wraca po zejściu
     *  DRUGIEGO palca, nie dopiero ostatniego. */
    it("szczypie gaśnie, gdy na ekranie zostaje jeden palec", () => {
      const t = zamontuj();
      dotyk(t.okno, "touchstart", [[100, 100], [200, 100]]);
      dotyk(t.okno, "touchend", [[100, 100]]);
      expect(t.kadr().szczypie).toBe(false);
      expect(t.kadr().poGescieKadru()).toBe(true); // jeden palec dalej na ekranie
    });
  });

  it("uchwyt dla rodzica: `ustaw` i `przesunOPiksele` w bieżącym powiększeniu", () => {
    const widokRef = { current: null as WidokSterowanie | null };
    const t = zamontuj({ zoom: 2, widokRef });
    act(() => widokRef.current!.ustaw(10, 20));
    expect(t.kadr().widok).toEqual({ x: 10, y: 20 });
    act(() => widokRef.current!.przesunOPiksele(40, -20));
    expect(t.kadr().widok).toEqual({ x: 30, y: 10 });
  });
});
