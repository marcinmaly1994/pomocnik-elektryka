/**
 * Wybór numeru obwodu — w menu pod prawym przyciskiem I w oknie edycji elementu
 * (dwuklik). Jeden komponent na obie drogi, żeby nie rozjechały się w tym, co
 * pokazują: różni je tylko oprawa, patrz `wariant`.
 *
 * Numery są POWTARZALNE i wspólne dla projektu — po to, żeby dało się dołożyć
 * kolejne gniazdo do obwodu, który już istnieje. Dlatego menu pokazuje numery
 * użyte gdziekolwiek na planie, a nie samo pole do wpisania: bez tej listy
 * dopisanie do „obwodu 3" wymagałoby pamiętania, że taki numer w ogóle jest.
 *
 * „Auto" to stan domyślny, nie zerowanie: obwód policzy wtedy `computeCircuits`
 * tak jak dotąd. Musi być widoczny obok numerów, bo bez drogi powrotnej ręczne
 * przypisanie byłoby decyzją nieodwracalną inaczej niż przez cofanie.
 */
export interface UzytyNumer {
  numer: number;
  /**
   * Numer istnieje w projekcie, ale NIE na oglądanej kondygnacji.
   *
   * Wybranie go dołączy punkt do obwodu z innego piętra — co bywa zamierzone (jeden
   * pion), ale nie może zdarzyć się przypadkiem. Stąd osobne oznaczenie zamiast
   * milczącego scalenia albo ukrycia takiego numeru.
   */
  gdzieIndziej: boolean;
}

export function WyborObwodu({
  numerAktualny,
  uzyte,
  onWybierz,
  zablokowane,
  wariant = "menu",
}: {
  numerAktualny?: number;
  /** Numery obwodów już użyte w CAŁYM projekcie, rosnąco. */
  uzyte: UzytyNumer[];
  onWybierz: (numer: number | undefined) => void;
  /** Wyjaśnienie, czemu wyboru nie ma — dla odbiorników z własnym obwodem. */
  zablokowane?: string;
  /**
   * Gdzie ten wybór stoi. `menu` to wąska kolumna pod prawym przyciskiem — stąd
   * własne wcięcie i ograniczenie szerokości. `formularz` to okno edycji elementu,
   * gdzie pola mają wspólną krawędź lewą i całą szerokość okna do dyspozycji;
   * tamto wcięcie odsadziłoby ten jeden wiersz od reszty formularza.
   */
  wariant?: "menu" | "formularz";
}) {
  const wMenu = wariant === "menu";
  const otoczka = wMenu ? "border-t border-border px-3 py-2" : "border-t border-border pt-3";
  const szerokosc = wMenu ? "max-w-[220px]" : "";

  if (zablokowane) {
    return (
      <div className={otoczka}>
        <div className="text-xs font-semibold text-slate-500">Numer obwodu</div>
        <p className={`mt-1 text-xs leading-relaxed text-slate-500 ${szerokosc}`}>{zablokowane}</p>
      </div>
    );
  }

  /**
   * Numer WYBRANY, ale jeszcze nieistniejący w projekcie (świeże „+ N"), dostaje
   * własny chip.
   *
   * Lista `uzyte` pochodzi z zapisanych elementów, więc zaraz po kliknięciu „+ 3"
   * numeru 3 jeszcze na niej nie ma. W menu pod prawym przyciskiem nie miało to
   * znaczenia — wybór zamyka je natychmiast — ale w formularzu okno zostaje otwarte
   * i bez tego chipa nie widać, co się właściwie zapisze.
   */
  const doPokazania =
    numerAktualny === undefined || uzyte.some((u) => u.numer === numerAktualny)
      ? uzyte
      : [...uzyte, { numer: numerAktualny, gdzieIndziej: false }].sort((a, b) => a.numer - b.numer);

  // Następny wolny numer liczony z CAŁEGO projektu — inaczej „+ nowy" na piętrze
  // proponowałby numer zajęty na parterze i po cichu scalał dwa obwody w jeden.
  const nastepny = (doPokazania.length ? Math.max(...doPokazania.map((u) => u.numer)) : 0) + 1;
  const klasa = (aktywny: boolean, gdzieIndziej = false) =>
    `rounded-md border px-2 py-1 text-xs leading-none transition-colors ${
      aktywny
        ? "border-copper bg-copper/10 font-semibold text-copper"
        : gdzieIndziej
          ? "border-dashed border-border text-slate-400 hover:border-copper hover:text-copper"
          : "border-border text-slate-600 hover:border-copper hover:text-copper"
    }`;

  return (
    <div className={otoczka}>
      <div className="text-xs font-semibold text-slate-500">Numer obwodu</div>
      <div className={`mt-1.5 flex flex-wrap gap-1 ${szerokosc}`}>
        <button onClick={() => onWybierz(undefined)} className={klasa(numerAktualny === undefined)} title="Obwód dobierze automat">
          auto
        </button>
        {doPokazania.map(({ numer, gdzieIndziej }) => (
          <button
            key={numer}
            onClick={() => onWybierz(numer)}
            className={klasa(numerAktualny === numer, gdzieIndziej)}
            title={
              gdzieIndziej
                ? `Dołącz do obwodu ${numer} — ten obwód jest na innej kondygnacji`
                : `Dołącz do obwodu ${numer}`
            }
          >
            {numer}
            {/* Kropka przy numerze z innego piętra: wybór ma być świadomy, a nie
                niespodzianką po zajrzeniu do rozdzielnicy. */}
            {gdzieIndziej && <span aria-hidden="true"> ·</span>}
          </button>
        ))}
        <button
          onClick={() => onWybierz(nastepny)}
          className="rounded-md border border-dashed border-border px-2 py-1 text-xs leading-none text-slate-500 transition-colors hover:border-copper hover:text-copper"
          title={`Nowy obwód o numerze ${nastepny}`}
        >
          + {nastepny}
        </button>
      </div>
    </div>
  );
}
