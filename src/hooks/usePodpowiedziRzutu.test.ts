import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode, createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { usePodpowiedziRzutu } from "./usePodpowiedziRzutu";
import { KLUCZ_POWITANIE, KLUCZ_UMIE, ODSTEP_ZGLOSZEN_KOLKA } from "@/lib/podpowiedziNawigacji";

/** Ten sam hook pod `StrictMode` — tam React woła funkcje aktualizujące stan dwa razy. */
const scisly = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe("usePodpowiedziRzutu", () => {
  beforeEach(() => localStorage.clear());

  describe("po wgraniu podkładu", () => {
    it("ktoś nowy: najpierw dymek o nawigacji, skala czeka w kolejce", () => {
      const { result } = renderHook(() => usePodpowiedziRzutu());
      act(() => result.current.poWgraniuPodkladu());
      expect(result.current.dymek).toBe("nawigacja");
      act(() => result.current.zamknijPowitanieNawigacji());
      expect(result.current.dymek).toBe("skala");
    });

    it("kto nawigację już zna (zapis z poprzedniej wizyty) — prosto do skali", () => {
      localStorage.setItem(KLUCZ_UMIE, "1");
      const { result } = renderHook(() => usePodpowiedziRzutu());
      act(() => result.current.poWgraniuPodkladu());
      expect(result.current.dymek).toBe("skala");
    });

    it("kto odrzucił powitanie — też prosto do skali", () => {
      localStorage.setItem(KLUCZ_POWITANIE, "1");
      const { result } = renderHook(() => usePodpowiedziRzutu());
      act(() => result.current.poWgraniuPodkladu());
      expect(result.current.dymek).toBe("skala");
    });
  });

  it("„Rozumiem\" zapamiętuje odrzucenie powitania na następną wizytę", () => {
    const { result } = renderHook(() => usePodpowiedziRzutu());
    act(() => result.current.poWgraniuPodkladu());
    act(() => result.current.zamknijPowitanieNawigacji());
    expect(localStorage.getItem(KLUCZ_POWITANIE)).toBe("1");
  });

  it("pierwsze przybliżenie przy otwartym dymku nawigacji oddaje scenę skali i zapamiętuje umiejętność", () => {
    const { result } = renderHook(() => usePodpowiedziRzutu());
    act(() => result.current.poWgraniuPodkladu());
    act(() => result.current.oznaczUmiejetnoscNawigacji());
    expect(result.current.dymek).toBe("skala");
    expect(localStorage.getItem(KLUCZ_UMIE)).toBe("1");
  });

  /**
   * Pułapka trybu ścisłego: opróżnianie kolejki wewnątrz funkcji aktualizującej stan
   * działało dwa razy — drugie wywołanie zastawało pustą kolejkę i kasowało dymek.
   */
  it("pod StrictMode przybliżenie nie kasuje czekającego dymka o skali", () => {
    const { result } = renderHook(() => usePodpowiedziRzutu(), { wrapper: scisly });
    act(() => result.current.poWgraniuPodkladu());
    act(() => result.current.oznaczUmiejetnoscNawigacji());
    expect(result.current.dymek).toBe("skala");
  });

  it("przybliżenie przy INNYM dymku go nie rusza", () => {
    const { result } = renderHook(() => usePodpowiedziRzutu());
    act(() => result.current.pokazDymek("sciany"));
    act(() => result.current.oznaczUmiejetnoscNawigacji());
    expect(result.current.dymek).toBe("sciany");
  });

  describe("kółko bez Ctrl", () => {
    afterEach(() => vi.useRealTimers());

    it("podnosi sygnał, ale nie częściej niż co ODSTEP_ZGLOSZEN_KOLKA", () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);
      const { result } = renderHook(() => usePodpowiedziRzutu());
      act(() => result.current.zglosKolkoBezCtrl());
      act(() => result.current.zglosKolkoBezCtrl());
      expect(result.current.sygnalKolka).toBe(1);
      vi.setSystemTime(10_000 + ODSTEP_ZGLOSZEN_KOLKA);
      act(() => result.current.zglosKolkoBezCtrl());
      expect(result.current.sygnalKolka).toBe(2);
    });

    it("milczy, gdy ktoś już umie przybliżać albo gdy otwarte jest powitanie", () => {
      const { result } = renderHook(() => usePodpowiedziRzutu());
      act(() => result.current.poWgraniuPodkladu()); // powitanie otwarte
      act(() => result.current.zglosKolkoBezCtrl());
      expect(result.current.sygnalKolka).toBe(0);
      act(() => result.current.oznaczUmiejetnoscNawigacji());
      act(() => result.current.zglosKolkoBezCtrl());
      expect(result.current.sygnalKolka).toBe(0);
    });
  });
});
