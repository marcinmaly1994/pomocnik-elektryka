import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";

/**
 * Komunikat „przytrzymaj Ctrl", pokazywany W CHWILI POMYŁKI.
 *
 * Samo kółko nad rzutem przewija STRONĘ — i tak ma zostać, bo inaczej nie dałoby się
 * przewinąć strony, gdy kursor stoi nad planem (a płótno zajmuje pół ekranu). Skutek
 * jest jednak taki, że komuś bez nawyków z CAD-a ucieka cała strona zamiast przybliżyć
 * się rzut, i nic tego nie tłumaczy. Ten sam wzorzec i z tego samego powodu mają Mapy
 * Google.
 *
 * Świadomie NIE jest to okno dialogowe: bez przycisku, bez przechwytywania kliknięć
 * (`pointer-events-none`) i gasnące samo. Podpowiedź wyskakuje w trakcie gestu — gdyby
 * czekała na „Rozumiem", byłaby przeszkodą dokładnie wtedy, gdy ktoś próbuje pracować.
 *
 * `sygnal` to LICZNIK pomyłek, a nie `boolean`: każde kolejne kręcenie kółkiem ma
 * odświeżyć komunikat i przedłużyć jego życie, a po `boolean` drugie zgłoszenie w
 * trakcie pokazywania nie byłoby żadną zmianą stanu i nic by nie zrobiło.
 */

/** Ile komunikat zostaje na ekranie [ms]. Tyle, żeby dało się go przeczytać do końca. */
const CZAS_POKAZU = 2600;

export function PodpowiedzKolka({ sygnal }: { sygnal: number }) {
  const [widoczna, setWidoczna] = useState(false);

  useEffect(() => {
    if (sygnal === 0) return;
    setWidoczna(true);
    const id = window.setTimeout(() => setWidoczna(false), CZAS_POKAZU);
    return () => window.clearTimeout(id);
  }, [sygnal]);

  return (
    <div
      data-testid="podpowiedz-kolka"
      // `aria-live`, bo komunikat pojawia się BEZ zmiany ogniska i sam znika —
      // czytnik ekranu nie miałby innej drogi, żeby go zauważyć.
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 transition-opacity duration-zwykle ${
        widoczna ? "opacity-100" : "opacity-0"
      }`}
      // Schowany komunikat znika też dla czytnika i dla testów — sama przezroczystość
      // zostawiłaby w drzewie tekst, którego nikt nie widzi.
      hidden={!widoczna}
    >
      <div
        className="flex items-center gap-2 rounded-full px-3.5 py-2 text-xs shadow-lg"
        style={{ background: "#2B2B2Bef", color: "#FFFFFF" }}
      >
        <MousePointerClick size={14} className="shrink-0" />
        <span>
          Przytrzymaj <strong className="font-semibold">Ctrl</strong> i kręć kółkiem, żeby przybliżyć rzut
        </span>
      </div>
    </div>
  );
}
