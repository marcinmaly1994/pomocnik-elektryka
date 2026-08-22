import { useEffect, useRef, useState } from "react";
import { Crop } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Point } from "@/types";

export interface ObszarZaznaczenia {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropToolProps {
  obrazUrl: string;
  szerokoscObrazu: number;
  wysokoscObrazu: number;
  onPrzytnij: (obszar: ObszarZaznaczenia) => void;
  onPomin: () => void;
}

/**
 * Przycinanie wgranego rzutu PRZED ręcznym rysowaniem.
 *
 * Profesjonalne rzuty prawie zawsze mają obok planu tabelkę z legendą
 * pomieszczeń, stopkę z zastrzeżeniem autorskim albo wymiarowanie z dala od
 * budynku — nic z tego nie jest częścią samego planu. To narzędzie daje
 * użytkownikowi wprost kontrolę: zaznacz obszar do zachowania, reszta znika
 * z SAMEGO PODKŁADU (patrz `przytnijRzut` w source.ts, canvas `drawImage`
 * z przesunięciem), nie tylko z widoku — więc nie trzeba tego robić ponownie
 * przy każdym powrocie do tego samego pliku.
 *
 * Zaznaczanie działa KLIKNIĘCIAMI, nie przeciąganiem (LPM → narożnik, ruch
 * myszy BEZ trzymania przycisku → gumowy prostokąt, LPM → drugi narożnik) —
 * ten sam wzorzec „klik-ruch-klik" co rysowanie ściany/wieloboku pomieszczenia
 * na głównym płótnie, żeby zaznaczanie na trackpadzie/precyzyjne nie wymagało
 * utrzymania przycisku przez cały czas ruchu. PPM/Escape anulują w trakcie
 * rysowania; gdy prostokąt jest już gotowy, LPM albo Enter zatwierdzają go
 * od razu (bez konieczności sięgania po przycisk „Przytnij zaznaczenie"),
 * a PPM/Escape pozwalają zacząć od nowa.
 *
 * Rysowanie w SVG z prostą konwersją współrzędnych (viewBox 1:1 z rzutem,
 * przeliczenie przez `getBoundingClientRect`) — ten sam trik co gdziekolwiek
 * indziej w aplikacji trzeba kliknąć w konkretny punkt obrazu.
 */
export function CropTool({ obrazUrl, szerokoscObrazu: W, wysokoscObrazu: H, onPrzytnij, onPomin }: CropToolProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  // Prostokąt jest w trakcie rysowania (drugi róg jeszcze podąża za kursorem),
  // dopóki nie padnie DRUGIE kliknięcie — dopiero wtedy `drawn` się ustala i
  // ruch myszy przestaje go zmieniać.
  const [drawn, setDrawn] = useState(false);
  // Patrz komentarz przy `useEffect` niżej — trzymają najświeższe wartości dla
  // listenera klawiatury podpiętego raz, a nie na nowo przy każdym renderze.
  const startRef = useRef(start);
  const rectSensownyRef = useRef<ObszarZaznaczenia | null>(null);
  const onPrzytnijRef = useRef(onPrzytnij);

  function punktZeZdarzenia(e: { clientX: number; clientY: number }): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  }

  const rect =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        }
      : null;
  // Klik bez ruchu (albo znikomy ruch) nie liczy się jako sensowne zaznaczenie —
  // inaczej dwa kliknięcia w to samo miejsce od razu „przycinałyby" do piksela.
  const rectSensowny = drawn && rect && rect.w >= 10 && rect.h >= 10 ? rect : null;

  function anuluj() {
    setStart(null);
    setCurrent(null);
    setDrawn(false);
  }

  function klik(e: React.MouseEvent) {
    const p = punktZeZdarzenia(e);
    if (!p) return;
    if (drawn) {
      // Prostokąt już narysowany — kolejny LPM zatwierdza go, tak jak Enter.
      if (rectSensowny) onPrzytnij(rectSensowny);
      return;
    }
    if (!start) {
      setStart(p);
      setCurrent(p);
      return;
    }
    setCurrent(p);
    setDrawn(true);
  }

  function ruchMyszy(e: React.MouseEvent) {
    if (!start || drawn) return;
    const p = punktZeZdarzenia(e);
    if (p) setCurrent(p);
  }

  function ppm(e: React.MouseEvent) {
    e.preventDefault();
    if (start) anuluj();
  }

  // Listener podpięty RAZ (puste zależności) i czytający najświeższy stan przez
  // refy, a nie przez domknięcie odtwarzane co render: przy re-subskrypcji na
  // każdym renderze (`useEffect` bez tablicy zależności — wzorzec użyty gdzie
  // indziej w tym pliku dla klawiszy Delete/Escape w `DesignTab.tsx`) zdarzenie
  // Escape/Enter potrafiło trafić w moment MIĘDZY zdjęciem starego listenera a
  // podpięciem nowego (tu akurat renderów jest dużo — każdy ruch myszy podczas
  // rysowania to nowy render rodzica), więc klawisz cichutko ginął.
  startRef.current = start;
  rectSensownyRef.current = rectSensowny;
  onPrzytnijRef.current = onPrzytnij;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && startRef.current) {
        setStart(null);
        setCurrent(null);
        setDrawn(false);
        return;
      }
      if (e.key === "Enter" && rectSensownyRef.current) {
        e.preventDefault();
        onPrzytnijRef.current(rectSensownyRef.current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const podpowiedz = drawn
    ? "Kliknij ponownie albo naciśnij Enter, żeby zatwierdzić — PPM/Esc zaczyna od nowa."
    : start
      ? "Kliknij drugi róg, żeby zakończyć zaznaczanie — PPM/Esc anuluje."
      : "Kliknij pierwszy róg obszaru, który chcesz zachować.";

  return (
    <div className="pe-card p-4">
      <h2 className="pe-display mb-1 text-[15px]">Przytnij rzut</h2>
      <p className="mb-1 text-sm text-slate-600">
        Zaznacz obszar, który chcesz zachować — resztę (np. tabelkę z legendą pomieszczeń albo opis obok planu)
        usuniemy z podkładu. Możesz też pominąć ten krok i użyć całego pliku.
      </p>
      <p className="mb-3 text-xs text-slate-500">{podpowiedz}</p>

      <div className="overflow-auto rounded-card border border-border" style={{ background: "#EDF0F3" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          onClick={klik}
          onMouseMove={ruchMyszy}
          onContextMenu={ppm}
          role="img"
          aria-label="Wgrany rzut — kliknij, żeby zaznaczyć obszar do zachowania"
          style={{ display: "block", width: "100%", height: "auto", cursor: "crosshair" }}
        >
          <image href={obrazUrl} x={0} y={0} width={W} height={H} />
          {rect && (
            <>
              {/* Przyciemnienie POZA zaznaczeniem — widać z góry, co zniknie. */}
              <path
                d={`M0,0H${W}V${H}H0Z M${rect.x},${rect.y}H${rect.x + rect.w}V${rect.y + rect.h}H${rect.x}Z`}
                fillRule="evenodd"
                fill="#16202B"
                fillOpacity={0.45}
              />
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                fill="none"
                stroke="#C1793F"
                strokeWidth={Math.max(2, W / 400)}
                strokeDasharray={drawn ? undefined : `${Math.max(4, W / 150)} ${Math.max(3, W / 200)}`}
              />
            </>
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onPomin} className="text-xs text-slate-400 underline hover:text-slate-600">
          Pomiń — użyj całego rzutu
        </button>
        <Button
          variant="copper"
          size="sm"
          className="ml-auto"
          disabled={!rectSensowny}
          onClick={() => rectSensowny && onPrzytnij(rectSensowny)}
        >
          <Crop size={14} /> Przytnij zaznaczenie
        </Button>
      </div>
    </div>
  );
}
