import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useSzerokieOkno, ZamknijContext } from "./pasekMenuKontekst";

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
  const przyciskRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  /**
   * Położenie panelu w oknie — liczone od przycisku, bo panel żyje w PORTALU.
   *
   * Na telefonie pasek edytora jest jednym przewijanym rzędem (`overflow-x-auto`),
   * a przewijany pojemnik przycina wszystko, co z niego wystaje — panel zawieszony
   * `absolute` pod przyciskiem byłby ucięty do wysokości paska. Portal do `body`
   * wyprowadza go spod tego przycięcia; `fixed` wewnątrz paska by nie wystarczył,
   * bo w pełnym ekranie pasek wysuwa się transformacją, a przodek z transformacją
   * zamienia `fixed` w pozycjonowanie względem siebie.
   */
  const [polozenie, setPolozenie] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!otwarte) return;
    const ustaw = () => {
      const r = przyciskRef.current?.getBoundingClientRect();
      if (!r) return;
      // Na wąskim ekranie panel (320 px) jest niemal szerokości okna — dosuwamy go
      // tak, żeby nie wyszedł za prawą krawędź.
      const width = Math.min(szerokosc, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPolozenie({ top: r.bottom + 4, left, width });
    };
    ustaw();
    // `capture`: przewija się nie tylko okno, ale i sam pasek (na telefonie).
    window.addEventListener("scroll", ustaw, true);
    window.addEventListener("resize", ustaw);
    return () => {
      window.removeEventListener("scroll", ustaw, true);
      window.removeEventListener("resize", ustaw);
    };
  }, [otwarte, szerokosc]);

  useEffect(() => {
    if (!otwarte) return;
    function naZewnatrz(e: PointerEvent) {
      const cel = e.target as HTMLElement | null;
      if (!cel || pudloRef.current?.contains(cel) || panelRef.current?.contains(cel) || cel.closest("[role='dialog']")) return;
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
        ref={przyciskRef}
        type="button"
        onClick={() => setOtwarte((v) => !v)}
        aria-expanded={otwarte}
        aria-controls={otwarte ? panelId : undefined}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-slate-600 transition-colors hover:text-copper"
      >
        {ikona}
        {/* Na telefonie sama ikona: pasek edytora jest tam jednym rzędem i przy pełnych
            etykietach cofnij/ponów i powiększenie uciekały za prawą krawędź. Nazwa
            zostaje dla czytnika ekranu (`sr-only`), więc i nazwa dostępnościowa. */}
        <span className={ikona ? "sr-only md:not-sr-only" : undefined}>{etykieta}</span>
        <ChevronDown
          size={13}
          className={`${ikona ? "hidden md:block " : ""}${otwarte ? "rotate-180 transition-transform" : "transition-transform"}`}
        />
      </button>

      {otwarte &&
        polozenie &&
        createPortal(
          <div
            ref={panelRef}
            // Znacznik dla `klawiszDlaEdytora`: dopóki panel stoi otwarty, Delete i litery
            // skrótów nie trafiają do planu pod spodem.
            data-nakladka-edytora=""
            id={panelId}
            // `z-45`: nad pełnoekranowym edytorem (`z-40` — w portalu panel nie jest
            // już jego dzieckiem), ale pod oknami dialogowymi (`z-50`), które otwiera
            // choćby „Duplikuj" z wnętrza panelu.
            className="fixed z-45 flex flex-col gap-2.5 rounded-card border border-border bg-white p-3 shadow-lg"
            style={{ top: polozenie.top, left: polozenie.left, width: polozenie.width }}
          >
            <ZamknijContext.Provider value={() => setOtwarte(false)}>{children}</ZamknijContext.Provider>
          </div>,
          document.body
        )}
    </div>
  );
}
