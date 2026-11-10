import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * Lekki popover ze strzałką, przypięty pod wskazanym elementem paska narzędzi.
 *
 * Celowo NIE jest modalem i nie ma focus trapu: ma podpowiadać, gdzie kliknąć,
 * a nie odbierać kontrolę nad aplikacją. Specyfikacja mówi wprost, żeby nigdy nie
 * blokować ekranu czymś, czego nie da się zamknąć — więc znika po Escape, po
 * kliknięciu „Rozumiem" i po kliknięciu w samo narzędzie.
 */

export interface CoachMarkProps {
  /** Element, pod którym ma stanąć dymek. Gdy brak — nic nie renderujemy. */
  anchor: HTMLElement | null;
  text: string;
  onDismiss: () => void;
  /** Etykieta przycisku zamykającego. */
  dismissLabel?: string;
}

export function CoachMark({ anchor, text, onDismiss, dismissLabel = "Rozumiem" }: CoachMarkProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();

  /**
   * Pasek narzędzi jest PIONOWY, więc dymek staje obok narzędzia, a nie pod nim:
   * pod szóstą pozycją paska nie ma już miejsca i popover wychodził poza dolną
   * krawędź okna — przycisk „Rozumiem" stawał się nieklikalny. Gdy z prawej też
   * brakuje miejsca (wąskie okno), wracamy pod spód. Obie współrzędne są przycięte
   * do widocznego obszaru, żeby dymek nigdy nie wyjechał poza ekran.
   */
  const W = 280;
  const H = 132; // przybliżona wysokość — wystarcza do przycięcia
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 12;

  const besideFits = r.right + GAP + W + GAP <= vw;
  const left = besideFits ? r.right + GAP : Math.max(GAP, Math.min(r.left, vw - W - GAP));
  const top = besideFits
    ? Math.max(GAP, Math.min(r.top - 6, vh - H - GAP))
    : Math.max(GAP, Math.min(r.bottom + 10, vh - H - GAP));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Podpowiedź"
      className="pe-coach fixed z-50 rounded-card border bg-white p-3 shadow-lg"
      style={{ top, left, width: W, borderColor: "#C1793F" }}
    >
      {/* strzałka do narzędzia — z lewej krawędzi przy ułożeniu obok, z góry pod spodem */}
      <div
        aria-hidden
        className="absolute h-3 w-3 rotate-45 border-l border-t bg-white"
        style={
          besideFits
            ? { left: -7, top: Math.max(10, Math.min(r.top + r.height / 2 - top - 6, H - 26)), borderColor: "#C1793F" }
            : { top: -7, left: 22, borderColor: "#C1793F" }
        }
      />
      <p className="mb-2.5 text-xs leading-relaxed text-ink">{text}</p>
      <Button variant="primary" size="sm" onClick={onDismiss} className="w-full" autoFocus>
        {dismissLabel}
      </Button>
    </div>
  );
}
