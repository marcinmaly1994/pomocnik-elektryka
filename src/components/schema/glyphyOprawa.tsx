/** Wspólne elementy symboli: kreska schematu i oprawa, w której stoi każdy symbol. */
export const STROKE = "#16202B";
/** Wspólna grubość kreski całego schematu, dobrana do symboli użytkownika (krok 27). */
export const LINE_W = 1.1;

/** Wspólna oprawa: jedna grubość kreski, zaokrąglone końce, brak wypełnienia. */
export function GlyphGroup({ children }: { children: React.ReactNode }) {
  return (
    <g
      fill="none"
      stroke={STROKE}
      strokeWidth={LINE_W}
      vectorEffect="non-scaling-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </g>
  );
}

export function RozlacznikBezpWspolne() {
  return (
    <>
      {/* przewód od szyny do przegubu ostrza */}
      <path d="M 233.993466 37.162587 L 233.993466 322.236533" />
      {/* pierścień przegubu ostrza */}
      <circle cx={233.993466} cy={354.88138} r={32.645} />
      {/* belka styku stałego */}
      <path d="M 193.093925 322.236533 L 274.909091 322.236533" />
      {/* dwuramienne ramię łącznika, łączące przegub z korpusem wkładki */}
      <path d="M 21.277251 354.949733 L 62.176792 436.780983" />
      <path d="M 111.278758 412.238041 L 13.090909 461.323924" />
      {/* korpus wkładki topikowej — zamknięty równoległobok */}
      <path d="M 119.449017 428.594641 L 233.993466 657.68354 L 135.8217 706.769423 L 21.277251 477.680524 Z" />
      {/* wewnętrzne krawędzie korpusu wkładki */}
      <path d="M 70.363134 453.137583 L 184.907583 682.226481" />
      <path d="M 242.179808 674.04014 L 144.008042 723.142106" />
      {/* przewód wyjściowy spod wkładki */}
      <path d="M 193.093925 698.591123 L 233.993466 780.414331" />
    </>
  );
}
