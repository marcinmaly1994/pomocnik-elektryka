import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Sposób, w jaki zawartość panelu może go ZAMKNĄĆ.
 *
 * Potrzebny dla kontrolek, które otwierają własne okno dialogowe („Duplikuj",
 * „+ Dodaj kondygnację"). Panel przeżywa otwarcie okna świadomie — inaczej
 * zamykałby się pod nim i pierwsze kliknięcie w oknie gasiłoby oba naraz — ale po
 * zamknięciu okna zostawał otwarty NAD kolumną narzędzi i przechwytywał kliknięcia
 * w bibliotekę elementów, czyli w to, co robi się zaraz po dodaniu kondygnacji.
 *
 * Domyślnie pusta funkcja, więc `FloorManagement` renderuje się poprawnie także
 * poza panelem (np. w teście jednostkowym) i nie musi wiedzieć, gdzie stoi.
 */
const ZamknijContext = createContext<() => void>(() => {});

/** Zamyka panel paska, w którym stoi wołający. Poza panelem — nic nie robi. */
export function useZamknijPasekMenu(): () => void {
  return useContext(ZamknijContext);
}

/**
 * Rozwijana grupa kontrolek w pasku edytora („Plan", „Rysunek").
 *
 * PO CO: pasek miał kilkanaście kontrolek i przy typowym oknie 1440×900 zawijał się
 * na DWA rzędy wysokie łącznie na 84 px — zjadane płótnu, na rzeczy, które ustawia
 * się raz (kondygnacje, podkład, przyciąganie, rozmiar symboli). Po schowaniu ich
 * pasek mieści się w jednym rzędzie, a rysunek dostaje te ~50 px z powrotem.
 *
 * DLACZEGO NIE `DropdownMenu` z Radiksa, którego aplikacja używa gdzie indziej:
 * to menu POLECEŃ — jego pozycje przejmują nawigację strzałkami i zamykają się po
 * wyborze. Tu w środku siedzą pola wyboru, suwak, pole liczbowe i przyciski
 * otwierające własne okna dialogowe (duplikowanie kondygnacji) — czyli formularz,
 * a nie lista poleceń. Zwykły popover zostawia tym kontrolkom ich naturalne
 * zachowanie, łącznie z tym, że panel NIE zamyka się po kliknięciu w checkbox.
 *
 * Zamyka się kliknięciem obok, Escape'em i ponownym kliknięciem w przycisk.
 * `pointerdown`, nie `click`, żeby panel zniknął już przy naciśnięciu — inaczej
 * kliknięcie w płótno pod panelem otwierało panel i stawiało element naraz.
 */
/** Czy okno jest szerokie (próg `md` z Tailwinda). Czytane z `matchMedia`, a nie
 *  klasami CSS, bo wybór ma decydować o tym, co w ogóle TRAFIA do drzewa — dwie
 *  kopie tych samych kontrolek, jedna schowana `display:none`, dałyby dwa elementy
 *  o tej samej nazwie dostępnościowej i dwa trafienia w każdym `getByRole`. */
export function useSzerokieOkno(): boolean {
  const [szerokie, setSzerokie] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const zmien = () => setSzerokie(mq.matches);
    zmien();
    mq.addEventListener("change", zmien);
    return () => mq.removeEventListener("change", zmien);
  }, []);
  return szerokie;
}

export function PasekMenu({
  etykieta,
  ikona,
  children,
  szerokosc = 300,
  rozwinNaSzerokim = false,
}: {
  etykieta: string;
  ikona?: ReactNode;
  children: ReactNode;
  /** Szerokość panelu w px — kondygnacje potrzebują więcej niż przyciąganie. */
  szerokosc?: number;
  /**
   * Od 768 px w górę pokazuje zawartość WPROST w pasku, bez przycisku i bez panelu.
   *
   * Dla grup, które na monitorze mieszczą się bez problemu i zwijanie tylko dokładałoby
   * im kliknięcie — a na telefonie są różnicą między dwoma a trzema rzędami paska.
   * Tak stoją przełączniki warstw: sześć ikon po 32 px to na monitorze nic, a na
   * ekranie 375 px cały rząd.
   */
  rozwinNaSzerokim?: boolean;
}) {
  const [otwarte, setOtwarte] = useState(false);
  const szerokieOkno = useSzerokieOkno();
  const pudloRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!otwarte) return;
    function naZewnatrz(e: PointerEvent) {
      // Okna dialogowe otwierane Z WNĘTRZA panelu (np. „Duplikuj") renderują się
      // w portalu, czyli POZA tym pudłem — bez tego wyjątku pierwsze kliknięcie
      // w takim oknie zamykałoby panel razem z nim.
      const cel = e.target as HTMLElement | null;
      if (!cel || pudloRef.current?.contains(cel) || cel.closest("[role='dialog']")) return;
      setOtwarte(false);
    }
    function naEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOtwarte(false);
    }
    window.addEventListener("pointerdown", naZewnatrz);
    window.addEventListener("keydown", naEscape);
    return () => {
      window.removeEventListener("pointerdown", naZewnatrz);
      window.removeEventListener("keydown", naEscape);
    };
  }, [otwarte]);

  if (rozwinNaSzerokim && szerokieOkno) return <>{children}</>;

  return (
    <div ref={pudloRef} className="relative">
      <button
        type="button"
        onClick={() => setOtwarte((v) => !v)}
        aria-expanded={otwarte}
        aria-controls={otwarte ? panelId : undefined}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-slate-600 transition-colors hover:text-copper"
      >
        {ikona}
        {etykieta}
        <ChevronDown size={13} className={otwarte ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {otwarte && (
        <div
          id={panelId}
          // `z-30` nad płótnem, ale POD paskami pełnego ekranu (`z-40`) i oknami
          // dialogowymi — panel ma przykrywać rysunek, nic więcej.
          className="absolute left-0 top-full z-30 mt-1 flex flex-col gap-2.5 rounded-card border border-border bg-white p-3 shadow-lg"
          style={{ width: szerokosc }}
        >
          <ZamknijContext.Provider value={() => setOtwarte(false)}>{children}</ZamknijContext.Provider>
        </div>
      )}
    </div>
  );
}
