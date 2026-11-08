/**
 * Rząd „co powstanie z Twojego rzutu" — cztery miniatury etapów przepływu:
 * rzut → rozdzielnica → schemat → kosztorys.
 *
 * PO CO: ekran startowy mówił dotąd wyłącznie, co użytkownik ma ZROBIĆ („wgraj rzut
 * albo narysuj ściany"), a nigdy, co z tego BĘDZIE MIAŁ. Najmocniejsza rzecz w tej
 * aplikacji — że rozdzielnica, schemat i kosztorys wypełniają się same z rzutu — była
 * widoczna wyłącznie jako cztery wyszarzone kafle etapów u góry strony, które czyta
 * się jak nieaktywne zakładki, a nie jak zapowiedź. To jest jedyne miejsce, w którym
 * ta obietnica pada, zanim ktokolwiek cokolwiek kliknie.
 *
 * DLACZEGO RYSUNKI, A NIE ZRZUTY EKRANU: zrzut trzeba by odświeżać przy każdej zmianie
 * wyglądu tych zakładek (a nikt o tym nie pamięta), waży kilkadziesiąt razy więcej niż
 * te ścieżki i w tym rozmiarze i tak jest nieczytelną papką. Rysunek ma pokazać KSZTAŁT
 * rzeczy — że to jest tabelka, a tamto szyna z aparatami — nie jej szczegóły.
 *
 * Miniatury są `aria-hidden`: niosą dokładnie to samo, co podpisy pod nimi, więc dla
 * czytnika ekranu byłyby powtórzeniem. Cały rząd jest opisem, nie nawigacją — nic tu
 * nie jest klikalne, bo w tym momencie żaden z tych etapów nie ma jeszcze treści.
 */

const KRESKA = "#C9D3DC";
const MIEDZ = "#C1793F";
const BLEKIT = "#2D5A8C";

/** Wspólna ramka miniatury — jeden `viewBox` dla wszystkich czterech, żeby rysunki
 *  były tej samej skali i stały równo w rzędzie. */
function Miniatura({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 96 64" className="h-16 w-24" aria-hidden="true">
      <rect x="0.5" y="0.5" width="95" height="63" rx="5" fill="#fff" stroke="#E6EAEF" />
      {children}
    </svg>
  );
}

/** Rzut: obrys mieszkania z jedną ścianą działową i czterema punktami instalacyjnymi. */
function IkonaRzut() {
  return (
    <Miniatura>
      <rect x="14" y="14" width="68" height="36" fill="#F7F9FB" stroke={KRESKA} strokeWidth="2" />
      <line x1="48" y1="14" x2="48" y2="50" stroke={KRESKA} strokeWidth="2" />
      {/* Przerwa w ścianie działowej = drzwi, tym samym chwytem co na prawdziwym rzucie. */}
      <line x1="48" y1="28" x2="48" y2="38" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="3" fill={MIEDZ} />
      <circle cx="38" cy="42" r="3" fill={MIEDZ} />
      <circle cx="58" cy="24" r="3" fill={MIEDZ} />
      <circle cx="72" cy="42" r="3" fill={MIEDZ} />
    </Miniatura>
  );
}

/** Rozdzielnica: obudowa, szyna DIN i pięć aparatów na niej. */
function IkonaRozdzielnica() {
  return (
    <Miniatura>
      <rect x="18" y="14" width="60" height="36" rx="2" fill="#F7F9FB" stroke={KRESKA} strokeWidth="2" />
      <line x1="18" y1="32" x2="78" y2="32" stroke={KRESKA} strokeWidth="1.5" />
      {[24, 35, 46, 57, 68].map((x, i) => (
        <g key={x}>
          <rect x={x} y="20" width="8" height="24" rx="1.5" fill="#fff" stroke={i === 0 ? MIEDZ : KRESKA} strokeWidth="1.5" />
          {/* Dźwigienka aparatu — to ona odróżnia „szyna z bezpiecznikami" od „pasek kratek". */}
          <line x1={x + 4} y1="24" x2={x + 4} y2="29" stroke={i === 0 ? MIEDZ : BLEKIT} strokeWidth="1.5" />
        </g>
      ))}
    </Miniatura>
  );
}

/** Schemat jednokreskowy: szyna zbiorcza i trzy odejścia z aparatami. */
function IkonaSchemat() {
  return (
    <Miniatura>
      <line x1="16" y1="18" x2="80" y2="18" stroke={BLEKIT} strokeWidth="2" />
      {[26, 48, 70].map((x) => (
        <g key={x}>
          <line x1={x} y1="18" x2={x} y2="46" stroke={BLEKIT} strokeWidth="1.5" />
          <rect x={x - 5} y="26" width="10" height="10" rx="1.5" fill="#fff" stroke={BLEKIT} strokeWidth="1.5" />
          <line x1={x - 4} y1="50" x2={x + 4} y2="50" stroke={KRESKA} strokeWidth="2" />
        </g>
      ))}
    </Miniatura>
  );
}

/** Kosztorys: cztery wiersze pozycji i wyróżniona suma na dole. */
function IkonaKosztorys() {
  return (
    <Miniatura>
      {[18, 27, 36].map((y) => (
        <g key={y}>
          <rect x="16" y={y} width="34" height="4" rx="2" fill={KRESKA} />
          <rect x="62" y={y} width="18" height="4" rx="2" fill={KRESKA} />
        </g>
      ))}
      <line x1="16" y1="45" x2="80" y2="45" stroke={KRESKA} strokeWidth="1" />
      <rect x="16" y="49" width="22" height="5" rx="2.5" fill="#B9C4CE" />
      <rect x="56" y="49" width="24" height="5" rx="2.5" fill={MIEDZ} />
    </Miniatura>
  );
}

const ETAPY: { ikona: () => JSX.Element; tytul: string; opis: string }[] = [
  { ikona: IkonaRzut, tytul: "Rzut", opis: "Pokoje i osprzęt" },
  // „Dobrana sama", nie „Dobrana automatycznie" — dłuższy wariant zawijał się na dwie
  // linie i sam podpis robił się wyższy niż miniatura nad nim, przez co rząd przestawał
  // stać równo. To jest też słownictwo, którym mówi reszta aplikacji („wypełni się sama").
  { ikona: IkonaRozdzielnica, tytul: "Rozdzielnica", opis: "Dobrana sama" },
  { ikona: IkonaSchemat, tytul: "Schemat", opis: "Jednokreskowy" },
  { ikona: IkonaKosztorys, tytul: "Kosztorys", opis: "Materiał i robocizna" },
];

export function CoPowstanie() {
  return (
    <div className="w-full">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Co z tego powstanie</div>
      {/* Poniżej `sm` siatka 2 × 2 bez strzałek: cztery miniatury w jednym rzędzie wymagały
          przewijania w bok, a etapy 03–04 były wtedy poza kadrem. Kolejność zostaje czytelna
          z podpisów i z rozmieszczenia (rząd po rzędzie). Od `sm` obecny rząd ze strzałkami. */}
      <div
        role="group"
        aria-label="Co z tego powstanie — etapy"
        className="mt-3 grid grid-cols-2 justify-items-center gap-3 sm:flex sm:items-start sm:justify-center sm:gap-2"
      >
        {ETAPY.map(({ ikona: Ikona, tytul, opis }, i) => (
          <div key={tytul} className="flex items-start gap-2 sm:shrink-0">
            <div className="w-24 text-center">
              <Ikona />
              <div className="mt-1.5 text-xs font-semibold text-ink">{tytul}</div>
              <div className="text-xs leading-tight text-slate-400">{opis}</div>
            </div>
            {/* Strzałka między etapami — czysto dekoracyjna, jak w pasku etapów. */}
            {i < ETAPY.length - 1 && (
              <svg viewBox="0 0 8 14" className="mt-7 hidden h-3.5 w-2 shrink-0 sm:block" aria-hidden="true">
                <path d="M1 1 L7 7 L1 13" fill="none" stroke="#C9D3DC" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
