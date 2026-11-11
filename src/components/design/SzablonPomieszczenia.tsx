import { useState } from "react";
import { Check, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_TYPE_LABELS } from "@/lib/design";
import { odmianaElementu, opisPozycji, opisSzablonu, SZABLONY, type PozycjaSzablonu } from "@/lib/szablonyPomieszczen";
import type { RoomType } from "@/types";

/**
 * Wstawienie typowego osprzętu pomieszczenia (F12 z audytu 5.11.2026) — w karcie
 * zaznaczonego pomieszczenia, bo to tam widać jego typ i to on decyduje o zestawie.
 *
 * Zawartość szablonu stoi na widoku PRZED kliknięciem: wstawienie dziesięciu symboli
 * bez zapowiedzi, co przyjdzie, to niespodzianka, którą trzeba potem sprzątać.
 *
 * Szablon dokłada wyłącznie to, czego w pokoju brakuje (`brakujaceWSzablonie`, R2
 * z audytu Instalacji 11.11.2026) — i karta mówi dokładnie TO, a nie cały zestaw.
 * Gdy niczego nie brakuje, przycisku nie ma: drugie kliknięcie nie ma czego dołożyć.
 */
export function SzablonPomieszczenia({
  typ,
  elementowWPokoju,
  brakujace,
  onWstaw,
}: {
  typ: RoomType;
  elementowWPokoju: number;
  /** Pozycje szablonu, których w pokoju jeszcze nie ma. */
  brakujace: PozycjaSzablonu[];
  /** Wstawia brakujące elementy i zwraca, ile doszło. */
  onWstaw: () => number;
}) {
  const [wstawiono, setWstawiono] = useState<number | null>(null);
  if (!SZABLONY[typ]) return null;
  const ileBrakuje = brakujace.reduce((s, p) => s + p.ile, 0);
  const czesciowo = elementowWPokoju > 0 && ileBrakuje > 0;

  return (
    <div className="space-y-1.5 border-t border-border pt-2" data-testid="szablon-pomieszczenia">
      <div className="text-xs font-semibold text-ink">Typowy osprzęt: {ROOM_TYPE_LABELS[typ].toLowerCase()}</div>
      {ileBrakuje === 0 ? (
        wstawiono === null && (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
            <Check size={13} className="mt-px shrink-0 text-ok" />
            Pomieszczenie ma już cały typowy osprzęt ({opisSzablonu(typ)}).
          </p>
        )
      ) : (
        <>
          <p className="text-xs leading-snug text-slate-600">
            {czesciowo ? <>Brakuje: {opisPozycji(brakujace)}. To, co już stoi, zostaje.</> : opisPozycji(brakujace)}
          </p>
          <Button size="sm" variant="copper" className="w-full justify-center gap-1.5" onClick={() => setWstawiono(onWstaw())}>
            <LayoutTemplate size={14} />
            {czesciowo ? `Dołóż brakujące (${ileBrakuje})` : "Wstaw typowy osprzęt"}
          </Button>
        </>
      )}
      {wstawiono !== null && (
        <p className="text-xs leading-snug text-slate-600" role="status">
          Wstawiono {wstawiono} {odmianaElementu(wstawiono)}. Stoją przy ścianach — przesuń je na właściwe miejsca. Ctrl+Z cofa całość.
        </p>
      )}
    </div>
  );
}
