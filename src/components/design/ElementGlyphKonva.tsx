import { Circle, Line, Path, Rect, Text } from "react-konva";
import type { ElementType } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { glyphBoxSize, SOCKET_GLYPH, switchGlyph } from "@/lib/glyphs";
import { symbolNormowy, type PrymitywSymbolu } from "@/lib/symboleNormowe";

interface GlyphProps {
  type: ElementType;
  color: string;
  gangs?: number;
  /** Litera wpisana w łuk symbolu — dotyczy wyłącznie `wypustAGD`. Domyślnie „A". */
  agdLetter?: string;
  /** Rzeczywiste wymiary przyboru sanitarnego [m] — tylko dla wanny/brodzika/umywalki
   *  (patrz `fixtureSizeM`). Bez nich rysują się wymiary typowe, co jest właściwe
   *  w legendzie i w podglądzie biblioteki, gdzie nie ma konkretnego elementu. */
  wymiaryM?: { widthM: number; depthM: number };
  /** Obrót grupy, w której stoi symbol [stopnie] — napisy symboli normowych obracają się
   *  o tyle wstecz, żeby „M" czy „TV" na pionowej ścianie nie leżały na boku. */
  obrot?: number;
}

/** Konvowy odpowiednik `SocketArc` z `ElementGlyphSvg.tsx` — ta sama geometria, ten sam
 *  komentarz o wspólnym kształcie dla gniazdka/gniazdka400/wypustuAGD. */
function SocketArcKonva({
  color,
  herm,
  insideLabel,
  hitW,
  hitH,
}: {
  color: string;
  herm?: boolean;
  insideLabel?: string;
  hitW: number;
  hitH: number;
}) {
  // Jedno zrodlo wymiarow dla obu rendererow i dla przyciagania do sciany.
  const { r, stemLen, half } = SOCKET_GLYPH;
  const stemTopY = -half;
  const apexY = stemTopY + stemLen;
  const chordY = apexY + r;
  const w = hitW;
  const h = hitH;
  return (
    <>
      {/* Niewidoczny prostokąt trafień, patrz komentarz w oryginalnej wersji gniazdka niżej. */}
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
      <Line points={[0, stemTopY, 0, apexY]} stroke={color} strokeWidth={1.8} lineCap="round" />
      <Line points={[-r, apexY, r, apexY]} stroke={color} strokeWidth={1.8} lineCap="round" />
      <Path data={`M ${-r} ${chordY} A ${r} ${r} 0 0 1 ${r} ${chordY}`} stroke={color} strokeWidth={1.8} lineCap="round" />
      {herm && (
        <Path data={`M ${-r * 0.6} ${chordY} A ${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.6} ${chordY}`} stroke={color} strokeWidth={1.5} lineCap="round" />
      )}
      {insideLabel && (
        <Text text={insideLabel} x={-r} y={chordY - 8} width={2 * r} fontSize={10} fontStyle="700" fill={color} align="center" />
      )}
    </>
  );
}

/** Plakietka z kodem literowym (Konva) — odpowiednik `CodeBadge` z wersji SVG, dla typów
 *  bez dedykowanego symbolu (RJ45, RTV, 400V, termostat, ściemniacz, dzwonek, domofon…). */
function CodeBadgeKonva({ color, code, w, h }: { color: string; code: string; w: number; h: number }) {
  return (
    <>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={5} fill="#fff" stroke={color} strokeWidth={2.2} />
      <Text
        text={code}
        fontSize={code.length > 2 ? 8 : 10.5}
        fontStyle="700"
        fill={color}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        align="center"
        verticalAlign="middle"
      />
    </>
  );
}

/** Konvowy odpowiednik `SymbolNormowy` z `ElementGlyphSvg.tsx` — te same prymitywy. */
function SymbolNormowyKonva({ prymitywy, color, w, h, obrot }: { prymitywy: PrymitywSymbolu[]; color: string; w: number; h: number; obrot: number }) {
  return (
    <>
      {/* Niewidoczny cel trafień: bez wypełnienia Konva łapie klik tylko na kresce. */}
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
      {prymitywy.map((p, i) => {
        const sw = p.k === "tekst" ? 0 : p.w ?? 1.8;
        switch (p.k) {
          case "linia":
            return <Line key={i} points={p.p} stroke={color} strokeWidth={sw} lineCap="round" lineJoin="round" />;
          case "wielokat":
            return <Line key={i} points={p.p} closed fill="#fff" stroke={color} strokeWidth={sw} lineJoin="round" />;
          case "kolo":
            return <Circle key={i} x={p.x} y={p.y} radius={p.r} fill={p.pelne ? "#fff" : undefined} stroke={color} strokeWidth={sw} />;
          case "sciezka":
            return <Path key={i} data={p.d} fill={p.tlo ? "#fff" : undefined} stroke={color} strokeWidth={sw} lineCap="round" lineJoin="round" />;
          case "tekst": {
            // Konva nie ma kotwicy środka tekstu — pudełko o stałym rozmiarze,
            // wyśrodkowane w punkcie i z wyrównaniem do środka w obu osiach.
            const bw = 24;
            const bh = p.size * 1.4;
            return (
              <Text
                key={i}
                text={p.t}
                x={p.x}
                y={p.y}
                offsetX={bw / 2}
                offsetY={bh / 2}
                rotation={-obrot}
                width={bw}
                height={bh}
                fontSize={p.size}
                fontStyle="700"
                fill={color}
                align="center"
                verticalAlign="middle"
              />
            );
          }
        }
      })}
    </>
  );
}

/** Symbole zbliżone do konwencji rysunku instalacyjnego, jako prymitywy Konvy — do
 *  rysowania na płótnie projektowania (`DesignCanvas`). Ten sam zestaw kształtów co
 *  `ElementGlyphSvg`, przepisany na `react-konva` zamiast surowego SVG (Stage/Layer w
 *  Konvie nie renderuje węzłów DOM, więc symboli nie da się użyć 1:1). */
export function ElementGlyphKonva({ type, color, gangs, agdLetter, wymiaryM, obrot = 0 }: GlyphProps) {
  const normowy = symbolNormowy(type);
  if (normowy) {
    const { w, h } = glyphBoxSize(type, wymiaryM);
    return <SymbolNormowyKonva prymitywy={normowy} color={color} w={w} h={h} obrot={obrot} />;
  }
  switch (type) {
    case "gniazdko":
    case "gniazdkoHerm": {
      // Górna granica to DWA, bo `gangs` opisuje wariant gniazda (pojedyncze /
      // podwójne), a nie krotność ramki — patrz `gniazdoPodwojne` w elements.ts.
      // Stary zapis potrafi nieść `3`; ma się narysować jak podwójne, czyli tak samo,
      // jak się wycenia.
      const g = Math.max(1, Math.min(2, gangs || 1));
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <SocketArcKonva color={color} herm={type === "gniazdkoHerm"} insideLabel={g > 1 ? String(g) : undefined} hitW={w} hitH={h} />
      );
    }

    case "gniazdko400": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return <SocketArcKonva color={color} insideLabel="3F" hitW={w} hitH={h} />;
    }

    case "wypustAGD": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return <SocketArcKonva color={color} insideLabel={(agdLetter || "A").slice(0, 2).toUpperCase()} hitW={w} hitH={h} />;
    }

    case "oswietlenie":
      return (
        <>
          <Circle radius={13} fill="#fff" stroke={color} strokeWidth={2.2} />
          <Line points={[-6.5, -6.5, 6.5, 6.5]} stroke={color} strokeWidth={2} lineCap="round" />
          <Line points={[6.5, -6.5, -6.5, 6.5]} stroke={color} strokeWidth={2} lineCap="round" />
        </>
      );

    case "kinkiet":
      return (
        <>
          <Line points={[-11, -11, -11, 11]} stroke={color} strokeWidth={2.4} lineCap="round" />
          <Path data="M -11,-9 A 9,9 0 0 1 -11,9 Z" fill="#fff" stroke={color} strokeWidth={2} />
          <Line points={[-11, -4.5, -1, -4.5]} stroke={color} strokeWidth={1.2} />
          <Line points={[-11, 4.5, -1, 4.5]} stroke={color} strokeWidth={1.2} />
        </>
      );

    case "oswietlenieZewn":
      return (
        <>
          <Circle radius={9} fill="#fff" stroke={color} strokeWidth={2.2} />
          <Line points={[-4.5, -4.5, 4.5, 4.5]} stroke={color} strokeWidth={1.6} lineCap="round" />
          <Line points={[4.5, -4.5, -4.5, 4.5]} stroke={color} strokeWidth={1.6} lineCap="round" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <Line
                key={a}
                points={[Math.cos(rad) * 11, Math.sin(rad) * 11, Math.cos(rad) * 13.5, Math.sin(rad) * 13.5]}
                stroke={color}
                strokeWidth={1.4}
                lineCap="round"
              />
            );
          })}
        </>
      );

    case "tasmaLed": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={3} fill="#fff" stroke={color} strokeWidth={2} />
          {[-9, -3, 3, 9].map((x) => (
            <Circle key={x} x={x} y={0} radius={1.8} fill={color} />
          ))}
        </>
      );
    }

    case "wentylator":
      return (
        <>
          <Circle radius={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          {[0, 120, 240].map((a) => (
            <Path key={a} data="M 0,0 Q 5,-6 0,-9 Q -5,-6 0,0" fill={color} opacity={0.75} rotation={a} />
          ))}
          <Circle radius={2} fill={color} />
        </>
      );

    case "czujnikRuchu":
      return (
        <>
          <Circle radius={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          <Path data="M -6,4 A 7,7 0 0 1 6,4" stroke={color} strokeWidth={1.6} />
          <Path data="M -3.5,6.5 A 4,4 0 0 1 3.5,6.5" stroke={color} strokeWidth={1.4} />
          <Circle x={0} y={-3} radius={2.4} fill={color} />
        </>
      );

    case "czujnikDymu":
      return (
        <>
          <Circle radius={12} fill="#fff" stroke={color} strokeWidth={2.2} />
          <Circle radius={6} stroke={color} strokeWidth={1.4} />
          <Circle radius={2} fill={color} />
        </>
      );

    case "puszka":
      return (
        <>
          <Circle radius={12} fill="#fff" stroke={color} strokeWidth={2.2} dash={[4, 2.5]} />
          <Line points={[-5, 0, 5, 0]} stroke={color} strokeWidth={1.5} />
          <Line points={[0, -5, 0, 5]} stroke={color} strokeWidth={1.5} />
        </>
      );

    case "wanna": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={9} fill="#fff" stroke={color} strokeWidth={2} />
          <Rect x={-w / 2 + 3.5} y={-h / 2 + 3.5} width={w - 7} height={h - 7} cornerRadius={6} stroke={color} strokeWidth={0.9} />
          <Circle x={w / 2 - 8} y={0} radius={2.4} stroke={color} strokeWidth={1.2} />
        </>
      );
    }

    case "prysznic": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={3} fill="#fff" stroke={color} strokeWidth={2} />
          <Circle radius={4.5} stroke={color} strokeWidth={1.2} />
          {[45, 135, 225, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <Line
                key={a}
                points={[Math.cos(r) * 7, Math.sin(r) * 7, Math.cos(r) * 11, Math.sin(r) * 11]}
                stroke={color}
                strokeWidth={1.2}
                lineCap="round"
              />
            );
          })}
        </>
      );
    }

    case "umywalka": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          {/* Zaokrąglenie ograniczone połową wysokości — patrz komentarz w wersji SVG. */}
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={Math.min(7, h / 2)} fill="#fff" stroke={color} strokeWidth={2} />
          <Circle x={0} y={1.5} radius={3} stroke={color} strokeWidth={1.1} />
          <Line points={[0, -h / 2 + 2, 0, -h / 2 + 5.5]} stroke={color} strokeWidth={1.6} lineCap="round" />
        </>
      );
    }

    case "rozdzielnica": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={3} fill="#fff" stroke={color} strokeWidth={2.4} />
          {[-6, 1].flatMap((y) => [-8, -2, 4].map((x) => <Rect key={`${x}-${y}`} x={x} y={y} width={4} height={6} cornerRadius={1} fill={color} opacity={0.8} />))}
        </>
      );
    }

    /**
     * Szafka teletechniczna: obudowa z PÓŁKAMI (1U), a nie z siatką modułów jak
     * rozdzielnica. Oba symbole to prostokąty tej samej wielkości, więc muszą różnić
     * się treścią — na rzucie stoją czasem obok siebie i pomylenie ich znaczy, że
     * monter ciągnie skrętkę do tablicy z bezpiecznikami.
     */
    case "szafkaTeletech": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={3} fill="#fff" stroke={color} strokeWidth={2.4} />
          {[-7, -1, 5].map((y) => (
            <Rect key={y} x={-w / 2 + 4} y={y} width={w - 8} height={3.5} cornerRadius={1} fill={color} opacity={0.75} />
          ))}
        </>
      );
    }

    case "roleta": {
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={4} fill="#fff" stroke={color} strokeWidth={2.2} />
          {[-5, 0, 5].map((yy) => (
            <Line key={yy} points={[-w / 2 + 3, yy, w / 2 - 3, yy]} stroke={color} strokeWidth={1.3} />
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
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return (
        <>
          {/* Niewidoczny cel trafień — bez wypełnienia Konva łapie klik wyłącznie na
              narysowanych pikselach, więc sam symbol kreskowy byłby prawie nieklikalny. */}
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
          <Circle x={0} y={0} radius={r} stroke={color} strokeWidth={2} />
          {segments.map((s, i) => (
            <Line key={i} points={[s.x1, s.y1, s.x2, s.y2]} stroke={color} strokeWidth={2} lineCap="round" />
          ))}
        </>
      );
    }

    default: {
      const def = ELEMENT_TYPES[type];
      const { w, h } = glyphBoxSize(type, wymiaryM);
      return <CodeBadgeKonva color={color} code={def?.code || "?"} w={w} h={h} />;
    }
  }
}

/** Przerywana obwódka zaznaczenia dopasowana do rozmiaru symbolu (okrąg dla punktu
 *  sufitowego, zaokrąglony prostokąt dla reszty). Przeniesione z `SelectionOutline`. */
export function SelectionOutlineKonva({ type, wymiaryM }: { type: ElementType; wymiaryM?: { widthM: number; depthM: number } }) {
  const { w, h } = glyphBoxSize(type, wymiaryM);
  if (type === "oswietlenie") {
    return <Circle radius={w / 2 + 6} stroke="#C1793F" strokeWidth={2} dash={[3, 3]} listening={false} />;
  }
  return (
    <Rect
      x={-w / 2 - 5}
      y={-h / 2 - 5}
      width={w + 10}
      height={h + 10}
      cornerRadius={8}
      stroke="#C1793F"
      strokeWidth={2}
      dash={[3, 3]}
      listening={false}
    />
  );
}
