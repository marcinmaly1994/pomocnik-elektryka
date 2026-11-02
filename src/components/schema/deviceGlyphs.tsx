/**
 * Symbole aparatów dostarczone przez użytkownika jako pliki SVG (eksport z CAD-a) —
 * MCB, rozłącznik izolacyjny, ogranicznik przepięć i wyłącznik różnicowoprądowy.
 *
 * Współrzędne pochodzą wprost z plików źródłowych i NIE są przeliczane ręcznie: każdy
 * symbol opisany jest osią (`axisX`) oraz końcami przewodu (`topY`/`bottomY`), a
 * `CadGlyph` sam dobiera skalę i przesunięcie tak, żeby wpiąć go między dwa wskazane
 * poziomy schematu. Dzięki temu zmiana wysokości rzędu w `SchemaTab` nie wymaga
 * ruszania geometrii symboli, a symbole pozostają zgodne z tym, co przysłał użytkownik.
 *
 * Jedyne odstępstwa od plików źródłowych to scalenia równoważne: łamane rysowane w CAD-zie
 * jako ciąg osobnych, stykających się odcinków zapisujemy jednym `path`, a łuki
 * przybliżane setkami mikroskopijnych trapezoidów — jednym `circle`/`path`. Wygląd
 * identyczny, węzłów kilkadziesiąt razy mniej.
 */

import { GlyphGroup, RozlacznikBezpWspolne, STROKE } from "./glyphyOprawa";

export interface GlyphSpec {
  /** Oś symbolu w układzie źródłowym — na niej leży wejście i wyjście przewodu, więc
   *  wystarczy ona jedna, żeby symbol wypadł współosiowo z pionowymi przewodami. */
  axisX: number;
  topY: number;
  bottomY: number;
  /** Najdalej wysunięty w prawo punkt rysunku — do odsuwania etykiet, żeby na nie nie wchodziły. */
  rightX: number;
  Paths: () => React.ReactElement;
}

/** MCB — wyłącznik nadprądowy (Downloads/MCB.svg). */
const MCB: GlyphSpec = {
  axisX: 281.47,
  topY: 253.58,
  bottomY: 354.99,
  rightX: 325.08,
  Paths: () => (
    <GlyphGroup>
      <path d="M281.47 253.58L281.47 304.03" />
      <path d="M276.36 298.94L286.55 309.13" />
      <path d="M276.36 309.13L286.55 298.94" />
      <path d="M306.94 304.04L281.47 354.99" />
      <path d="M299.4 319.13L316.2 328.83" />
      <path d="M312.82 351.5L306.06 347.93L309.15 342.55L301.51 338.11L298.53 343.25L290.87 338.83" />
      <path d="M317.92 323.12L325.08 333.99L312.08 333.2A13.068 13.068 0 0 0 317.92 323.12Z" fill={STROKE} stroke="none" />
    </GlyphGroup>
  ),
};

/**
 * Rozłącznik izolacyjny (Downloads/Q1.svg) — trzon zakończony belką styku stałego,
 * kropka styku i odchylone w lewo ostrze, czyli symbol łącznika w pozycji otwartej.
 * Okrąg styku był w pliku łamaną z ~20 odcinków — zastąpiony jednym `circle`.
 */
const MAIN_SWITCH: GlyphSpec = {
  axisX: 263.32,
  topY: 262.68,
  bottomY: 354.56,
  rightX: 268.38,
  Paths: () => (
    <GlyphGroup>
      <path d="M263.32 262.68L263.32 297.92" />
      <path d="M258.26 297.92L268.38 297.92" />
      <circle cx={263.32} cy={301.95} r={4.03} />
      <path d="M263.32 354.56L237.02 301.96" />
    </GlyphGroup>
  ),
};

/**
 * Ogranicznik przepięć (Downloads/SPD.svg) — prostokąt z wpisaną strzałką skierowaną
 * w dół. Uziemienie nie jest częścią pliku; dorysowuje je `SchemaTab` pod symbolem,
 * bo należy do topologii schematu, nie do samego aparatu.
 */
const SPD: GlyphSpec = {
  axisX: 311.05,
  topY: 213.39,
  bottomY: 304.38,
  rightX: 319.77,
  Paths: () => (
    <GlyphGroup>
      <path d="M311.05 213.39L311.05 263.68" />
      <path d="M302.33 263.68L319.77 263.68L319.77 304.38L302.33 304.38Z" />
      <path d="M311.05 263.68L311.05 272.4" />
      <path d="M311.05 281.13L308.15 272.4L313.96 272.4Z" fill={STROKE} stroke="none" />
    </GlyphGroup>
  ),
};

/**
 * Wyłącznik różnicowoprądowy (Downloads/RCD.svg) — ostrze łącznika z zaciskiem
 * oznaczonym krzyżykiem, przekładnik toroidalny na przewodzie (owal na dole) oraz
 * blok wyzwalacza z przyciskiem testu, połączony z torem linią przerywaną.
 *
 * Dwa odcinki z pliku (`334.21 327.78`→`319.86` i →`335.69`) leżą dokładnie na torze
 * głównym rysowanym już przez `M334.21 304.08L334.21 349.71`, więc zostały pominięte
 * jako podwójne kreślenie tych samych pikseli.
 */
const RCD: GlyphSpec = {
  axisX: 334.215,
  topY: 221.48,
  bottomY: 349.71,
  rightX: 350.04,
  Paths: () => (
    <GlyphGroup>
      {/* tor główny + zacisk oznaczony krzyżykiem */}
      <path d="M334.22 221.48L334.22 267.13" />
      <path d="M338.83 262.53L329.6 271.75" />
      <path d="M329.6 262.53L338.83 271.75" />
      <path d="M315.18 267.14L334.21 304.08" />
      <path d="M334.21 304.08L334.21 349.71" />
      <path d="M326.1 301.42L330.69 297.24L335.28 293.06" />

      {/* przekładnik toroidalny — owal z półkolistymi zakończeniami */}
      <path d="M318.37 319.86L350.04 319.86" />
      <path d="M318.37 335.69L350.04 335.69" />
      <path d="M318.37 319.86A7.917 7.917 0 0 0 318.37 335.69" />
      <path d="M350.04 335.69A7.917 7.917 0 0 0 350.04 319.86" />

      {/* blok wyzwalacza z przyciskiem testu */}
      <path d="M294.53 282.35L310.36 282.35L310.36 298.18L294.53 298.18Z" />
      <path d="M302.44 282.35L302.44 298.18" />
      <path d="M294.53 290.27L310.36 290.27" />
      <path d="M294.53 287.63L286.61 287.63" />
      <path d="M294.53 290.27L294.53 292.91" />
      <path d="M294.53 292.91L286.61 292.91" />
      <path d="M286.61 284.46L286.61 296.07" />

      {/* sprzężenie wyzwalacza z torem — linia przerywana */}
      <path d="M310.36 290.27L318.29 290.27" />
      <path d="M320.8 290.27L327.69 290.27" />
      <path d="M302.44 298.18L302.44 303.46" />
      <path d="M302.44 306.1L302.44 316.66" />
      <path d="M302.44 319.3L302.44 327.78" />
      <path d="M302.44 327.78L310.46 327.78" />
    </GlyphGroup>
  ),
};

/**
 * Rozłącznik izolacyjny bezpiecznikowy (Downloads/Rozłącznik izolacyjny
 * bezpiecznikowy_3F.svg i _1F.svg): pierścień przegubu ostrza, belka styku stałego,
 * dwuramienne ramię łącznika i korpus wkładki topikowej narysowany jako
 * równoległobok (cały mechanizm stoi pod kątem, tak jak ostrze w MAIN_SWITCH) z
 * ukośnymi kreskami wewnątrz — po jednej na fazę. Reszta geometrii jest identyczna
 * w obu plikach źródłowych — różni je wyłącznie liczba kresek wkładki (3 albo 1),
 * stąd wspólna `RozlacznikBezpWspolne` i dwa cienkie `GlyphSpec` nad nią.
 */

/**
 * Dogrubienie kreski, kompensujące skalę tego symbolu.
 *
 * `vector-effect: non-scaling-stroke` na wspólnym `GlyphGroup` NIE działa na jego
 * dzieci — ta właściwość w SVG się nie dziedziczy — więc grubość kreski skaluje się
 * razem z resztą geometrii przy dopasowywaniu symbolu do wysokości rzędu (patrz
 * `CadGlyph`). Źródłowa wysokość tego symbolu (~743 jedn., 37,16–780,41) jest ok.
 * 7,3 raza większa niż MCB (~101 jedn.), a oba trafiają w TĘ SAMĄ wysokość rzędu
 * wyłączników obwodowych (`MCB_H` w SchemaTab.tsx) — bez kompensacji kreska
 * wychodziłaby więc ok. 7x cieńsza niż w MCB: podpikselowa, wyglądająca na ekranie
 * na wyblakłą, prawie szarą zamiast czarnej. Mnożnik dobrany tak, żeby po
 * przeskalowaniu wyjść na tę samą grubość co MCB (101,41 / 743,251744 × 7,33).
 */
const ROZLACZNIK_BEZP_STROKE_W = 8.06;

const ROZLACZNIK_BEZP_3F: GlyphSpec = {
  axisX: 233.993466,
  topY: 37.162587,
  bottomY: 780.414331,
  rightX: 274.909091,
  Paths: () => (
    <GlyphGroup>
      <g strokeWidth={ROZLACZNIK_BEZP_STROKE_W}>
        <RozlacznikBezpWspolne />
        {/* trzy kreski wkładki — po jednej na fazę */}
        <path d="M 201.264183 530.86762 L 94.906075 686.31161" />
        <path d="M 180.822454 489.951995 L 74.448263 645.412069" />
        <path d="M 160.364642 449.052453 L 54.006534 604.496444" />
      </g>
    </GlyphGroup>
  ),
};

const ROZLACZNIK_BEZP_1F: GlyphSpec = {
  axisX: 233.993466,
  topY: 37.162587,
  bottomY: 780.414331,
  rightX: 274.909091,
  Paths: () => (
    <GlyphGroup>
      <g strokeWidth={ROZLACZNIK_BEZP_STROKE_W}>
        <RozlacznikBezpWspolne />
        {/* jedna kreska wkładki — jedna faza */}
        <path d="M 180.822454 489.951995 L 74.448263 645.412069" />
      </g>
    </GlyphGroup>
  ),
};

/**
 * Symbol zastępczy — dla rodzajów aparatów, których nikt jeszcze nie odwzorował z
 * pliku CAD ani narysował wprost wg normy jak lampkę (stycznik, przekaźnik, zasilacz,
 * czujnik zaniku faz, rozłącznik przeciwpożarowy…). Bez niego takie aparaty po prostu
 * ZNIKAŁY ze schematu —
 * `SchemaTab` rysował gałąź tylko dla `kind === "mcb"`, więc reszta katalogu nie
 * miała czym się narysować i cichutko wypadała z rysunku.
 *
 * Przerywana ramka (zamiast ciągłej kreski jak w MCB/SPD/RCD) to CELOWY sygnał: ten
 * prostokąt nie jest śladem prawdziwego symbolu z dokumentacji aparatu, tylko
 * zastępczym oznaczeniem „tu coś stoi, ale kształtu jeszcze nie znamy". Podmiana na
 * właściwy `GlyphSpec` (patrz komentarz na górze pliku) nie wymaga zmian poza tym
 * plikiem — `CircuitBranch` w SchemaTab.tsx wybiera symbol po `device.kind`.
 */
const GENERIC: GlyphSpec = {
  axisX: 50,
  topY: 0,
  bottomY: 100,
  rightX: 68,
  Paths: () => (
    <GlyphGroup>
      <path d="M50 0L50 30" />
      <path d="M50 70L50 100" />
      <rect x="32" y="30" width="36" height="40" rx="3" strokeDasharray="4 3" />
    </GlyphGroup>
  ),
};

/**
 * Lampka sygnalizacyjna — okrąg z wpisanym krzyżykiem (IEC 60617-06, symbol lampki
 * kontrolnej). W odróżnieniu od reszty katalogu (stycznik, przekaźnik, zasilacz, CZF,
 * rozłącznik ppoż…) to symbol narysowany wprost wg normy, nie zastępczy placeholder —
 * lampka na schemacie stoi w tym samym rzędzie co RCD/SPD (odejście wprost z szyny
 * głównej), a nie w rzędzie wyłączników obwodowych, więc dostaje własny `GlyphSpec`
 * zamiast iść przez `GLYPHS.generic`. Współrzędne własne (nie z pliku CAD), w siatce
 * 0–100 dopasowanej stylem do reszty (`GENERIC` niżej korzysta z tej samej siatki).
 */
const LAMPKA: GlyphSpec = {
  axisX: 50,
  topY: 0,
  // Kończy się na dolnej krawędzi okręgu (cy 50 + r 16), nie na umownej siatce 0–100
  // jak `GENERIC` niżej — bez odnogi pod spodem nie ma już nic dalej do zmieszczenia,
  // a ciągnięcie `bottomY` do 100 zostawiłoby pod symbolem pusty margines.
  bottomY: 66,
  rightX: 50 + 16,
  // Bez odnogi pod okręgiem: układ kończy się na symbolu (patrz `LampkaBranch` w
  // SchemaTab.tsx) — dolny „ogonek" prowadziłby donikąd, bo nie ma już przewodu, do
  // którego miałby się podłączyć.
  Paths: () => (
    <GlyphGroup>
      <path d="M50 0L50 34" />
      <circle cx={50} cy={50} r={16} />
      <path d="M42 42L58 58" />
      <path d="M58 42L42 58" />
    </GlyphGroup>
  ),
};

export const GLYPHS = {
  mcb: MCB,
  main: MAIN_SWITCH,
  spd: SPD,
  rcd: RCD,
  lampka: LAMPKA,
  rozBezp3f: ROZLACZNIK_BEZP_3F,
  rozBezp1f: ROZLACZNIK_BEZP_1F,
  generic: GENERIC,
};

/** O ile odsunąć etykietę w prawo od osi, żeby minęła najszerszy punkt symbolu. */
export function labelOffset(spec: GlyphSpec, top: number, bottom: number, gap = 6): number {
  const scale = (bottom - top) / (spec.bottomY - spec.topY);
  return Math.round((spec.rightX - spec.axisX) * scale) + gap;
}
