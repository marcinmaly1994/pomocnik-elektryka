import { useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";
import type { Zestawienie } from "@/lib/quantities";

/**
 * Zestawienie ilościowe kondygnacji — „ile czego" i „ile w którym pomieszczeniu".
 *
 * Karta pod płótnem, obok sprawdzenia rzutu: to ten sam rodzaj treści (odczyt stanu
 * rysunku, nie narzędzie do rysowania) i ma się tak samo zachowywać.
 *
 * Domyślnie ZWINIĘTA, w odróżnieniu od sprawdzenia rzutu. Tam rozwinięcie oznacza
 * „coś jest nie tak i trzeba na to spojrzeć"; tutaj nic nie wymaga reakcji, a nagłówek
 * z sumą („15 szt. w 12 punktach") odpowiada na najczęstsze pytanie bez otwierania
 * czegokolwiek.
 */

export interface QuantitiesPanelProps {
  zestawienie: Zestawienie;
}

export function QuantitiesPanel({ zestawienie }: QuantitiesPanelProps) {
  const [otwarte, setOtwarte] = useState(false);
  const { wiersze, pomieszczenia, sztukRazem, punktowRazem } = zestawienie;

  /** Sztuki i punkty rozjeżdżają się tylko przy ramkach wielokrotnych. Gdy są równe,
   *  pokazywanie obu liczb naraz to szum — wtedy jedna wystarczy. */
  const rozniSie = sztukRazem !== punktowRazem;

  return (
    <div className="pe-card mt-2">
      <button
        onClick={() => setOtwarte((o) => !o)}
        aria-expanded={otwarte}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        {otwarte ? (
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-slate-400" />
        )}
        <ListOrdered size={14} className="shrink-0 text-slate-400" />
        <span className="text-[13px] font-semibold text-ink">Zestawienie elementów</span>
        <span className="text-[11.5px] text-slate-500">
          {sztukRazem === 0
            ? "nic jeszcze nie postawiono"
            : rozniSie
              ? `${sztukRazem} szt. w ${punktowRazem} punktach`
              : `${sztukRazem} szt.`}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">{otwarte ? "zwiń" : "rozwiń"}</span>
      </button>

      {otwarte && sztukRazem > 0 && (
        <div className="grid gap-5 px-3.5 pb-3.5 sm:grid-cols-2">
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Wg rodzaju</h4>
            <table className="w-full text-[11.5px]">
              <tbody>
                {wiersze.map((w) => (
                  <tr key={w.type} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                    <td className="py-1 pr-2 text-slate-600">{w.label}</td>
                    {/* Liczba punktów w nawiasie TYLKO gdy różni się od sztuk — inaczej
                        „3 szt. (3 pkt.)" przy każdym wierszu to sam szum. */}
                    <td className="pe-mono w-20 py-1 text-right tabular-nums text-ink">
                      {w.sztuk} szt.
                      {w.sztuk !== w.punktow && <span className="text-slate-400"> ({w.punktow} pkt.)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Wg pomieszczenia</h4>
            <table className="w-full text-[11.5px]">
              <tbody>
                {pomieszczenia.map((p) => (
                  <tr key={p.room} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                    <td className="py-1 pr-2 text-slate-600">{p.room}</td>
                    <td className="pe-mono w-16 py-1 text-right tabular-nums text-ink">{p.sztuk} szt.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400 sm:col-span-2">
            Gniazdo w ramce wielokrotnej liczy się jako tyle sztuk, ile ma mechanizmów — te
            same liczby wchodzą do kosztorysu. Wyposażenie sanitarne (wanna, prysznic, umywalka)
            nie jest osprzętem elektrycznym i nie jest tu liczone.
          </p>
        </div>
      )}
    </div>
  );
}
