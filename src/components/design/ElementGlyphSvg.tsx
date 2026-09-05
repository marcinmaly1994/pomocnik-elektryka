import type { ElementType } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { glyphBoxSize, switchGlyph } from "@/lib/glyphs";

interface GlyphProps {
  type: ElementType;
  color: string;
  gangs?: number;
  /** Litera wpisana w łuk symbolu — dotyczy wyłącznie `wypustAGD` (patrz `agdLetter`
   *  w `InstallationElement`). Domyślnie „A", żeby nowo postawiony wypust od razu
   *  pokazywał coś w symbolu, zanim użytkownik wpisze właściwą literę. */
  agdLetter?: string;
}

/** Wspólna geometria łuku gniazda: trzon u góry, pozioma kreska, łuk otwarty w dół —
 *  wg konwencji rysunku instalacyjnego. Używana przez `gniazdko`/`gniazdkoHerm`
 *  (liczba gniazd w łuku), `gniazdko400` (dopisek „3F" pod łukiem) i `wypustAGD`
 *  (litera odbiornika w łuku, w tym samym miejscu co liczba gniazd) — jeden kształt
 *  bazowy, żeby te trzy symbole nie zaczęły z czasem rozjeżdżać się kształtem.
 */
function SocketArc({ color, herm, insideLabel, belowLabel }: { color: string; herm?: boolean; insideLabel?: string; belowLabel?: string }) {
  const r = 9;
  const stemLen = 12;
  const half = (stemLen + r) / 2;
  const stemTopY = -half;
  const apexY = stemTopY + stemLen;
  const chordY = apexY + r;
  return (
    <>
      <line x1={0} y1={stemTopY} x2={0} y2={apexY} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={-r} y1={apexY} x2={r} y2={apexY} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M ${-r} ${chordY} A ${r} ${r} 0 0 1 ${r} ${chordY}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {herm && (
        <path d={`M ${-r * 0.6} ${chordY} A ${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.6} ${chordY}`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      )}
      {insideLabel && (
        <text x={0} y={chordY + 2} fontSize={10} fontWeight={700} fill={color} textAnchor="middle">
          {insideLabel}
        </text>
      )}
      {belowLabel && (
        <text x={0} y={chordY + 12} fontSize={7.5} fontWeight={700} fill={color} textAnchor="middle">
          {belowLabel}
        </text>
      )}
    </>
  );
}

/** Plakietka z branżowym kodem literowym — dla elementów, dla których pełny piktogram
 *  byłby nieczytelny w skali planu (RJ45, RTV, 400V, termostat itd.). */
function CodeBadge({ color, code, w = 26, h = 24 }: { color: string; code: string; w?: number; h?: number }) {
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5} fill="#fff" stroke={color} strokeWidth={2.2} />
      <text textAnchor="middle" dy={3.5} fontSize={code.length > 2 ? 8 : 10.5} fontWeight={700} fill={color}>
        {code}
      </text>
    </>
  );
}

/** Symbole zbliżone do konwencji rysunku instalacyjnego (SVG) — do użycia w bibliotece
 *  elementów i modalu edycji, poza płótnem Konva. Przeniesione z `ElementGlyph` w wersji JS. */
export function ElementGlyphSvg({ type, color, gangs, agdLetter }: GlyphProps) {
  switch (type) {
    case "gniazdko":
    case "gniazdkoHerm": {
      const g = Math.max(1, Math.min(6, gangs || 1));
      return <SocketArc color={color} herm={type === "gniazdkoHerm"} insideLabel={g > 1 ? String(g) : undefined} />;
    }

    case "gniazdko400":
      // Ten sam symbol co gniazdko 230V (wg prośby użytkownika: to jest to samo
      // gniazdo, tylko trójfazowe) — jedyna różnica to dopisek „3F" pod łukiem
      // zamiast osobnej plakietki z kodem.
      return <SocketArc color={color} belowLabel="3F" />;

    case "wypustAGD":
      // Też ten sam symbol gniazda 230V, z literą KONKRETNEGO odbiornika w łuku
      // (domyślnie „A", dopóki użytkownik nie wpisze własnej — patrz `EditElementModal`).
      return <SocketArc color={color} insideLabel={(agdLetter || "A").slice(0, 2).toUpperCase()} />;

    case "oswietlenie":
      return (
        <>
          <circle r={13} fill="#fff" stroke={color} strokeWidth={2.2} />
          <line x1={-6.5} y1={-6.5} x2={6.5} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <line x1={6.5} y1={-6.5} x2={-6.5} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      );

    case "kinkiet":
      return (
        <>
          <line x1={-11} y1={-11} x2={-11} y2={11} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M -11,-9 A 9,9 0 0 1 -11,9 Z" fill="#fff" stroke={color} strokeWidth={2} />
          <line x1={-11} y1={-4.5} x2={-1} y2={-4.5} stroke={color} strokeWidth={1.2} />
          <line x1={-11} y1={4.5} x2={-1} y2={4.5} stroke={color} strokeWidth={1.2} />
        </>
      );

    case "oswietlenieZewn":
      return (
        <>
          <circle r={9} fill="#fff" stroke={color} strokeWidth={2.2} />
          <line x1={-4.5} y1={-4.5} x2={4.5} y2={4.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <line x1={4.5} y1={-4.5} x2={-4.5} y2={4.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={Math.cos(rad) * 11}
                y1={Math.sin(rad) * 11}
                x2={Math.cos(rad) * 13.5}
                y2={Math.sin(rad) * 13.5}
                stroke={color}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            );
          })}
        </>
      );

    case "tasmaLed": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill="#fff" stroke={color} strokeWidth={2} />
          {[-9, -3, 3, 9].map((x) => (
            <circle key={x} cx={x} cy={0} r={1.8} fill={color} />
          ))}
        </>
      );
    }

    case "wentylator":
      return (
        <>
          <circle r={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          {[0, 120, 240].map((a) => (
            <path key={a} d="M 0,0 Q 5,-6 0,-9 Q -5,-6 0,0" fill={color} opacity={0.75} transform={`rotate(${a})`} />
          ))}
          <circle r={2} fill={color} />
        </>
      );

    case "czujnikRuchu":
      return (
        <>
          <circle r={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          <path d="M -6,4 A 7,7 0 0 1 6,4" fill="none" stroke={color} strokeWidth={1.6} />
          <path d="M -3.5,6.5 A 4,4 0 0 1 3.5,6.5" fill="none" stroke={color} strokeWidth={1.4} />
          <circle cx={0} cy={-3} r={2.4} fill={color} />
        </>
      );

    case "czujnikDymu":
      return (
        <>
          <circle r={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          <circle r={6} fill="none" stroke={color} strokeWidth={1.4} />
          <circle r={2} fill={color} />
        </>
      );

    case "puszka":
      return (
        <>
          <circle r={12} fill="#fff" stroke={color} strokeWidth={2.2} strokeDasharray="4 2.5" />
          <line x1={-5} y1={0} x2={5} y2={0} stroke={color} strokeWidth={1.5} />
          <line x1={0} y1={-5} x2={0} y2={5} stroke={color} strokeWidth={1.5} />
        </>
      );

    case "wanna": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={9} fill="#fff" stroke={color} strokeWidth={2} />
          <rect x={-w / 2 + 3.5} y={-h / 2 + 3.5} width={w - 7} height={h - 7} rx={6} fill="none" stroke={color} strokeWidth={0.9} />
          <circle cx={w / 2 - 8} cy={0} r={2.4} fill="none" stroke={color} strokeWidth={1.2} />
        </>
      );
    }

    case "prysznic": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill="#fff" stroke={color} strokeWidth={2} />
          <circle r={4.5} fill="none" stroke={color} strokeWidth={1.2} />
          {[45, 135, 225, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={Math.cos(r) * 7}
                y1={Math.sin(r) * 7}
                x2={Math.cos(r) * 11}
                y2={Math.sin(r) * 11}
                stroke={color}
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            );
          })}
        </>
      );
    }

    case "umywalka": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          {/* Zaokrąglenie ograniczone połową wysokości: umywalka to najmniejszy z przyborów
              (0,60 × 0,45 m), a promień większy od połowy boku daje kształt nie do
              przewidzenia — inny w SVG, inny w Konvie. */}
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(7, h / 2)} fill="#fff" stroke={color} strokeWidth={2} />
          <circle cx={0} cy={1.5} r={3} fill="none" stroke={color} strokeWidth={1.1} />
          <line x1={0} y1={-h / 2 + 2} x2={0} y2={-h / 2 + 5.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </>
      );
    }

    case "rozdzielnica": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill="#fff" stroke={color} strokeWidth={2.4} />
          {[-6, 1].map((y) => (
            <g key={y}>
              {[-8, -2, 4].map((x) => (
                <rect key={x} x={x} y={y} width={4} height={6} rx={1} fill={color} opacity={0.8} />
              ))}
            </g>
          ))}
        </>
      );
    }

    case "roleta": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill="#fff" stroke={color} strokeWidth={2.2} />
          {[-5, 0, 5].map((yy) => (
            <line key={yy} x1={-w / 2 + 3} y1={yy} x2={w / 2 - 3} y2={yy} stroke={color} strokeWidth={1.3} />
          ))}
        </>
      );
    }

    case "wlacznik":
    case "wlacznikDwubiegunowy":
    case "wlacznikGrupowy":
    case "wlacznikSchodowy":
    case "wlacznikKrzyzowy": {
      const { r, segments } = switchGlyph(type);
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          {/* Niewidoczny cel trafień — symbol jest samą kreską, więc bez wypełnionego
              prostokąta klik łapałby się wyłącznie na narysowanych pikselach. */}
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
          <circle cx={0} cy={0} r={r} fill="none" stroke={color} strokeWidth={2} />
          {segments.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={2} strokeLinecap="round" />
          ))}
        </>
      );
    }

    default: {
      const def = ELEMENT_TYPES[type];
      const { w, h } = glyphBoxSize(type);
      return <CodeBadge color={color} code={def?.code || "?"} w={w} h={h} />;
    }
  }
}

/** Gotowy `<svg>` z wyśrodkowanym symbolem, do wstawienia w listach (biblioteka elementów,
 *  wybór typu w modalu edycji) — poza kontekstem `<svg>`, w zwykłym drzewie HTML. */
export function GlyphPreview({ type, color, gangs, agdLetter, size = 26 }: GlyphProps & { size?: number }) {
  const { w, h } = glyphBoxSize(type);
  const box = Math.max(w, h) + 12;
  return (
    <svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} width={size} height={size}>
      <ElementGlyphSvg type={type} color={color} gangs={gangs} agdLetter={agdLetter} />
    </svg>
  );
}
