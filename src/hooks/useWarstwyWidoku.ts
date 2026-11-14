import { useCallback, useMemo, useState } from "react";
import { DEFAULT_ELEMENT_SCALE } from "@/lib/symbolScale";

/**
 * Warstwy i pomoce widoku rzutu — przełączniki z paska edytora.
 *
 * Stan WIDOKU, nie projektu: nie trafia do zapisu i nie zmienia obliczeń, rozdzielnicy
 * ani kosztorysu. Wydzielone z DesignTab w pozycji 8 przeglądu z 12.11.2026 — samych
 * przełączników jest jedenaście i każdy szedł do paska parą propsów (`showX` +
 * `onToggleX={() => setShowX((x) => !x)}`), więc najwięcej było tu okablowania.
 * `paskowi` to gotowe propsy `EditorToolbar` pod jego dotychczasowymi nazwami.
 *
 * Domyślne wartości są decyzjami, nie przypadkiem — powody przy każdej z nich niżej.
 */
export function useWarstwyWidoku() {
  /** Strefy ochronne w łazience — domyślnie widoczne. */
  const [showZones, setShowZones] = useState(true);
  /** Trasy przewodów — domyślnie WYŁĄCZONE: warstwa poglądowa, nie zawsze potrzebna,
   *  a bez rozdzielnicy postawionej na planie i tak jest pusta. */
  const [showRoutes, setShowRoutes] = useState(false);
  /** Wymiary — domyślnie WYŁĄCZONE: przy rysowaniu przeszkadzają, potrzebne są przy
   *  sprawdzaniu i przed wydrukiem. */
  const [showDimensions, setShowDimensions] = useState(false);
  /** Powierzchnia pomieszczeń — osobno od wymiarów, bo odpowiada na inne pytanie:
   *  wymiary służą do wytyczenia ścian, powierzchnia do sprawdzenia metrażu. */
  const [showAreas, setShowAreas] = useState(false);
  /** Wysokości montażu przy osprzęcie — osobno od wymiarów, bo wymiary opisują
   *  BUDYNEK, a te INSTALACJĘ. Domyślnie wyłączone z tego samego powodu co wymiary. */
  const [showHeights, setShowHeights] = useState(false);
  /** Podgląd kondygnacji poniżej — domyślnie WYŁĄCZONY: na parterze nie ma czego
   *  pokazać, a przy jednej kondygnacji przełącznik byłby samym szumem. */
  const [showUnderlay, setShowUnderlay] = useState(false);
  /** Przyciąganie do siatki. Domyślnie WYŁĄCZONE, bo na wgranym podkładzie ściany
   *  budynku nie leżą na oczkach siatki i przyciąganie tylko odciągałoby od rzutu.
   *  Rysowanie od zera włącza je jawnie — patrz `startManualDrawing` w DesignTab. */
  const [snapOn, setSnapOn] = useState(false);
  /** Widoczność siatki — osobno od przyciągania. Domyślnie włączona, bo bez rzutu
   *  pod spodem to jedyny punkt odniesienia przy rysowaniu od zera. */
  const [gridOn, setGridOn] = useState(true);
  /** Przyciąganie osprzętu do ścian. Domyślnie WŁĄCZONE: to najczęstsza czynność
   *  w całej aplikacji, a bez obrotu symbole stoją byle jak. Wyłączalne, bo nie każdy
   *  element montuje się w ścianie (gniazdo podłogowe, wyspa kuchenna). */
  const [wallSnapOn, setWallSnapOn] = useState(true);
  /** Skala samych symboli na planie (nie powiększenie widoku). */
  const [elementScale, setElementScale] = useState(DEFAULT_ELEMENT_SCALE);
  /**
   * Filtry widoku osprzętu (F8 z audytu 5.11.2026) — ukryte kategorie katalogu znikają
   * z płótna, a że rzut PDF rasteryzuje się z płótna, także z wydruku (razem z legendą
   * i zestawieniem).
   */
  const [ukryteKategorie, setUkryteKategorie] = useState<string[]>([]);

  const przelaczKategorie = useCallback(
    (k: string) => setUkryteKategorie((u) => (u.includes(k) ? u.filter((x) => x !== k) : [...u, k])),
    []
  );
  const pokazWszystkieKategorie = useCallback(() => setUkryteKategorie([]), []);
  /** Przywraca kategorię na rzut — stawiany element ukrytej kategorii zniknąłby spod
   *  kursora, więc kategoria wraca, zanim element powstanie (F8). */
  const pokazKategorie = useCallback(
    (k: string) => setUkryteKategorie((u) => (u.includes(k) ? u.filter((x) => x !== k) : u)),
    []
  );

  const paskowi = useMemo(
    () => ({
      snapOn,
      onSnapChange: setSnapOn,
      gridOn,
      onGridChange: setGridOn,
      wallSnapOn,
      onWallSnapChange: setWallSnapOn,
      elementScale,
      onElementScaleChange: setElementScale,
      defaultElementScale: DEFAULT_ELEMENT_SCALE,
      showZones,
      onToggleZones: () => setShowZones((z) => !z),
      showRoutes,
      onToggleRoutes: () => setShowRoutes((r) => !r),
      showDimensions,
      onToggleDimensions: () => setShowDimensions((d) => !d),
      showAreas,
      onToggleAreas: () => setShowAreas((a) => !a),
      showHeights,
      onToggleHeights: () => setShowHeights((h) => !h),
      showUnderlay,
      // Bez kondygnacji poniżej pasek nie pokazuje przełącznika wcale — o tym, czy jest,
      // wie dopiero DesignTab, więc tam przełącznik zamienia się na `null`.
      onToggleUnderlay: () => setShowUnderlay((u) => !u),
      ukryteKategorie,
      onPrzelaczKategorie: przelaczKategorie,
    }),
    [
      snapOn,
      gridOn,
      wallSnapOn,
      elementScale,
      showZones,
      showRoutes,
      showDimensions,
      showAreas,
      showHeights,
      showUnderlay,
      ukryteKategorie,
      przelaczKategorie,
    ]
  );

  return {
    showZones,
    showRoutes,
    showDimensions,
    showAreas,
    showHeights,
    showUnderlay,
    snapOn,
    setSnapOn,
    gridOn,
    wallSnapOn,
    elementScale,
    ukryteKategorie,
    pokazWszystkieKategorie,
    pokazKategorie,
    paskowi,
  };
}
