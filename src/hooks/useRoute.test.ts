import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRoute } from "./useRoute";

/**
 * Dwie zasady, na ktorych stoi nawigacja miedzy zakladkami — obie wyszly dopiero
 * przy komplecie dokumentacji, ktory przelacza zakladki z okna stojacego OBOK nich.
 */
describe("useRoute", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  /**
   * `pushState`/`replaceState` NIE odpalaja `popstate`, wiec kazda instancja hooka
   * widziala wylacznie wlasne nawigacje. Dopoki zakladki nawigowaly same do siebie,
   * bylo to niewidoczne; okno przelaczajace zakladki z zewnatrz po prostu nie
   * doprowadzalo `App` do zmiany widoku.
   */
  it("nawigacja z jednej instancji dociera do wszystkich", () => {
    const a = renderHook(() => useRoute());
    const b = renderHook(() => useRoute());

    act(() => a.result.current[1]("kosztorys"));

    expect(a.result.current[0].tab).toBe("kosztorys");
    expect(b.result.current[0].tab).toBe("kosztorys");
  });

  /**
   * „Pokaz te zakladke" nie ma jej RESETOWAC. Zakladki z parametrem trzymaja w nim,
   * co dokladnie jest otwarte — wywolanie bez parametru kasowalo go i zabieralo
   * uzytkownika z protokolu, ktory wlasnie wypelnial (patrz `setTab` w App po
   * wczytaniu zestawu z chmury).
   */
  it("przejscie na zakladke, na ktorej juz jestesmy, zachowuje jej parametr", () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current[1]("protokoly", "izolacja"));
    expect(result.current[0].param).toBe("izolacja");

    act(() => result.current[1]("protokoly"));
    expect(result.current[0].param).toBe("izolacja");
  });

  it("jawny parametr nadal go zmienia, a jawny null czysci", () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current[1]("protokoly", "izolacja"));
    act(() => result.current[1]("protokoly", "petla"));
    expect(result.current[0].param).toBe("petla");

    act(() => result.current[1]("protokoly", null));
    expect(result.current[0].param).toBeNull();
  });

  it("wejscie na INNA zakladke nie dziedziczy parametru poprzedniej", () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current[1]("protokoly", "izolacja"));
    act(() => result.current[1]("kalkulatory"));
    expect(result.current[0].tab).toBe("kalkulatory");
    expect(result.current[0].param).toBeNull();
  });
});
