import { useEffect, useRef, useState } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import type { Step, StepId } from "@/lib/onboarding";

/**
 * Karta „Zacznij w 3 krokach" — pływająca, dokowana w LEWYM dolnym rogu, nad kolumną
 * narzędzi. Pokazuje wyłącznie krok aktywny; pozostałe są w kropkach przy tytule.
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
  /**
   * Górna krawędź tego, co karta zajmuje na dole ekranu (pełna karta albo sam zwinięty
   * przycisk) — w pikselach okna.
   *
   * Raportowana na zewnątrz, bo karta pływa NAD kolumną narzędzi i to kolumna kończy
   * listę elementów nad tą linią (patrz `goraKarty` w ElementLibrary). Wysokość karty
   * zmienia się z krokiem przewodnika, więc granicy nie da się wpisać na sztywno.
   */
  onGora?: (y: number | null) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const STATUS_LABEL: Record<Step["status"], string> = {
  done: "ukończony",
  active: "w trakcie",
  todo: "do zrobienia",
};

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
  onGora,
}: OnboardingChecklistProps) {
  const [leaving, setLeaving] = useState(false);

  /** Mierzony jest ten węzeł, który akurat stoi na ekranie — pełna karta albo
   *  zwinięty przycisk. Oba pływają w tym samym rogu i oba coś przykrywają. */
  const pudloRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!onGora) return;
    // `null`, gdy karta jest zwinieta do samego przycisku: ten zajmuje ~28 px przy samej
    // krawedzi i nie ma sensu, zeby kolumna cokolwiek mu oddawala.
    const zmierz = () => onGora(open ? (pudloRef.current?.getBoundingClientRect().top ?? window.innerHeight) : null);
    zmierz();
    window.addEventListener("resize", zmierz);
    // Wysokość zmienia się przy KAŻDEJ zmianie kroku (opis widać tylko przy aktywnym),
    // więc obserwator jest tu tańszy i pewniejszy niż lista zależności.
    const ro = typeof ResizeObserver !== "undefined" && pudloRef.current ? new ResizeObserver(zmierz) : null;
    if (ro && pudloRef.current) ro.observe(pudloRef.current);
    return () => {
      window.removeEventListener("resize", zmierz);
      ro?.disconnect();
    };
  }, [onGora, open]);

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
        ref={pudloRef as React.RefObject<HTMLButtonElement>}
        onClick={onReopen}
        aria-label="Otwórz przewodnik: zacznij w 3 krokach"
        title="Zacznij w 3 krokach"
        // Na telefonie w ZWYKŁYM PRZEPŁYWIE, pod edytorem; od 768 px — przypięty w rogu.
        // Przypięty w lewym dolnym rogu telefonu leżał na pasku stanu edytora, który
        // po przewinięciu do rysunku stoi właśnie przy dolnej krawędzi ekranu — na
        // „Zapisano", tuż obok „Dalej". Na monitorze róg jest wolny (kolumna narzędzi).
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow-md transition hover:border-copper hover:text-copper md:fixed md:bottom-4 md:left-4 md:z-30 md:mt-0 md:flex"
        style={{ borderColor: "#DDE3E9" }}
      >
        <HelpCircle size={14} className="text-copper" /> Zacznij w 3 krokach
      </button>
    );
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const rawAktywny = steps.find((s) => s.status === "active");

  // Bez podkładu nie ma czego mierzyć — krok 1 proponuje DWIE równoległe drogi startu
  // zamiast wymuszać jedną: wgranie rzutu (zmierzy się na nim odcinek o znanej
  // długości) albo rysowanie domu od zera na czystej siatce (dostaje od razu
  // standardową skalę, patrz `onDrawManually`).
  const bezPodkladuSkala = bezPodkladu && rawAktywny?.id === "skala";
  const aktywny =
    rawAktywny && bezPodkladuSkala
      ? {
          ...rawAktywny,
          tytul: "Wgraj rzut albo narysuj dom",
          opis: "Wgraj zdjęcie lub skan rzutu, żeby zmierzyć na nim odcinek o znanej długości — albo narysuj ściany od zera na czystej siatce, w gotowej standardowej skali.",
          cta: "Wgraj rzut",
        }
      : rawAktywny;

  return (
    // Pływa nad KOLUMNĄ NARZĘDZI (lewy dolny róg), a nie nad rysunkiem ani w toku
    // dokumentu. Oba pozostałe warianty były gorsze i oba to potwierdziły testami:
    //  - prawy dolny róg zasłaniał płótno i przechwytywał kliknięcia w plan,
    //  - wstawienie w kolumnę spychało bibliotekę elementów o ~200 px, przez co
    //    klik w bibliotekę przewijał stronę i wynosił płótno poza ekran.
    // Pozycja `fixed` nie zmienia układu, więc nie rusza niczego pod spodem.
    <aside
      ref={pudloRef as React.RefObject<HTMLElement>}
      aria-label="Przewodnik: zacznij w 3 krokach"
      // Na telefonie w ZWYKŁYM PRZEPŁYWIE, pod edytorem — tak jak zwinięty przycisk
      // wyżej. Przypięta w lewym dolnym rogu zasłaniała tam dół rzutu, pasek stanu
      // i nakładkę kontrolek rysowania, a z nią „Zakończ" ściany.
      className={`pe-card pe-onboarding mt-4 w-full max-w-sm p-3 shadow-lg md:fixed md:bottom-4 md:left-4 md:z-30 md:mt-0 md:w-[264px] ${leaving ? "pe-onboarding-leave" : "pe-onboarding-enter"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="pe-display text-[14px]">Zacznij w 3 krokach</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Kropki steps={steps} doneCount={doneCount} />
          <button onClick={onCollapse} aria-label="Zwiń przewodnik" className="-mr-1 rounded p-0.5 text-slate-400 hover:text-ink">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tylko krok AKTYWNY. Trzy kroki naraz, każdy z tytułem, plus akapit
          wprowadzenia i pasek postępu dawały kartę wysoką na ~308 px — a kolumna
          narzędzi pod nią ma na typowym laptopie ledwie ~430 px widocznej wysokości,
          więc karta zjadała jej trzy czwarte. Kroki zrobione i te przed nami są
          widoczne w kropkach obok tytułu; nazwa kroku, który trzeba wykonać TERAZ,
          i tak była jedyną, którą się czyta. */}
      {aktywny ? (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Krok {aktywny.numer} z {steps.length}
          </div>
          <div className="text-xs font-semibold text-ink">{aktywny.tytul}</div>
          {!compact && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{aktywny.opis}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button onClick={() => onStepAction(aktywny.id)} className="pe-btn-copper px-2.5 py-1 text-[11px]">
              {aktywny.cta}
            </button>
            {bezPodkladuSkala && (
              <button onClick={onDrawManually} className="pe-btn-ghost px-2.5 py-1 text-[11px]">
                Narysuj dom samodzielnie
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Komplet kroków. Karta normalnie sama się wtedy chowa, ale wraca na żądanie
           przyciskiem „Otwórz przewodnik" — i wtedy MUSI mieć co pokazać. */
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Wszystkie trzy kroki za Tobą. Reszta aplikacji — rozdzielnica, schemat, kosztorys — liczy się już
          z tego, co postawisz na rzucie.
        </p>
      )}

      <button onClick={onSkip} className="mt-2.5 w-full text-[11px] text-slate-400 underline hover:text-slate-600">
        Pomiń — ustawię później
      </button>
    </aside>
  );
}

/** Postęp jako trzy kropki przy tytule — zastąpiły pasek i pełną listę kroków.
 *  Kropka ukończonego kroku dostaje ptaszka, więc „trzeci checkmark", na który
 *  czeka animacja pożegnalna, nadal jest co zobaczyć. */
function Kropki({ steps, doneCount }: { steps: Step[]; doneCount: number }) {
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuenow={doneCount}
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-label={`Ukończono ${doneCount} z ${steps.length} kroków`}
    >
      {steps.map((s) => (
        <span
          key={s.id}
          title={`${s.numer}. ${s.tytul} — ${STATUS_LABEL[s.status]}`}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
          style={
            s.status === "done"
              ? { background: "#3B8C63" }
              : s.status === "active"
                ? { background: "#9A5A27" }
                : { background: "#EEF1F4", border: "1px solid #DDE3E9" }
          }
        >
          {s.status === "done" && <Check size={9} color="#fff" strokeWidth={3.5} aria-hidden />}
        </span>
      ))}
    </div>
  );
}
