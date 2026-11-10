import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

interface FieldOption {
  value: string;
  label: string;
}

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  unit?: string;
  type?: "number" | "text";
  step?: string;
  options?: FieldOption[];
  /** Podpowiedź pod przyciskiem „i" obok etykiety — co wpisać i skąd to wziąć
   *  (tabliczka znamionowa, pomiar, karta katalogowa…). Zarezerwowane dla pól, których
   *  sama etykieta i jednostka nie tłumaczą (skróty typu „uk", „Zs", „β") — nie dla
   *  rzeczy oczywistych, żeby nie zamienić formularza w ścianę dymków. */
  hint?: string;
}

/** Ikona „i" pokazująca podpowiedź PO KLIKNIĘCIU, nie po najechaniu — na dotyku (tablet,
 *  telefon) hover w ogóle nie istnieje, więc dymek na `title` byłby tam niedostępny.
 *  Zamyka się kolejnym kliknięciem ikony, kliknięciem gdziekolwiek indziej, albo Escape. */
export function HintButton({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const dymekRef = useRef<HTMLDivElement>(null);
  /**
   * Przesunięcie dymka w bok [px], żeby zmieścił się w oknie.
   *
   * Dymek stoi wyśrodkowany nad ikonką i ma 256 px — na telefonie ikonka przy krótkiej
   * etykiecie z lewej albo przy długiej z prawej wypychała go poza ekran nawet o 77 px,
   * a tekstu nie dało się doczytać (zmierzone: 23 dymki w 14 kalkulatorach).
   */
  const [przesuniecie, setPrzesuniecie] = useState(0);
  useLayoutEffect(() => {
    if (!open) {
      setPrzesuniecie(0);
      return;
    }
    const d = dymekRef.current;
    if (!d) return;
    const MARGINES = 8;
    // Pozycja bez bieżącego przesunięcia — liczona od wyśrodkowania nad ikonką.
    const r = d.getBoundingClientRect();
    const lewa = r.left - przesuniecie;
    const prawa = r.right - przesuniecie;
    const szer = document.documentElement.clientWidth;
    const dx = lewa < MARGINES ? MARGINES - lewa : prawa > szer - MARGINES ? szer - MARGINES - prawa : 0;
    if (Math.abs(dx - przesuniecie) > 0.5) setPrzesuniecie(dx);
  }, [open, przesuniecie]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          // Zatrzymane na wszelki wypadek: gdyby ten przycisk trafił kiedyś do wnętrza
          // `<label>`, klik przekazywałby fokus na powiązane pole, a tu chodzi wyłącznie
          // o dymek. Samo owijanie etykietą jest zresztą niewskazane — przycisk jest
          // elementem etykietowalnym i przejmuje powiązanie (patrz `Field` niżej).
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={open ? "Ukryj podpowiedź" : "Pokaż podpowiedź"}
        // Na dotyku pole trafienia 44 × 44 px (niewidoczne `::after` wokół ikonki) — sama
        // ikonka ma 12 px i palcem trafiało się w nią co któryś raz. Wygląd bez zmian.
        className="relative cursor-pointer text-slate-400 hover:text-blueprint after:absolute after:content-[''] [@media(pointer:coarse)]:after:-inset-4"
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          ref={dymekRef}
          role="tooltip"
          className="pe-card absolute left-1/2 top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-16px)] p-2.5 text-xs font-normal leading-relaxed text-ink shadow-lg"
          style={{ transform: `translateX(calc(-50% + ${przesuniecie}px))` }}
        >
          {hint}
        </div>
      )}
    </span>
  );
}

export function Field({ label, value, onChange, unit, type = "number", step, options, hint }: FieldProps) {
  // Powiązanie etykiety z polem JAWNIE (htmlFor/id), a nie przez owinięcie obu w
  // <label>. Owinięcie działa tylko dopóki pole jest JEDYNYM elementem etykietowalnym
  // w środku: przycisk „i" też jest etykietowalny i stoi przed inputem, więc od
  // momentu dołożenia podpowiedzi to on stawał się „kontrolką etykiety", a input
  // zostawał zupełnie bez nazwy dostępnej. Dotyczyło to każdego pola z `hint`
  // (w kalkulatorach kilkudziesięciu): czytnik ekranu czytał „edycja, pusty" zamiast
  // „Współczynnik cos φ", a testy nie potrafiły trafić w pole po jego etykiecie.
  const id = useId();
  const idJednostki = `${id}-jednostka`;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        <label htmlFor={id}>{label}</label>
        {hint && <HintButton hint={hint} />}
      </div>
      {options ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-input pe-select w-full text-base md:text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        // Jednostka W ramce pola: „15 m” czyta się jak jedna wartość, a wąski telefon nie
        // traci 56 px na osobną kolumnę z jednostką. Dla czytnika ekranu jednostka jest
        // OPISEM pola (aria-describedby), nie częścią nazwy — nazwa zostaje z etykiety.
        <div className="relative">
          <input
            id={id}
            type={type}
            step={step || "any"}
            value={value}
            onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
            aria-describedby={unit ? idJednostki : undefined}
            className={`pe-input pe-mono w-full text-base md:text-sm ${unit ? "pr-12" : ""}`}
          />
          {unit && (
            <span
              id={idJednostki}
              className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-slate-500"
            >
              {unit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
