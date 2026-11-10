import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ten sam próg co `md` w Tailwindzie i `PROG_WASKIEGO_EKRANU` w lib/design.ts. */
const TELEFON = "(max-width: 767.98px)";

/**
 * Czy pokazać przyklejony pasek wyniku (B13 z audytu 4.11.2026).
 *
 * Na telefonie formularz kalkulatora jest dłuższy niż ekran, a wynik stoi POD nim —
 * w „Spadku napięcia” 700 px niżej niż pierwsze pole. Zmiana liczby u góry nie dawała
 * żadnego widocznego skutku. Pasek pokazuje się tylko wtedy, gdy:
 *  - ekran jest węższy niż 768 px,
 *  - to PIERWSZY główny blok wyniku na stronie (drugorzędne i kolejne nie dublują),
 *  - blok leży w całości PONIŻEJ dolnej krawędzi ekranu. Gdy choć trochę wjedzie
 *    w kadr — albo użytkownik przewinie za niego — pasek znika, bo wynik już widać.
 */
function usePasekWyniku(ref: RefObject<HTMLDivElement | null>, aktywny: boolean): boolean {
  const [pokaz, setPokaz] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!aktywny || !el || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(TELEFON);
    const sprawdz = () => {
      const pierwszy = document.querySelector(".pe-result:not([data-drugorzedny])");
      if (pierwszy !== el || !mq.matches) return setPokaz(false);
      setPokaz(el.getBoundingClientRect().top > window.innerHeight);
    };
    sprawdz();
    window.addEventListener("scroll", sprawdz, { passive: true });
    window.addEventListener("resize", sprawdz);
    mq.addEventListener("change", sprawdz);
    // Formularz rośnie i maleje bez przewijania (rozwinięte opcje, komunikaty walidacji),
    // a to przesuwa wynik względem ekranu.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sprawdz);
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("scroll", sprawdz);
      window.removeEventListener("resize", sprawdz);
      mq.removeEventListener("change", sprawdz);
      ro?.disconnect();
    };
  }, [ref, aktywny]);
  return pokaz;
}

/**
 * Wynik główny kalkulatora — to, po co użytkownik przyszedł, w jednej formie w każdym
 * z 19 kalkulatorów.
 *
 * Do redesignu każdy kalkulator składał blok wyniku ręcznie: podpis 12 px, wartość
 * 18 px w jednej karcie, 16 px w innej, a komunikat „bez oceny warunku” pod spodem
 * bywał WIĘKSZY od samego wyniku. Na budowie, z telefonem w wyciągniętej ręce, liczba
 * ma być pierwszą rzeczą, którą widać.
 *
 * Nic tu nie jest liczone — wartości przychodzą sformatowane, jak w `CalcResultView`.
 * Klasa `pe-result` i `data-testid` zostają na korzeniu: szukają po nich testy e2e.
 * `<dl>`, bo czytnik ekranu ma czytać parę „Przekrój żyły: 2,5 mm²”, nie dwie osobne linie.
 */
export type WartoscWyniku = {
  etykieta: string;
  /** Liczba albo krótki tekst, już sformatowany (`formatLiczba`) — komponent nic nie liczy. */
  wartosc: React.ReactNode;
  /** Jednostka mniejszym krojem obok wartości („mm²”, „A”, „Ω”). Pomiń, gdy jest częścią `wartosc`. */
  jednostka?: string;
  /**
   * `akcent` (miedź) TYLKO dla limitu albo progu — wartości, które trzeba z czymś porównać
   * (Zs max, RA max, pętla). Zwykły wynik (moc, liczba opraw) zostaje w kolorze głównym.
   */
  ton?: "glowny" | "akcent";
};

export function WynikGlowny({
  wartosci,
  children,
  className,
  "data-testid": testId,
  drugorzedny,
}: {
  wartosci: WartoscWyniku[];
  /** Znaczniki, komunikat — pod wartościami. */
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
  /** Drugi blok pod głównym: wartości 18 px niezależnie od liczby. */
  drugorzedny?: boolean;
}) {
  // Rozmiar od liczby wartości: jedna albo dwie to „bohater” ekranu, przy trzech-czterech
  // równorzędnych nie ma jednej najważniejszej, a 30 px nie mieści się w kolumnach telefonu.
  const duze = wartosci.length <= 2;
  const ref = useRef<HTMLDivElement>(null);
  const pasek = usePasekWyniku(ref, !drugorzedny && wartosci.length > 0);
  return (
    <>
    {pasek && (
      <button
        type="button"
        data-testid="pasek-wyniku"
        onClick={() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-left shadow-pop md:hidden"
      >
        {/* Najwyżej dwie pierwsze wartości — tyle mieści się w jednym wierszu telefonu. */}
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5">
          {wartosci.slice(0, 2).map(({ etykieta, wartosc, jednostka, ton }) => (
            <span key={etykieta} className="min-w-0 truncate text-sm text-slate-500">
              {etykieta}:{" "}
              <span className={cn("pe-mono font-semibold", ton === "akcent" ? "text-copper" : "text-blueprint")}>
                {wartosc}
                {jednostka && ` ${jednostka}`}
              </span>
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
          Wynik <ArrowDown size={14} aria-hidden="true" />
        </span>
      </button>
    )}
    <div ref={ref} data-testid={testId} data-drugorzedny={drugorzedny ? "" : undefined} className={cn("pe-result mt-2 p-4", className)}>
      {wartosci.length > 0 && (
        <dl
          className={cn(
            "grid gap-x-4 gap-y-3",
            wartosci.length === 1 ? "grid-cols-1" : "grid-cols-2",
            wartosci.length === 3 && "sm:grid-cols-3",
            wartosci.length >= 4 && "sm:grid-cols-4"
          )}
        >
          {wartosci.map(({ etykieta, wartosc, jednostka, ton }) => (
            <div key={etykieta} className="min-w-0">
              <dt className="text-sm text-slate-500">{etykieta}</dt>
              <dd
                className={cn(
                  "pe-mono mt-0.5 font-semibold leading-tight [overflow-wrap:anywhere]",
                  // Drugi blok pod głównym nie może z nim konkurować, więc zawsze 18 px.
                  drugorzedny ? "text-lg" : duze ? "text-2xl sm:text-3xl" : "text-xl",
                  ton === "akcent" ? "text-copper" : "text-blueprint"
                )}
              >
                {wartosc}
                {jednostka && (
                  <>
                    {" "}
                    <span className="text-base font-normal text-slate-500">{jednostka}</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className={cn(wartosci.length > 0 && "mt-3")}>{children}</div>}
    </div>
    </>
  );
}
