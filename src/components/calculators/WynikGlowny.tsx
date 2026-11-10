import { cn } from "@/lib/utils";

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
  return (
    <div data-testid={testId} data-drugorzedny={drugorzedny ? "" : undefined} className={cn("pe-result mt-2 p-4", className)}>
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
  );
}
