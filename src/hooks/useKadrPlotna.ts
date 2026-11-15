import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DD } from "konva/lib/DragAndDrop";
import { MAX_ZOOM, minZoom } from "@/components/design/zoomPlanu";
import { clampNum } from "@/lib/geometry";
import {
  dystansPalcow,
  kadrPodPalcem,
  kierunekPalca,
  srodekPalcow,
  zoomZeSzczypania,
  type PunktEkranu,
} from "@/lib/gestDotyku";

/**
 * Sterowanie kadrem dostępne z zewnątrz płótna.
 *
 * `przesunOPiksele` kompensuje skok rysunku, gdy zmiana szerokości panelu przesunie
 * okno po ekranie; `ustaw` sprowadza kadr pod konkretny punkt planu — bez tego na
 * płótnie bez granic dało się odjechać dowolnie daleko i nie mieć jak wrócić.
 */
export interface WidokSterowanie {
  przesunOPiksele(dxPx: number, dyPx: number): void;
  ustaw(x: number, y: number): void;
}

/** Jak długo po zejściu palców gest kadru jeszcze „trwa" dla kliknięć [ms] —
 *  zdarzenie dorobione przez przeglądarkę przychodzi PO `touchend`. */
export const PO_GESCIE_KADRU_MS = 400;

export interface OpcjeKadru {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Wybrane narzędzie „Przesuń widok" — lewy przycisk i pion palca należą wtedy do kadru. */
  narzedziePrzesuwania: boolean;
  /** Uchwyt dla rodzica — patrz `WidokSterowanie`. */
  widokRef?: React.MutableRefObject<WidokSterowanie | null>;
}

/**
 * Kadr płótna: co widać (`widok`, w jednostkach planu) i wszystkie drogi, którymi
 * się go zmienia — `Ctrl` + kółko, wciśnięta rolka, lewy przycisk w „Przesuń widok",
 * jeden palec i szczypanie dwoma.
 *
 * Wydzielone z DesignCanvas w pozycji 8 przeglądu z 12.11.2026. Kadr ma jedno źródło
 * (`widok`) i jedną drogę zmiany powiększenia (`onZoomChange` + kotwica nakładana po
 * przerysowaniu) — wspólną dla kółka i szczypania.
 *
 * Kontener (`kontenerRef`) należy do hooka: na nim siedzi natywny nasłuch dotyku,
 * montowany RAZ (patrz efekt niżej).
 */
export function useKadrPlotna({ zoom, onZoomChange, narzedziePrzesuwania, widokRef }: OpcjeKadru) {
  /** Kontener okna widoku. Nie przewija się — kadr wyznacza stan `widok`. */
  const kontenerRef = useRef<HTMLDivElement>(null);
  /**
   * Lewy górny róg OKNA w jednostkach planu. To jedyny nośnik kadru: narzędzie
   * „Przesuń widok", wciśnięta rolka i Ctrl+kółko ruszają wyłącznie tę wartość.
   *
   * Wcześniej kadr wyznaczało przewinięcie kontenera, a scena miała rozmiar arkusza.
   * Działało, dopóki rysunek nie miał prawa wyjść poza arkusz — ale to właśnie ten
   * arkusz znika. Scena wielkości okna plus przesunięcie w jednostkach planu daje
   * płótno bez granic, bez drugiego układu współrzędnych obok pierwszego.
   */
  const [widok, setWidok] = useState({ x: 0, y: 0 });
  const przesuwanieRef = useRef<{ x: number; y: number; widokX: number; widokY: number } | null>(null);
  /** Tylko po to, żeby zmienić kursor na „łapkę" — sam gest żyje w refie, bo
   *  przerysowywanie sceny przy każdym pikselu ruchu byłoby marnotrawstwem. */
  const [przesuwa, setPrzesuwa] = useState(false);
  /** Punkt planu, który ma zostać pod kursorem po zmianie powiększenia.
   *  Nakładany dopiero po przerysowaniu płótna — patrz `useLayoutEffect` niżej. */
  const kotwicaZoomRef = useRef<{ planX: number; planY: number; kursorX: number; kursorY: number } | null>(null);

  /**
   * Gest palcami, który ruszał KADREM (przesuwanie jednym palcem, szczypanie) —
   * trwający albo zakończony przed chwilą.
   *
   * Konva odpala `tap` przy puszczeniu palca bez względu na to, ile palec po drodze
   * przejechał: jej jedyny warunek to ten sam kształt na starcie i na końcu. Bez tej
   * straży każde przesunięcie rzutu kończyłoby się tak jak dotknięcie w miejscu,
   * w którym palec zszedł z ekranu — postawionym gniazdkiem albo punktem ściany.
   */
  const gestKadruRef = useRef({ trwa: false, koniec: 0 });
  const poGescieKadru = useCallback(() => {
    const g = gestKadruRef.current;
    return g.trwa || Date.now() - g.koniec < PO_GESCIE_KADRU_MS;
  }, []);

  /**
   * Jeden palec na płótnie: gdzie wylądował i co z niego wyszło. `kotwica` to punkt
   * planu, który palec chwycił — ustawiana dopiero, gdy ruch okazał się przesuwaniem
   * rzutu (patrz `kierunekPalca`); `oddany` — gest należy do kogoś innego (przewijanie
   * strony, przeciąganie elementu).
   */
  const palecRef = useRef<{
    x: number;
    y: number;
    naKsztalcie: boolean;
    kotwica: PunktEkranu | null;
    oddany: boolean;
  } | null>(null);

  /** Rozstaw palców, powiększenie i punkt planu spod środka palców z chwili
   *  ROZPOCZĘCIA szczypania — patrz `zoomZeSzczypania` i `kadrPodPalcem`. */
  const szczypanieRef = useRef<{ dystans: number; zoom: number; kotwica: PunktEkranu } | null>(null);
  /**
   * Trwa szczypanie — na ten czas NIC na płótnie nie jest przeciągalne.
   *
   * Konva prowadzi własne przeciąganie na PIERWSZYM wskaźniku i nie obchodzi jej, ilu
   * palców dotyczy gest. Szczypanie zaczyna się tak samo jak przeciągnięcie — jednym
   * palcem postawionym na czymś narysowanym — więc gdy palce się rozjeżdżają, Konva
   * czyta ruch tego pierwszego jako przeciągnięcie i przesuwa element pod nim.
   * Zmierzone: gniazdko w (100, 99) jedn. po jednym szczypnięciu lądowało w (90, 100),
   * z wpisem do projektu i do historii cofania.
   *
   * `preventDefault` w `prowadz` tego NIE zatrzymuje — gasi domyślne zachowanie
   * przeglądarki (przewijanie strony), a przeciąganie Konvy to zwykły JavaScript.
   *
   * Dlatego zdejmujemy `draggable`, i to działa z powodu, który warto znać: Konva
   * zakłada „zalążek" przeciągnięcia już przy `touchstart`, ale w stanie `ready` —
   * właściwy `dragstart` odpala dopiero pierwszy ruch. Zdjęte `draggable` kasuje taki
   * zalążek po cichu, BEZ `dragstart` i `dragend`, więc do store'a nie idzie nic
   * (gdyby przeciąganie zdążyło się zacząć, Konva wywołałaby `dragend` i zapisała
   * przesunięcie — stąd przełącznik przy DRUGIM palcu, a nie przy pierwszym ruchu).
   *
   * Stan, nie ref, bo `draggable` jest propsem węzłów i musi przejść przez render.
   * Jedno dodatkowe przerysowanie na gest — koszt bez znaczenia wobec cichej zmiany
   * w projekcie.
   */
  const [szczypie, setSzczypie] = useState(false);
  /**
   * Bieżący kadr i sposób zmiany powiększenia — dla nasłuchu dotyku.
   *
   * Nasłuch montuje się RAZ (patrz efekt niżej: musi być nie-pasywny, żeby wolno mu
   * było zatrzymać przewijanie strony), a kadr zmienia się co klatkę gestu. Bez refa
   * trzeba by go przepinać po każdym przesunięciu — w środku szczypania.
   */
  const kadrRef = useRef({ zoom, widok, onZoomChange, narzedziePrzesuwania });
  kadrRef.current = { zoom, widok, onZoomChange, narzedziePrzesuwania };

  /**
   * Wystawia sterowanie kadrem na zewnątrz. `useLayoutEffect`, bo `DesignTab` woła
   * `przesunOPiksele` ze SWOJEGO efektu układu — a efekty układu dziecka wchodzą przed
   * efektami rodzica, więc przy zwykłym `useEffect` uchwyt bywałby jeszcze pusty.
   */
  useLayoutEffect(() => {
    if (!widokRef) return;
    widokRef.current = {
      przesunOPiksele: (dxPx, dyPx) => {
        if (dxPx === 0 && dyPx === 0) return;
        setWidok((w) => ({ x: w.x + dxPx / zoom, y: w.y + dyPx / zoom }));
      },
      ustaw: (x, y) => setWidok({ x, y }),
    };
    return () => {
      widokRef.current = null;
    };
  }, [widokRef, zoom]);

  /** Nakłada kadr utrzymujący punkt spod kursora po zmianie powiększenia.
   *  `useLayoutEffect`, nie `useEffect`: kadr musi wejść w tej samej klatce,
   *  w której płótno dostało nową skalę — inaczej widać przeskok. */
  useLayoutEffect(() => {
    const k = kotwicaZoomRef.current;
    if (!k) return;
    kotwicaZoomRef.current = null;
    // Punkt spod kursora ma zostać pod kursorem: przesuwamy okno tak, żeby po nowym
    // powiększeniu wypadł w tym samym miejscu ekranu.
    setWidok({ x: k.planX - k.kursorX / zoom, y: k.planY - k.kursorY / zoom });
  }, [zoom]);

  /**
   * `Ctrl` + kółko: przybliżenie z zachowaniem punktu pod kursorem. Kółko BEZ `Ctrl`
   * nie jest sprawą kadru (przewija stronę) — rozstrzyga o tym wołający.
   *
   * Nowa skala wchodzi przez stan rodzica, więc kadr trzeba nałożyć dopiero PO
   * przerysowaniu (patrz `useLayoutEffect` wyżej).
   */
  function przyblizKolkiem(evt: WheelEvent) {
    evt.preventDefault();
    const el = kontenerRef.current;
    if (!el) return;
    const ramka = el.getBoundingClientRect();
    const kursorX = evt.clientX - ramka.left;
    const kursorY = evt.clientY - ramka.top;
    // Punkt planu pod kursorem — to on ma zostać w tym samym miejscu ekranu.
    const planX = widok.x + kursorX / zoom;
    const planY = widok.y + kursorY / zoom;
    const factor = evt.deltaY < 0 ? 1.1 : 0.9;
    const nowaSkala = clampNum(zoom * factor, minZoom(), MAX_ZOOM);
    if (nowaSkala === zoom) return;
    kotwicaZoomRef.current = { planX, planY, kursorX, kursorY };
    onZoomChange(nowaSkala);
  }

  /**
   * Szczypanie dwoma palcami i przesuwanie jednym.
   *
   * `Ctrl` + kółko, czyli sposób na myszy, na telefonie nie istnieje; zostawały
   * przyciski `−` i `+` w pasku, a szczypanie — po które sięga tam odruchowo każdy —
   * powiększało CAŁĄ STRONĘ razem z paskami.
   *
   * NATYWNY nasłuch, a nie `onTouchMove` Reacta, i to jest tu sedno: React podpina
   * `touchmove` jako PASYWNY, czyli taki, któremu nie wolno zatrzymać przewijania.
   * Bez `preventDefault` przeglądarka przewijałaby stronę w trakcie gestu (płótno ma
   * `touch-action: pan-y`, żeby JEDEN palec nadal przewijał w pionie), a my zmienialibyśmy
   * przy tym powiększenie — dwie rzeczy naraz i żadna do końca.
   *
   * Montowany RAZ. Wszystko, co zmienne, idzie przez `kadrRef`: przepinanie nasłuchu
   * po każdej klatce gestu gubiłoby zdarzenia w jego trakcie.
   */
  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;

    /** Dwa pierwsze palce jako punkty ekranu. Trzeci i dalsze gest ignoruje. */
    function palce(e: TouchEvent): [PunktEkranu, PunktEkranu] | null {
      if (e.touches.length < 2) return null;
      const a = e.touches[0];
      const b = e.touches[1];
      return [
        { x: a.clientX, y: a.clientY },
        { x: b.clientX, y: b.clientY },
      ];
    }

    /** Punkt ekranu względem lewego górnego rogu płótna. */
    function naPlotnie(p: PunktEkranu): PunktEkranu {
      const ramka = el!.getBoundingClientRect();
      return { x: p.x - ramka.left, y: p.y - ramka.top };
    }

    /** Punkt planu leżący pod punktem ekranu — w BIEŻĄCYM kadrze. */
    function punktPlanu(p: PunktEkranu): PunktEkranu {
      const { zoom: z, widok: w } = kadrRef.current;
      const n = naPlotnie(p);
      return { x: w.x + n.x / z, y: w.y + n.y / z };
    }

    function zacznij(e: TouchEvent) {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        palecRef.current = {
          x: t.clientX,
          y: t.clientY,
          // Nasz nasłuch siedzi na kontenerze, więc Konva obsłużyła już to dotknięcie
          // — i jeśli trafiło w kształt, zgasiła je (patrz `klikAlboDotyk` w DesignCanvas).
          // Przeglądarka nie przewinie wtedy strony w żadną stronę, więc rzut może jechać
          // także w pionie.
          naKsztalcie: e.defaultPrevented,
          kotwica: null,
          oddany: false,
        };
        return;
      }
      const para = palce(e);
      if (!para) return;
      // Drugi palec przejmuje gest od pierwszego: od teraz to szczypanie.
      palecRef.current = null;
      gestKadruRef.current.trwa = true;
      szczypanieRef.current = {
        dystans: dystansPalcow(para[0], para[1]),
        zoom: kadrRef.current.zoom,
        kotwica: punktPlanu(srodekPalcow(para[0], para[1])),
      };
      // Drugi palec wylądował — zdejmujemy przeciąganie, ZANIM przyjdzie pierwszy ruch
      // (patrz `szczypie`). React zbiera tę zmianę w mikrozadaniu, czyli przed kolejnym
      // zdarzeniem dotyku, więc węzły są już nieprzeciągalne, gdy Konva zaczyna czytać
      // ruch palców.
      setSzczypie(true);
    }

    function prowadz(e: TouchEvent) {
      if (e.touches.length === 1) {
        prowadzJednym(e, e.touches[0]);
        return;
      }
      const start = szczypanieRef.current;
      const para = palce(e);
      if (!start || !para) return;
      // Gest należy do nas — strona nie ma się przy okazji przewijać.
      e.preventDefault();
      const { zoom: zoomTeraz, onZoomChange: zmienZoom } = kadrRef.current;
      const nowaSkala = zoomZeSzczypania(start.zoom, start.dystans, dystansPalcow(para[0], para[1]), {
        min: minZoom(),
        max: MAX_ZOOM,
      });
      /**
       * Punkt planu chwycony NA POCZĄTKU gestu ma leżeć pod BIEŻĄCYM środkiem palców.
       * Jedna zasada na oba ruchy naraz: palce rozsunięte przybliżają, palce przesunięte
       * ciągną za sobą rzut.
       *
       * Wcześniej kotwica była liczona co klatkę z bieżącego położenia palców — czyli
       * trzymała pod palcami to, co akurat pod nimi było, i przesuwanie dwoma palcami
       * nie ruszało rzutu wcale. Do tego klatka bez zmiany powiększenia (palce w stałym
       * rozstawie, albo powiększenie oparte o granicę) kończyła się, zanim cokolwiek
       * przesunęła.
       */
      const kursor = naPlotnie(srodekPalcow(para[0], para[1]));
      if (nowaSkala === zoomTeraz) {
        setWidok(kadrPodPalcem(start.kotwica, kursor, zoomTeraz));
        return;
      }
      // Nowe powiększenie wchodzi przez rodzica, a kadr dopiero po przerysowaniu —
      // ta sama droga co `Ctrl` + kółko (patrz `przyblizKolkiem` i `useLayoutEffect` wyżej).
      kotwicaZoomRef.current = { planX: start.kotwica.x, planY: start.kotwica.y, kursorX: kursor.x, kursorY: kursor.y };
      zmienZoom(nowaSkala);
    }

    /**
     * Przesuwanie rzutu JEDNYM palcem.
     *
     * W bok — zawsze: strona w poziomie się nie przewija, więc ten ruch nikomu innemu
     * nie jest potrzebny. W pionie — tylko gdy przeglądarka i tak by go nie wzięła
     * (palec postawiony na narysowanym kształcie) albo gdy wybrane jest „Przesuń widok";
     * poza tym pion zostaje przewijaniu strony (patrz `touchAction` na kontenerze).
     *
     * Przeciąganie elementu albo uchwytu ma pierwszeństwo: Konva zakłada jego zalążek
     * już przy dotknięciu (`DD._dragElements`), a nasz nasłuch na kontenerze dostaje
     * pierwszy ruch, ZANIM Konva zdąży zacząć właściwe przeciąganie.
     */
    function prowadzJednym(e: TouchEvent, t: Touch) {
      const p = palecRef.current;
      if (!p || p.oddany) return;
      if (!p.kotwica) {
        if (DD._dragElements.size > 0) {
          p.oddany = true;
          return;
        }
        const kierunek = kierunekPalca(t.clientX - p.x, t.clientY - p.y);
        if (kierunek === "za-wcześnie") return;
        if (kierunek === "pionowo" && !p.naKsztalcie && !kadrRef.current.narzedziePrzesuwania) {
          p.oddany = true;
          return;
        }
        // Chwytamy punkt spod MIEJSCA DOTKNIĘCIA, nie spod palca po przekroczeniu progu —
        // rzut dociąga wtedy te kilka pikseli i dalej jedzie dokładnie pod palcem.
        p.kotwica = punktPlanu({ x: p.x, y: p.y });
        gestKadruRef.current.trwa = true;
      }
      if (e.cancelable) e.preventDefault();
      setWidok(kadrPodPalcem(p.kotwica, naPlotnie({ x: t.clientX, y: t.clientY }), kadrRef.current.zoom));
    }

    /** Jeden palec to już nie szczypanie. Kolejne rozsunięcie zaczyna gest OD NOWA,
     *  od bieżącego powiększenia — inaczej po puszczeniu i ponownym złapaniu rzut
     *  skakałby do rozstawu sprzed przerwy. */
    function zakoncz(e: TouchEvent) {
      if (e.touches.length === 0) {
        palecRef.current = null;
        // Straż `poGescieKadru` trzyma jeszcze chwilę po zejściu palców: zdarzenie
        // dorobione przez przeglądarkę przychodzi PO `touchend`.
        const g = gestKadruRef.current;
        if (g.trwa) {
          g.trwa = false;
          g.koniec = Date.now();
        }
      }
      if (e.touches.length >= 2) return;
      szczypanieRef.current = null;
      // Przeciąganie wraca dopiero, gdy z ekranu zejdzie DRUGI palec. Palec, który
      // został, ma już swój zalążek przeciągnięcia skasowany, więc nie zacznie
      // przesuwać elementu w środku gestu — ruszy dopiero następne dotknięcie.
      setSzczypie(false);
    }

    el.addEventListener("touchstart", zacznij, { passive: false });
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

  /**
   * JEDEN mechanizm przesuwania widoku myszą: narzędzie „Przesuń widok" (lewy
   * przycisk) i wciśnięta rolka (środkowy) — ta druga NIEZALEŻNIE od narzędzia,
   * jak w programach CAD. Dzięki temu można poprawić kadr w trakcie rysowania
   * ściany, bez przełączania się na „Przesuń widok" i z powrotem (co porzuciłoby
   * zaczęty odcinek).
   */
  function zacznijPrzesuwanie(e: ReactPointerEvent<HTMLDivElement>) {
    // Środkowy przycisk działa ZAWSZE, lewy tylko w trybie „Przesuń widok" —
    // inaczej odebrałby rysowanie wszystkim pozostałym narzędziom.
    const rolka = e.button === 1;
    const lewyWTrybiePan = e.button === 0 && narzedziePrzesuwania;
    if (!rolka && !lewyWTrybiePan) return;
    // Palec przesuwa rzut własną drogą (`prowadzJednym`), która zna też szczypanie —
    // tutaj każdy palec zaczynałby osobne przesuwanie i dwa gesty biłyby się o kadr.
    if (e.pointerType === "touch") return;
    const el = kontenerRef.current;
    if (!el) return;
    // `preventDefault` gasi windowsowe autoprzewijanie (kółko z kotwicą), które
    // inaczej przejmuje gest i pokazuje własny kursor.
    if (rolka) e.preventDefault();
    przesuwanieRef.current = { x: e.clientX, y: e.clientY, widokX: widok.x, widokY: widok.y };
    el.setPointerCapture(e.pointerId);
    setPrzesuwa(true);
  }

  function przesun(e: ReactPointerEvent<HTMLDivElement>) {
    const start = przesuwanieRef.current;
    if (!start) return;
    // Minus: chwytamy rysunek i ciągniemy go za kursorem, więc widok jedzie
    // w przeciwną stronę niż mysz. Dzielenie przez powiększenie, bo widok żyje
    // w jednostkach planu, a ruch myszy przychodzi w pikselach.
    setWidok({
      x: start.widokX - (e.clientX - start.x) / zoom,
      y: start.widokY - (e.clientY - start.y) / zoom,
    });
  }

  function zakonczPrzesuwanie(e: ReactPointerEvent<HTMLDivElement>) {
    if (!przesuwanieRef.current) return;
    przesuwanieRef.current = null;
    kontenerRef.current?.releasePointerCapture(e.pointerId);
    setPrzesuwa(false);
  }

  return {
    kontenerRef,
    widok,
    /** Trwa przesuwanie myszą — stan, dla kursora „łapki" i ducha elementu. */
    przesuwa,
    /** To samo w chwili zdarzenia, bez czekania na render. */
    trwaPrzesuwanie: () => przesuwanieRef.current !== null,
    szczypie,
    poGescieKadru,
    przyblizKolkiem,
    zacznijPrzesuwanie,
    przesun,
    zakonczPrzesuwanie,
  };
}
