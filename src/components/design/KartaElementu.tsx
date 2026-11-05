import { Pencil, RotateCw, Trash2 } from "lucide-react";
import type { InstallationElement } from "@/types";
import { ELEMENT_TYPES, libSubtitle } from "@/lib/elements";
import { formatLiczba } from "@/lib/liczby";
import { maWlasnyObwodZDefinicji, wchodziDoObwodu } from "@/lib/panel/circuits";
import { WyborObwodu, type UzytyNumer } from "./WyborObwodu";

/**
 * Właściwości ZAZNACZONEGO elementu — w panelu narzędzia „Zaznacz".
 *
 * Panel pokazuje opcje tego, czym się pracuje (patrz `NaglowekNarzedzia`), a dla
 * pojedynczego elementu nie pokazywał dotąd nic: jego dane i akcje były tylko w menu
 * pod prawym przyciskiem i w oknie edycji otwieranym dwuklikiem — czyli tam, gdzie
 * trzeba wiedzieć, że się je znajdzie. Tu stoją na wierzchu, zaraz po kliknięciu.
 *
 * Akcje są TE SAME co w menu (edycja, obrót, usunięcie, numer obwodu) i wołają te
 * same funkcje — dwie drogi do jednej czynności, nie dwie czynności.
 */
export function KartaElementu({
  element,
  uzyteNumery,
  onEdytuj,
  onObroc,
  onUsun,
  onObwod,
}: {
  element: InstallationElement;
  uzyteNumery: UzytyNumer[];
  onEdytuj: () => void;
  onObroc: () => void;
  onUsun: () => void;
  onObwod: (numer: number | undefined) => void;
}) {
  const def = ELEMENT_TYPES[element.type];
  const wariant = libSubtitle(element.type, element.gangs);
  const przycisk = "pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs [@media(pointer:coarse)]:min-h-11";
  return (
    <div className="space-y-2.5" data-testid="karta-elementu">
      <div>
        <div className="text-sm font-semibold text-ink">{def?.label ?? element.type}</div>
        {wariant && <div className="text-xs text-slate-500">{wariant}</div>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-400">Pomieszczenie</dt>
        <dd className="text-ink">{element.room || "bez pomieszczenia"}</dd>
        {element.dedicated && (
          <>
            <dt className="text-slate-400">Obwód</dt>
            <dd className="text-ink">dedykowany (AGD)</dd>
          </>
        )}
        {element.heightM !== undefined && (
          <>
            <dt className="text-slate-400">Wysokość</dt>
            <dd className="pe-mono text-ink">{formatLiczba(element.heightM, 2)} m</dd>
          </>
        )}
        {element.note && (
          <>
            <dt className="text-slate-400">Opis</dt>
            <dd className="break-words text-ink">{element.note}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={onEdytuj} className={przycisk}>
          <Pencil size={13} /> Edytuj
        </button>
        <button onClick={onObroc} className={przycisk}>
          <RotateCw size={13} /> Obróć o 90°
        </button>
        <button onClick={onUsun} className={`${przycisk} text-red-600`}>
          <Trash2 size={13} /> Usuń
        </button>
      </div>

      {/* Tylko przy odbiornikach — patrz `wchodziDoObwodu`. */}
      {wchodziDoObwodu(element) && (
      <WyborObwodu
        wariant="formularz"
        numerAktualny={element.obwod}
        uzyte={uzyteNumery}
        onWybierz={onObwod}
        zablokowane={
          maWlasnyObwodZDefinicji(element)
            ? "Ten odbiornik ma własny obwód z definicji — inny przewód i inne zabezpieczenie niż obwód wspólny."
            : undefined
        }
      />
      )}
    </div>
  );
}
