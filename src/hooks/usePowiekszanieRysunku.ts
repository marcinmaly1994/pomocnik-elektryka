import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { dystansPalcow, srodekPalcow, zoomZeSzczypania, type PunktEkranu } from "@/lib/gestDotyku";

/**
 * Powiększanie rysunku w przewijanym pojemniku — przyciski i szczypanie dwoma palcami.
 *
 * Powstało dla schematu jednokreskowego na telefonie: rysunek szeroki na 1200 px
 * w okienku 330 px pokazywał pustą górną połowę i ani kawałka rozdzielnicy głównej,
 * a jedynym sposobem, żeby zobaczyć całość, było przewijanie w bok na ślepo.
 *
 * Przesuwanie JEDNYM palcem zostaje przewijaniu pojemnika (natywne, z bezwładnością).
 * Dwa palce bierzemy my — pojemnik ma `touch-action: pan-x pan-y`, więc przeglądarka
 * nie powiększa przy tym całej strony.
 *
 * @param szerRysunku naturalna szerokość rysunku [px] (przy powiększeniu 1)
 * @param dopasujNaStarcie czy bez ręcznego wyboru rysunek ma wypełnić szerokość
 * @param srodekStartowyX punkt rysunku (x w jednostkach rysunku), który na starcie ma
 *   stanąć na środku okienka — np. wyłącznik główny schematu. Bez niego start od lewej.
 */
export function usePowiekszanieRysunku(szerRysunku: number, dopasujNaStarcie: boolean, srodekStartowyX?: number) {
  const kontenerRef = useRef<HTMLDivElement>(null);
  /** Szerokość wnętrza pojemnika (bez paddingu) — do niej dopasowujemy. */
  const [dostepna, setDostepna] = useState(0);
  /** Powiększenie wybrane ręcznie; `null` = domyślne (dopasowane albo 100%). */
  const [reczny, setReczny] = useState<number | null>(null);

  const dopasowany = dostepna > 0 ? Math.min(1, dostepna / szerRysunku) : 1;
  const min = Math.min(0.25, dopasowany);
  const max = 3;
  const zoom = reczny ?? (dopasujNaStarcie ? dopasowany : 1);

  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;
    const zmierz = () => {
      const s = getComputedStyle(el);
      setDostepna(el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight));
    };
    zmierz();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(zmierz);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ustaw = useCallback((z: number) => setReczny(Math.min(max, Math.max(min, z))), [min]);

  /**
   * Punkt rysunku, który ma zostać pod środkiem palców po zmianie powiększenia —
   * nakładany dopiero po przerysowaniu, kiedy pojemnik zna już nowy rozmiar treści
   * (wcześniej przewinięcie zostałoby przycięte do starego).
   */
  const kotwicaRef = useRef<{
    rys: PunktEkranu;
    palce: PunktEkranu;
    palceEkran: PunktEkranu;
    /** Czy wyrównywać też przewinięcie STRONY — patrz `kotwiczWSrodku`. */
    strona: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const k = kotwicaRef.current;
    const el = kontenerRef.current;
    if (!k || !el) return;
    kotwicaRef.current = null;
    const s = getComputedStyle(el);
    const padL = parseFloat(s.paddingLeft);
    const padT = parseFloat(s.paddingTop);
    el.scrollLeft = k.rys.x * zoom + padL - k.palce.x;
    el.scrollTop = k.rys.y * zoom + padT - k.palce.y;
    // Czego nie da się ustawić przewinięciem pojemnika, wyrównuje przewinięcie STRONY.
    // Dopasowany schemat jest niski i po powiększeniu dalej mieści się w okienku w pionie
    // — okienko po prostu rośnie w dół, a z nim ucieka punkt spod palców.
    if (!k.strona) return;
    const r = el.getBoundingClientRect();
    const dy = r.top + padT + k.rys.y * zoom - el.scrollTop - k.palceEkran.y;
    if (Math.abs(dy) > 0.5) window.scrollBy(0, dy);
  }, [zoom]);

  /**
   * Kadr startowy: `srodekStartowyX` na środku okienka, raz — gdy pojemnik zna już
   * swoją szerokość. Schemat w czytelnym rozmiarze jest kilka razy szerszy od telefonu,
   * a start od lewej krawędzi pokazywał ogranicznik przepięć i pierwsze obwody zamiast
   * wyłącznika głównego, od którego schemat się czyta.
   */
  const startUstawionyRef = useRef(false);
  useLayoutEffect(() => {
    const el = kontenerRef.current;
    if (!el || startUstawionyRef.current || dostepna <= 0 || srodekStartowyX === undefined) return;
    startUstawionyRef.current = true;
    const padL = parseFloat(getComputedStyle(el).paddingLeft);
    el.scrollLeft = srodekStartowyX * zoom + padL - el.clientWidth / 2;
  }, [dostepna, srodekStartowyX, zoom]);

  /**
   * Zmiana powiększenia PRZYCISKIEM trzyma środek tego, co widać w okienku.
   *
   * Bez tego „+" powiększał od lewej krawędzi: po trzech stuknięciach widać było lewą
   * grupę obwodów, a wyłącznik główny, na który się patrzyło, uciekał za prawą krawędź.
   *
   * Strony tu NIE przewijamy (w odróżnieniu od szczypania): okienko rośnie w dół, a
   * dociąganie strony za jego środkiem wypychałoby w górę pasek z „+", w który ktoś
   * właśnie stuka po raz kolejny.
   */
  const zmienWSrodku = useCallback((nowy: number) => {
    const el = kontenerRef.current;
    const { zoom: teraz, min: zMin, max: zMax } = stanRef.current;
    const docelowy = Math.min(zMax, Math.max(zMin, nowy));
    if (el && Math.abs(docelowy - teraz) > 1e-9) {
      const s = getComputedStyle(el);
      const palce = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      kotwicaRef.current = {
        rys: {
          x: (el.scrollLeft + palce.x - parseFloat(s.paddingLeft)) / teraz,
          y: (el.scrollTop + palce.y - parseFloat(s.paddingTop)) / teraz,
        },
        palce,
        palceEkran: palce,
        strona: false,
      };
    }
    setReczny(docelowy);
  }, []);

  /** Bieżące wartości dla nasłuchu montowanego raz — patrz ten sam wzorzec w DesignCanvas. */
  const stanRef = useRef({ zoom, ustaw, min, max });
  stanRef.current = { zoom, ustaw, min, max };

  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;
    let start: { dystans: number; zoom: number } | null = null;

    const palce = (e: TouchEvent): [PunktEkranu, PunktEkranu] | null =>
      e.touches.length < 2
        ? null
        : [
            { x: e.touches[0].clientX, y: e.touches[0].clientY },
            { x: e.touches[1].clientX, y: e.touches[1].clientY },
          ];

    function zacznij(e: TouchEvent) {
      const para = palce(e);
      if (!para) return;
      start = { dystans: dystansPalcow(para[0], para[1]), zoom: stanRef.current.zoom };
    }

    function prowadz(e: TouchEvent) {
      const para = palce(e);
      if (!start || !para) return;
      e.preventDefault();
      const { zoom: teraz, ustaw: ustawZoom, min: zMin, max: zMax } = stanRef.current;
      const nowy = zoomZeSzczypania(start.zoom, start.dystans, dystansPalcow(para[0], para[1]), { min: zMin, max: zMax });
      // Oparte o granicę: bez zmiany nie będzie przerysowania, a kotwica zawisłaby do
      // następnej zmiany i zadziałała wtedy w złym miejscu.
      if (Math.abs(nowy - teraz) < 1e-9) return;
      const ramka = el!.getBoundingClientRect();
      const s = getComputedStyle(el!);
      const srodek = srodekPalcow(para[0], para[1]);
      const palceWPojemniku = { x: srodek.x - ramka.left, y: srodek.y - ramka.top };
      // Punkt RYSUNKU pod palcami w bieżącym powiększeniu — ma pod nimi zostać.
      kotwicaRef.current = {
        rys: {
          x: (el!.scrollLeft + palceWPojemniku.x - parseFloat(s.paddingLeft)) / teraz,
          y: (el!.scrollTop + palceWPojemniku.y - parseFloat(s.paddingTop)) / teraz,
        },
        palce: palceWPojemniku,
        palceEkran: srodek,
        strona: true,
      };
      ustawZoom(nowy);
    }

    function zakoncz(e: TouchEvent) {
      if (e.touches.length < 2) start = null;
    }

    el.addEventListener("touchstart", zacznij, { passive: true });
    el.addEventListener("touchmove", prowadz, { passive: false });
    el.addEventListener("touchend", zakoncz);
    el.addEventListener("touchcancel", zakoncz);
    return () => {
      el.removeEventListener("touchstart", zacznij);
      el.removeEventListener("touchmove", prowadz);
      el.removeEventListener("touchend", zakoncz);
      el.removeEventListener("touchcancel", zakoncz);
    };
  }, []);

  return {
    kontenerRef,
    zoom,
    min,
    max,
    powieksz: () => zmienWSrodku(zoom * 1.25),
    pomniejsz: () => zmienWSrodku(zoom / 1.25),
    dopasuj: () => zmienWSrodku(dopasowany),
    /** Powiększony ponad dopasowanie — czyli jest co przewijać w bok. */
    powiekszony: zoom > dopasowany + 1e-6,
    naturalny: () => zmienWSrodku(1),
  };
}
