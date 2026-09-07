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
export function WyborObwodu({
  numerAktualny,
  uzyte,
  onWybierz,
  zablokowane,
}: {
  numerAktualny?: number;
  /** Numery obwodów już użyte w projekcie, rosnąco. */
  uzyte: number[];
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

  const nastepny = (uzyte.length ? Math.max(...uzyte) : 0) + 1;
  const klasa = (aktywny: boolean) =>
    `rounded-md border px-2 py-1 text-[12px] leading-none transition-colors ${
      aktywny ? "border-copper bg-copper/10 font-semibold text-copper" : "border-border text-slate-600 hover:border-copper hover:text-copper"
    }`;

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Numer obwodu</div>
      <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">
        <button onClick={() => onWybierz(undefined)} className={klasa(numerAktualny === undefined)} title="Obwód dobierze automat">
          auto
        </button>
        {uzyte.map((n) => (
          <button key={n} onClick={() => onWybierz(n)} className={klasa(numerAktualny === n)} title={`Dołącz do obwodu ${n}`}>
            {n}
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
