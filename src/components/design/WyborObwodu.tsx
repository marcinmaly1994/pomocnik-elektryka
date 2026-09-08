/**
 * Wybór numeru obwodu w menu pod prawym przyciskiem.
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
}: {
  numerAktualny?: number;
  /** Numery obwodów już użyte w CAŁYM projekcie, rosnąco. */
  uzyte: UzytyNumer[];
  onWybierz: (numer: number | undefined) => void;
  /** Wyjaśnienie, czemu wyboru nie ma — dla odbiorników z własnym obwodem. */
  zablokowane?: string;
}) {
  if (zablokowane) {
    return (
      <div className="border-t border-border px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Numer obwodu</div>
        <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-500">{zablokowane}</p>
      </div>
    );
  }

  // Następny wolny numer liczony z CAŁEGO projektu — inaczej „+ nowy" na piętrze
  // proponowałby numer zajęty na parterze i po cichu scalał dwa obwody w jeden.
  const nastepny = (uzyte.length ? Math.max(...uzyte.map((u) => u.numer)) : 0) + 1;
  const klasa = (aktywny: boolean, gdzieIndziej = false) =>
    `rounded-md border px-2 py-1 text-[12px] leading-none transition-colors ${
      aktywny
        ? "border-copper bg-copper/10 font-semibold text-copper"
        : gdzieIndziej
          ? "border-dashed border-border text-slate-400 hover:border-copper hover:text-copper"
          : "border-border text-slate-600 hover:border-copper hover:text-copper"
    }`;

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Numer obwodu</div>
      <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">
        <button onClick={() => onWybierz(undefined)} className={klasa(numerAktualny === undefined)} title="Obwód dobierze automat">
          auto
        </button>
        {uzyte.map(({ numer, gdzieIndziej }) => (
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
          className="rounded-md border border-dashed border-border px-2 py-1 text-[12px] leading-none text-slate-500 transition-colors hover:border-copper hover:text-copper"
          title={`Nowy obwód o numerze ${nastepny}`}
        >
          + {nastepny}
        </button>
      </div>
    </div>
  );
}
