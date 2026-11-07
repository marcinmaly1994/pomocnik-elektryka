import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_TYPE_LABELS } from "@/lib/design";
import { odmianaElementu, opisSzablonu, SZABLONY } from "@/lib/szablonyPomieszczen";
import type { RoomType } from "@/types";

/**
 * Wstawienie typowego osprzętu pomieszczenia (F12 z audytu 5.11.2026) — w karcie
 * zaznaczonego pomieszczenia, bo to tam widać jego typ i to on decyduje o zestawie.
 *
 * Zawartość szablonu stoi na widoku PRZED kliknięciem: wstawienie dziesięciu symboli
 * bez zapowiedzi, co przyjdzie, to niespodzianka, którą trzeba potem sprzątać.
 */
export function SzablonPomieszczenia({
  typ,
  elementowWPokoju,
  onWstaw,
}: {
  typ: RoomType;
  elementowWPokoju: number;
  /** Wstawia szablon i zwraca, ile elementów doszło. */
  onWstaw: () => number;
}) {
  const [wstawiono, setWstawiono] = useState<number | null>(null);
  if (!SZABLONY[typ]) return null;

  return (
    <div className="space-y-1.5 border-t border-border pt-2" data-testid="szablon-pomieszczenia">
      <div className="text-xs font-semibold text-ink">Typowy osprzęt: {ROOM_TYPE_LABELS[typ].toLowerCase()}</div>
      <p className="text-xs leading-snug text-slate-600">{opisSzablonu(typ)}</p>
      {elementowWPokoju > 0 && wstawiono === null && (
        <p className="text-xs leading-snug text-[#8A5526]">
          W pomieszczeniu jest już {elementowWPokoju} {odmianaElementu(elementowWPokoju)} — szablon je uzupełni, niczego nie usunie.
        </p>
      )}
      <Button size="sm" variant="copper" className="w-full justify-center gap-1.5" onClick={() => setWstawiono(onWstaw())}>
        <LayoutTemplate size={14} /> Wstaw typowy osprzęt
      </Button>
      {wstawiono !== null && (
        <p className="text-xs leading-snug text-slate-600" role="status">
          Wstawiono {wstawiono} {odmianaElementu(wstawiono)} rozłożonych po ścianach — przesuń je na właściwe miejsca. Ctrl+Z cofa całość.
        </p>
      )}
    </div>
  );
}
