import { useCallback, useEffect, useRef } from "react";

/**
 * Długie przytrzymanie palcem = to samo menu, co prawy przycisk myszy.
 *
 * PO CO: menu kontekstowe otwierał wyłącznie `contextmenu`, którego na dotyku nie ma
 * jak wywołać. A w tym menu mieszka wszystko, co się robi z zaznaczoną rzeczą — usuń,
 * obróć, zatwierdź ścianę, utwórz ścianę z obrysu. Drugą drogą do tych akcji są skróty
 * `Delete`, `R` i `Enter`, których na telefonie też nie ma. Efekt: na telefonie dawało
 * się narysować cały plan i nie dawało skasować ani obrócić niczego pojedynczego.
 *
 * Samo RYSOWANIE dotykiem działa i działało — przeglądarka dorabia po `touchend`
 * zgodnościowe `mousedown`/`mouseup`/`click`, Konva je przepuszcza i obsługa myszy
 * odpala się normalnie. To te same dorobione zdarzenia są tu zresztą kłopotem: patrz
 * `pochlonEchoKliku`.
 */

/** Ile trzeba trzymać, żeby to było przytrzymanie, a nie dotknięcie [ms]. */
export const CZAS_PRZYTRZYMANIA = 500;

/**
 * O ile palec może drgnąć, zanim uznamy gest za przesuwanie [px].
 *
 * Palec nie stoi w miejscu tak jak kursor: nawet „nieruchome" przytrzymanie daje kilka
 * pikseli wędrówki. Przy zerowej tolerancji menu nie otwierałoby się prawie nigdy.
 */
export const TOLERANCJA_RUCHU = 10;

/**
 * Tyle pamiętamy o otwartym menu, czekając na dorobiony klik [ms].
 *
 * Zapas na wszelki wypadek, nie główny mechanizm: echo przychodzi tuż po `touchend`,
 * a każde NOWE dotknięcie i tak kasuje tę pamięć (patrz `onTouchStart`). Bez tego
 * drugiego kasowania dotknięcie zaraz po zamknięciu menu wpadało jeszcze w okno
 * pamięci i było połykane — element nie stawiał się wcale.
 */
const PAMIEC_ECHA = 400;

/**
 * Zdarzenie dotyku w kształcie, jakiego potrzebuje ten hook.
 *
 * Opisane strukturalnie, a nie typem Konvy, żeby regułę gestu dało się sprawdzić
 * testem bez montowania płótna — `KonvaEventObject<TouchEvent>` pasuje tu sam z siebie.
 */
export interface ZdarzenieDotyku {
  evt: { touches: ArrayLike<{ clientX: number; clientY: number }>; preventDefault(): void };
  cancelBubble: boolean;
}

export interface PrzytrzymanieApi {
  /**
   * Propsy dotykowe dla węzła Konvy. `akcja` dostaje współrzędne EKRANU — te same,
   * którymi menu kontekstowe karmi się z `e.evt.clientX/Y` przy prawym przycisku.
   */
  propsy(akcja: (x: number, y: number) => void): {
    onTouchStart: (e: ZdarzenieDotyku) => void;
    onTouchMove: (e: ZdarzenieDotyku) => void;
    onTouchEnd: (e: ZdarzenieDotyku) => void;
  };
  /**
   * Czy nadchodzące kliknięcie jest ECHEM przytrzymania — i jednoczesne skasowanie
   * tej pamięci.
   *
   * Po `touchend` przeglądarka dorabia `click` w miejscu, w którym leżał palec. Bez tej
   * straży menu otwierałoby się i NATYCHMIAST stawiało pod sobą element albo dokładało
   * punkt ściany. Ten sam wzorzec, co `elementDragJustEndedRef` przy echu przeciągnięcia.
   *
   * Pas i szelki: echo gasimy najpierw `preventDefault` na `touchend` (przeglądarka nie
   * dorabia wtedy niczego), a to jest druga linia — bo pomyłka kosztuje tu nie brzydki
   * widok, tylko element postawiony bez wiedzy użytkownika.
   */
  pochlonEchoKliku(): boolean;
}

export function useDlugiePrzytrzymanie(): PrzytrzymanieApi {
  const licznikRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  /** Czy TO przytrzymanie otworzyło już menu — decyduje o `preventDefault` na `touchend`. */
  const otwarteRef = useRef(false);
  const echoRef = useRef(false);
  const echoLicznikRef = useRef<number | null>(null);

  /** Kasuje pamięć o dorobionym kliknięciu razem z jej licznikiem. */
  const zapomnijEcho = useCallback(() => {
    echoRef.current = false;
    if (echoLicznikRef.current !== null) {
      window.clearTimeout(echoLicznikRef.current);
      echoLicznikRef.current = null;
    }
  }, []);

  const przerwij = useCallback(() => {
    if (licznikRef.current !== null) window.clearTimeout(licznikRef.current);
    licznikRef.current = null;
    startRef.current = null;
  }, []);

  // Licznik przeżyłby odmontowanie płótna (np. przejście na inną zakładkę w trakcie
  // przytrzymania) i otworzył menu nad czymś, czego już nie ma.
  useEffect(() => {
    return () => {
      if (licznikRef.current !== null) window.clearTimeout(licznikRef.current);
      if (echoLicznikRef.current !== null) window.clearTimeout(echoLicznikRef.current);
    };
  }, []);

  const propsy = useCallback(
    (akcja: (x: number, y: number) => void) => ({
      onTouchStart: (e: ZdarzenieDotyku) => {
        przerwij();
        otwarteRef.current = false;
        // Nowy gest znaczy, że dorobiony klik po poprzednim albo już przyszedł, albo
        // nie przyjdzie wcale — pamięć o nim przestaje cokolwiek znaczyć, a zostawiona
        // połknęłaby to dotknięcie.
        zapomnijEcho();
        // Dwa palce to szczypanie (patrz `gestDotyku.ts`), nie przytrzymanie.
        if (e.evt.touches.length !== 1) return;
        const palec = e.evt.touches[0];
        const x = palec.clientX;
        const y = palec.clientY;
        startRef.current = { x, y };
        // `cancelBubble` jak przy `onContextMenu`: menu ma dotyczyć elementu pod palcem,
        // a nie dodatkowo płótna pod nim.
        e.cancelBubble = true;
        licznikRef.current = window.setTimeout(() => {
          licznikRef.current = null;
          startRef.current = null;
          otwarteRef.current = true;
          echoRef.current = true;
          if (echoLicznikRef.current !== null) window.clearTimeout(echoLicznikRef.current);
          // Gdy `preventDefault` zadziała, dorobiony klik nie przyjdzie wcale i pamięć
          // o echu zostałaby na zawsze — połykając PRAWDZIWE kliknięcie kiedyś później.
          echoLicznikRef.current = window.setTimeout(() => {
            echoRef.current = false;
            echoLicznikRef.current = null;
          }, PAMIEC_ECHA);
          akcja(x, y);
        }, CZAS_PRZYTRZYMANIA);
      },

      onTouchMove: (e: ZdarzenieDotyku) => {
        const start = startRef.current;
        if (!start || e.evt.touches.length === 0) return;
        const palec = e.evt.touches[0];
        if (Math.hypot(palec.clientX - start.x, palec.clientY - start.y) > TOLERANCJA_RUCHU) przerwij();
      },

      onTouchEnd: (e: ZdarzenieDotyku) => {
        przerwij();
        if (!otwarteRef.current) return;
        otwarteRef.current = false;
        // Menu już stoi — przeglądarka nie ma po co dorabiać kliknięcia pod nim.
        e.evt.preventDefault();
      },
    }),
    [przerwij, zapomnijEcho]
  );

  const pochlonEchoKliku = useCallback(() => {
    if (!echoRef.current) return false;
    zapomnijEcho();
    return true;
  }, [zapomnijEcho]);

  return { propsy, pochlonEchoKliku };
}
