import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWstawianieElementu } from "./useWstawianieElementu";
import { useProjectStore } from "@/store/useProjectStore";
import { NO_ROOM } from "@/lib/elements";

/**
 * Czwarte skupisko z `DesignTab`: co właśnie stawiamy i z jakimi ustawieniami.
 *
 * Sama geometria (przyciąganie do ściany, rozsuwanie od sąsiadów) mieszka osobno —
 * w `lib/rozstawElementow.ts` i `lib/wallSnap.ts` — bo to nie jest stan komponentu.
 * Hook dostaje ją funkcją i tylko składa z niej postawiony element.
 */
describe("useWstawianieElementu", () => {
  beforeEach(() => useProjectStore.getState().resetProject());

  const elementy = () => useProjectStore.getState().draft.elements;
  /** Przyciąganie wyłączone — testujemy skład elementu, nie geometrię. */
  const bezPrzyciagania = (p: { x: number; y: number }) => ({ x: p.x, y: p.y, rotation: 0 });
  const opcje = { skalaSymboli: 1, przyciagnijDoSciany: bezPrzyciagania };

  it("stawia element aktywnego typu na aktywnej kondygnacji", () => {
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.wstaw({ x: 40, y: 60 }));
    expect(elementy()).toHaveLength(1);
    expect(elementy()[0]).toMatchObject({
      type: "gniazdko",
      x: 40,
      y: 60,
      floor: useProjectStore.getState().activeFloorId,
    });
  });

  /** „Dedykowane" dotyczy WYŁĄCZNIE gniazda — przy innym typie nie ma sensu i nie może
   *  przypadkiem zostać zapamiętane po przełączeniu typu w bibliotece. */
  it("dedykowane i opis AGD tylko dla gniazda", () => {
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.setDedicated(true));
    act(() => result.current.wstaw({ x: 0, y: 0 }));
    expect(elementy()[0]).toMatchObject({ type: "gniazdko", dedicated: true, note: "AGD" });

    act(() => result.current.setActiveType("oswietlenie"));
    act(() => result.current.wstaw({ x: 50, y: 50 }));
    expect(elementy()[1]).toMatchObject({ type: "oswietlenie", dedicated: false, note: "" });
  });

  /** Wariant (pojedyncze/podwójne) pamięta się PER TYP, więc przełączenie na inny typ
   *  i powrót nie gubi wyboru. */
  it("liczba mechanizmów jest pamiętana osobno dla każdego typu", () => {
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.ustawGangs("gniazdko", 2));
    act(() => result.current.setActiveType("oswietlenie"));
    act(() => result.current.setActiveType("gniazdko"));
    act(() => result.current.wstaw({ x: 0, y: 0 }));
    expect(elementy()[0].gangs).toBe(2);
  });

  it("typ bez wariantów zawsze dostaje jeden mechanizm", () => {
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.ustawGangs("oswietlenie", 2));
    expect(result.current.gangsForType("oswietlenie")).toBe(1);
  });

  /** Litera przy wypuście AGD jest domyślna — użytkownik podmienia ją w edycji
   *  elementu, ale bez niej symbol rysowałby się pusty. */
  it("wypust AGD dostaje domyślną literę", () => {
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.setActiveType("wypustAGD"));
    act(() => result.current.wstaw({ x: 0, y: 0 }));
    expect(elementy()[0].agdLetter).toBe("A");
  });

  /** Pozycja bierze się z PRZYCIĄGNIĘTEJ, nie z klikniętej — tak samo jak przypisanie
   *  do pomieszczenia, bo o nim decyduje tolerancja liczona od linii obrysu. */
  it("element ląduje tam, gdzie odłoży go przyciąganie", () => {
    const { result } = renderHook(() =>
      useWstawianieElementu({ skalaSymboli: 1, przyciagnijDoSciany: () => ({ x: 7, y: 9, rotation: 270 }) })
    );
    act(() => result.current.wstaw({ x: 100, y: 100 }));
    expect(elementy()[0]).toMatchObject({ x: 7, y: 9, rotation: 270 });
  });

  /**
   * Pomieszczenie liczy się z MIEJSCA, W KTÓRYM ELEMENT STANĄŁ — po odsunięciu od
   * sąsiadów, nie z punktu przyciągnięcia. Audyt 5.11.2026: seria gniazd przy styku
   * dwóch pokoi zapisywała część z nich w pokoju, z którego odsunięcie je wypchnęło,
   * więc rozdzielnica i strefa mokra liczyły się z błędnych danych aż do ponownego
   * wczytania, a wtedy wyskakiwał baner „Poprawiono przypisanie…".
   *
   * Pokój celowo maleńki: odsunięcie w KAŻDĄ stronę wyprowadza drugi element poza
   * obrys, więc test nie zależy od tego, w którą stronę rozsuwanie go popchnie.
   * Skala ustawiona jawnie: bez niej tolerancja „przy obrysie" w `detectRoomName` to
   * całe oczko siatki i odsunięty element nadal liczyłby się jako stojący przy pokoju.
   */
  it("pomieszczenie liczy się z pozycji po odsunięciu od sąsiada", () => {
    const pietro = useProjectStore.getState().activeFloorId;
    useProjectStore.setState({ scales: { [pietro]: 0.05 } });
    useProjectStore.getState().addRoomShape(
      pietro,
      [
        { x: 47, y: 47 },
        { x: 53, y: 47 },
        { x: 53, y: 53 },
        { x: 47, y: 53 },
      ],
      "Schowek"
    );
    const { result } = renderHook(() => useWstawianieElementu(opcje));
    act(() => result.current.wstaw({ x: 50, y: 50 }));
    act(() => result.current.wstaw({ x: 50, y: 50 }));
    const [pierwszy, drugi] = elementy();
    expect(pierwszy.room).toBe("Schowek");
    expect(drugi.x !== 50 || drugi.y !== 50).toBe(true);
    expect(drugi.room).toBe(NO_ROOM);
  });

  /**
   * Duch pod kursorem ma pokazywać TO, co postawi klik. Dlatego `podglad` i `wstaw` liczą
   * z jednej funkcji, a test pilnuje, żeby nie dało się ich rozjechać: ten sam punkt,
   * ta sama pozycja i obrót — po przyciągnięciu do ściany i po odsunięciu od sąsiada.
   */
  describe("podglad", () => {
    it("niczego nie zapisuje", () => {
      const { result } = renderHook(() => useWstawianieElementu(opcje));
      act(() => {
        result.current.podglad({ x: 40, y: 60 });
      });
      expect(elementy()).toHaveLength(0);
    });

    it("oddaje pozycję i obrót po przyciągnięciu do ściany", () => {
      const { result } = renderHook(() =>
        useWstawianieElementu({ skalaSymboli: 1, przyciagnijDoSciany: () => ({ x: 7, y: 9, rotation: 270 }) })
      );
      expect(result.current.podglad({ x: 100, y: 100 })).toEqual({ x: 7, y: 9, rotation: 270 });
    });

    it("zgadza się z tym, co potem postawi wstaw — także przy odsunięciu od sąsiada", () => {
      const { result } = renderHook(() => useWstawianieElementu(opcje));
      act(() => result.current.wstaw({ x: 50, y: 50 }));
      // Drugi element w TYM SAMYM punkcie: rozsuwanie odsuwa go od pierwszego, więc pozycja
      // różni się od klikniętej — i dokładnie tę ma pokazać duch.
      const zapowiedz = result.current.podglad({ x: 50, y: 50 });
      expect(zapowiedz.x !== 50 || zapowiedz.y !== 50).toBe(true);
      act(() => result.current.wstaw({ x: 50, y: 50 }));
      expect(elementy()).toHaveLength(2);
      expect(elementy()[1]).toMatchObject(zapowiedz);
    });
  });
});
