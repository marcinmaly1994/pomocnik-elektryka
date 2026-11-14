import { ArrowRight, Pencil, RotateCw, Trash2 } from "lucide-react";
import type { Circuit, InstallationElement } from "@/types";
import { ELEMENT_TYPES, libSubtitle } from "@/lib/elements";
import { formatLiczba } from "@/lib/liczby";
import { maWlasnyObwodZDefinicji, wchodziDoObwodu } from "@/lib/panel/circuits";
import { WyborObwodu, type UzytyNumer } from "./WyborObwodu";
import { Button } from "@/components/ui/button";

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
  obwod,
  panelReczny = false,
  onPokazWRozdzielnicy,
}: {
  element: InstallationElement;
  uzyteNumery: UzytyNumer[];
  onEdytuj: () => void;
  onObroc: () => void;
  onUsun: () => void;
  onObwod: (numer: number | undefined) => void;
  /** Obwód, do którego element trafił (także przy „auto") — patrz `obwodElementu` w DesignTab. */
  obwod?: Circuit;
  /** Rozdzielnica prowadzona ręcznie: aparaty mogą się różnić od obwodów z rzutu. */
  panelReczny?: boolean;
  /** Przejście do zakładki Rozdzielnica — gdy jest dostępne. */
  onPokazWRozdzielnicy?: () => void;
}) {
  const def = ELEMENT_TYPES[element.type];
  const etykieta = def?.label ?? element.type;
  // Podpis z katalogu bywa powtórzeniem nazwy („Punkt sufitowy / punkt sufitowy") —
  // w katalogu stoi pod ikoną i nie razi, w karcie tuż pod tytułem już tak (R11).
  const podpis = libSubtitle(element.type, element.gangs);
  const wariant = podpis.toLowerCase() === etykieta.toLowerCase() ? "" : podpis;
  const przycisk = "pointer-coarse:min-h-11";
  return (
    <div className="space-y-2.5" data-testid="karta-elementu">
      <div>
        <div className="text-sm font-semibold text-ink">{etykieta}</div>
        {wariant && <div className="text-xs text-slate-500">{wariant}</div>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-400">Pomieszczenie</dt>
        <dd className="text-ink">{element.room || "bez pomieszczenia"}</dd>
        {/* Obwód, do którego element NAPRAWDĘ trafił — także przy „auto" (R6 z audytu
            Instalacji 11.11.2026). Wcześniej stało tu samo „dedykowany (AGD)", a skutek
            przypisania było widać dopiero w Rozdzielnicy. */}
        {obwod ? (
          <>
            <dt className="text-slate-400">Obwód</dt>
            <dd className="text-ink" data-testid="obwod-elementu">
              {obwod.name}
              <span className="block pe-mono text-slate-500">
                {obwod.breaker} · {obwod.cable}
              </span>
              {panelReczny && (
                <span className="block text-slate-500">Rozdzielnica jest prowadzona ręcznie — aparaty mogą się różnić.</span>
              )}
            </dd>
          </>
        ) : (
          element.dedicated && (
            <>
              <dt className="text-slate-400">Obwód</dt>
              <dd className="text-ink">dedykowany (AGD)</dd>
            </>
          )
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
            <dd className="wrap-break-word text-ink">{element.note}</dd>
          </>
        )}
      </dl>
      {obwod && onPokazWRozdzielnicy && (
        <button onClick={onPokazWRozdzielnicy} className="flex items-center gap-1 text-xs font-medium text-blueprint hover:underline pointer-coarse:min-h-8">
          Pokaż w rozdzielnicy <ArrowRight size={12} />
        </button>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="sm" onClick={onEdytuj} className={przycisk}>
          <Pencil size={13} /> Edytuj
        </Button>
        <Button variant="secondary" size="sm" onClick={onObroc} className={przycisk}>
          <RotateCw size={13} /> Obróć o 90°
        </Button>
        <Button variant="secondary" size="sm" onClick={onUsun} className={`${przycisk} text-red-600`}>
          <Trash2 size={13} /> Usuń
        </Button>
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
