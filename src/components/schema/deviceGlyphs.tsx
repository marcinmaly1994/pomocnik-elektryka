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

export const STROKE = "#16202B";
/** Wspólna grubość kreski całego schematu, dobrana do symboli użytkownika (krok 27). */
export const LINE_W = 1.1;

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

/** Wspólna oprawa: jedna grubość kreski, zaokrąglone końce, brak wypełnienia. */
function GlyphGroup({ children }: { children: React.ReactNode }) {
  return (
    <g
      fill="none"
      stroke={STROKE}
      strokeWidth={LINE_W}
      vectorEffect="non-scaling-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </g>
  );
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
 * Symbol zastępczy — dla rodzajów aparatów, których nikt jeszcze nie odwzorował z
 * pliku CAD (stycznik, przekaźnik, zasilacz, lampka, czujnik zaniku faz, rozłącznik
 * przeciwpożarowy…). Bez niego takie aparaty po prostu ZNIKAŁY ze schematu —
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

export const GLYPHS = { mcb: MCB, main: MAIN_SWITCH, spd: SPD, rcd: RCD, generic: GENERIC };

/**
 * Wstawia symbol na oś `x`, rozciągnięty dokładnie od `top` do `bottom`. Skala wynika
 * z wysokości symbolu w pliku źródłowym, więc proporcje nigdy się nie zniekształcają,
 * a końce przewodu trafiają co do piksela na wskazane poziomy siatki schematu.
 */
export function CadGlyph({ spec, x, top, bottom }: { spec: GlyphSpec; x: number; top: number; bottom: number }) {
  const scale = (bottom - top) / (spec.bottomY - spec.topY);
  return (
    <g transform={`translate(${x} ${top}) scale(${scale}) translate(${-spec.axisX} ${-spec.topY})`}>
      <spec.Paths />
    </g>
  );
}

/** O ile odsunąć etykietę w prawo od osi, żeby minęła najszerszy punkt symbolu. */
export function labelOffset(spec: GlyphSpec, top: number, bottom: number, gap = 6): number {
  const scale = (bottom - top) / (spec.bottomY - spec.topY);
  return Math.round((spec.rightX - spec.axisX) * scale) + gap;
}
