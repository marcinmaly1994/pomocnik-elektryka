import { useEffect, useRef, useState } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import type { Step, StepId } from "@/lib/onboarding";

/**
 * Karta „Zacznij w 3 krokach" — pływająca, dokowana w prawym dolnym rogu.
 *
 * Po ukończeniu wszystkich kroków karta znika z opóźnieniem, żeby użytkownik
 * zdążył zobaczyć trzeci checkmark; zostaje dyskretny przycisk „?". Opóźnienie
 * jest pomijane przy `prefers-reduced-motion`, bo wtedy nie ma czego oglądać.
 */

export interface OnboardingChecklistProps {
  steps: Step[];
  complete: boolean;
  /** Pokazać pełną kartę (false = tylko przycisk „?"). */
  open: boolean;
  /** Wersja skrócona dla kogoś, kto przewodnik już widział. */
  compact?: boolean;
  /** Brak wgranego rzutu — krok 1 pokazuje wtedy DWIE równoległe drogi startu:
   *  wgranie rzutu albo rysowanie domu od zera (przypadek brzegowy 1). Praca bez
   *  podkładu jest możliwa, więc to propozycja wyboru, a nie warunek. */
  bezPodkladu?: boolean;
  onStepAction: (id: StepId) => void;
  /** Druga droga startu w kroku 1 (bez podkładu) — rysowanie ręczne zamiast wgrania rzutu. */
  onDrawManually: () => void;
  onSkip: () => void;
  onReopen: () => void;
  onCollapse: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const STATUS_LABEL: Record<Step["status"], string> = {
  done: "ukończony",
  active: "w trakcie",
  todo: "do zrobienia",
};

function StepIcon({ status, numer }: { status: Step["status"]; numer: number }) {
  if (status === "done") {
    return (
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: "#3B8C63" }}
      >
        <Check size={14} color="#fff" strokeWidth={3} />
      </span>
    );
  }
  const active = status === "active";
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={
        active
          ? { background: "#C1793F", color: "#fff" }
          : { background: "#EEF1F4", color: "#94A3B8", border: "1px solid #DDE3E9" }
      }
    >
      {numer}
    </span>
  );
}

export function OnboardingChecklist({
  steps,
  complete,
  open,
  compact = false,
  bezPodkladu = false,
  onStepAction,
  onDrawManually,
  onSkip,
  onReopen,
  onCollapse,
}: OnboardingChecklistProps) {
  const [leaving, setLeaving] = useState(false);

  /**
   * Poprzednia wartość `complete` — pożegnanie ma być reakcją na PRZEJŚCIE
   * „jeszcze nie skończone" → „skończone", a nie na sam stan „skończone".
   *
   * Bez tego rozróżnienia przycisk „Otwórz przewodnik" na gotowym projekcie zostawał
   * martwy nawet po poprawce w `shouldShowCard`: karta owszem wracała, ale ten sam
   * efekt zwijał ją półtorej sekundy później. Ponowne otwarcie to świadoma decyzja
   * użytkownika i ma być silniejsza od pożegnania sprzed kilku minut — zamyka się je
   * krzyżykiem, nie stoperem.
   *
   * Startuje od bieżącej wartości, więc wczytanie ukończonego projektu też nie liczy
   * się jako przejście.
   */
  const bylUkonczony = useRef(complete);

  // Ukończenie wszystkich kroków chowa kartę — z krótkim wyjściem, żeby ostatni
  // checkmark był widoczny, zanim karta odjedzie.
  useEffect(() => {
    const domkniete = complete && !bylUkonczony.current;
    bylUkonczony.current = complete;
    if (!open || !domkniete) return;
    if (prefersReducedMotion()) {
      onCollapse();
      return;
    }
    setLeaving(true);
    const t = window.setTimeout(() => {
      setLeaving(false);
      onCollapse();
    }, 1400);
    return () => window.clearTimeout(t);
  }, [complete, open, onCollapse]);

  if (!open) {
    return (
      <button
        onClick={onReopen}
        aria-label="Otwórz przewodnik: zacznij w 3 krokach"
        title="Zacznij w 3 krokach"
        className="fixed bottom-4 left-4 z-30 flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow-md transition hover:border-copper hover:text-copper"
        style={{ borderColor: "#DDE3E9" }}
      >
        <HelpCircle size={14} className="text-copper" /> Zacznij w 3 krokach
      </button>
    );
  }

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    // Pływa nad KOLUMNĄ NARZĘDZI (lewy dolny róg), a nie nad rysunkiem ani w toku
    // dokumentu. Oba pozostałe warianty były gorsze i oba to potwierdziły testami:
    //  - prawy dolny róg zasłaniał płótno i przechwytywał kliknięcia w plan,
    //  - wstawienie w kolumnę spychało bibliotekę elementów o ~200 px, przez co
    //    klik w bibliotekę przewijał stronę i wynosił płótno poza ekran.
    // Pozycja `fixed` nie zmienia układu, więc nie rusza niczego pod spodem.
    <aside
      aria-label="Przewodnik: zacznij w 3 krokach"
      className={`pe-card pe-onboarding fixed bottom-4 left-4 z-30 w-[264px] p-3.5 shadow-lg ${leaving ? "pe-onboarding-leave" : "pe-onboarding-enter"}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="pe-display text-[15px]">Zacznij w 3 krokach</h2>
        <button
          onClick={onCollapse}
          aria-label="Zwiń przewodnik"
          className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-slate-400 hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
      <p className="mb-3 text-[11.5px] leading-snug text-slate-500">
        {compact
          ? "Znasz to już — odhaczymy kroki same, gdy je wykonasz."
          : "Prowadzimy od rzutu do pierwszego gniazdka. Każdy krok możesz pominąć."}
      </p>

      <div
        className="mb-3 h-1 overflow-hidden rounded-full"
        style={{ background: "#EEF1F4" }}
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label={`Ukończono ${doneCount} z ${steps.length} kroków`}
      >
        <div
          className="pe-onboarding-bar h-full"
          style={{ width: `${(doneCount / steps.length) * 100}%`, background: "#C1793F" }}
        />
      </div>

      <ol className="space-y-2.5">
        {steps.map((rawStep) => {
          // Bez podkładu nie ma czego mierzyć — krok 1 proponuje DWIE równoległe
          // drogi startu zamiast wymuszać jedną: wgranie rzutu (zmierzy się na nim
          // odcinek o znanej długości) albo rysowanie domu od zera na czystej
          // siatce (dostaje od razu standardową skalę, patrz `onDrawManually`).
          const bezPodkladuSkala = bezPodkladu && rawStep.id === "skala" && rawStep.status !== "done";
          const s = bezPodkladuSkala
            ? {
                ...rawStep,
                tytul: "Wgraj rzut albo narysuj dom",
                opis: "Wgraj zdjęcie lub skan rzutu, żeby zmierzyć na nim odcinek o znanej długości — albo narysuj ściany od zera na czystej siatce, w gotowej standardowej skali.",
                cta: "Wgraj rzut",
              }
            : rawStep;
          return (
            <StepRow
              key={s.id}
              step={s}
              compact={compact}
              onAction={onStepAction}
              secondary={bezPodkladuSkala ? { label: "Narysuj dom samodzielnie", onClick: onDrawManually } : undefined}
            />
          );
        })}
      </ol>

      <button onClick={onSkip} className="mt-3 w-full text-[11px] text-slate-400 underline hover:text-slate-600">
        Pomiń — ustawię później
      </button>
    </aside>
  );
}

function StepRow({
  step: s,
  compact,
  onAction,
  secondary,
}: {
  step: Step;
  compact: boolean;
  onAction: (id: StepId) => void;
  /** Druga, równoległa CTA pod główną — na razie tylko krok 1 bez podkładu. */
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <li className="flex gap-2.5">
      <StepIcon status={s.status} numer={s.numer} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold" style={{ color: s.status === "done" ? "#94A3B8" : "#16202B" }}>
          {s.tytul}
          <span className="sr-only"> — {STATUS_LABEL[s.status]}</span>
        </div>
        {s.status === "active" && (
          <>
            {/* Opis tylko przy kroku AKTYWNYM — trzy akapity naraz robiły z karty
                ścianę tekstu i zasłaniały pół kolumny narzędzi. */}
            {!compact && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{s.opis}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button onClick={() => onAction(s.id)} className="pe-btn-copper px-2.5 py-1 text-[11px]">
                {s.cta}
              </button>
              {secondary && (
                <button onClick={secondary.onClick} className="pe-btn-ghost px-2.5 py-1 text-[11px]">
                  {secondary.label}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
