import { AlertTriangle, Check, HelpCircle } from "lucide-react";
import { KOLORY } from "@/lib/tokeny";
import { formatLiczba } from "@/lib/liczby";
import type { TrybObwodu } from "@/store/useCalculatorsStore";
import type { OcenaKryterium, StanKryterium } from "@/lib/calc/kryteriaObwodu";

/**
 * Scalony kalkulator „Dobór obwodu": przełącznik trybu i wspólna lista czterech kryteriów.
 *
 * Cztery osobne kalkulatory pytały o to samo z czterech stron — raz przekrój był
 * wynikiem, raz daną, raz chodziło o linię zasilającą, raz o komplet kryteriów.
 * Użytkownik musiał najpierw zgadnąć, w którym z nich jest jego pytanie, a wybór
 * niewłaściwego kończył się przepisywaniem tych samych danych od nowa.
 */

const TRYB_OBWODU_OPCJE: { id: TrybObwodu; label: string; opis: string }[] = [
  { id: "przekroj", label: "Szukam przekroju", opis: "znam moc lub prąd — dobierz żyłę i aparat" },
  { id: "zabezpieczenie", label: "Mam przekrój", opis: "przewód już jest — dobierz do niego zabezpieczenie" },
  { id: "wlz", label: "WLZ", opis: "linia od złącza do rozdzielnicy, ciaśniejszy budżet spadku" },
  { id: "pelny", label: "Pełny dobór", opis: "cztery kryteria naraz, także Al / XLPE / kabel w gruncie" },
];

export function PrzelacznikTrybu({ tryb, onZmien }: { tryb: TrybObwodu; onZmien: (t: TrybObwodu) => void }) {
  return (
    <div className="mb-3">
      <div role="tablist" aria-label="Tryb doboru obwodu" className="flex flex-wrap gap-1.5">
        {TRYB_OBWODU_OPCJE.map((o) => {
          const aktywny = o.id === tryb;
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={aktywny}
              onClick={() => onZmien(o.id)}
              title={o.opis}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                aktywny ? "border-copper bg-copper-tlo text-caution" : "border-[#E6EAEF] bg-white text-slate-500"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{TRYB_OBWODU_OPCJE.find((o) => o.id === tryb)?.opis}</p>
    </div>
  );
}

const STYL_STANU: Record<StanKryterium, { tlo: string; kolor: string }> = {
  ok: { tlo: KOLORY.successTlo, kolor: KOLORY.success },
  blad: { tlo: KOLORY.dangerTlo, kolor: KOLORY.danger },
  nieoceniono: { tlo: "#EEF1F4", kolor: "#4F5D73" },
};

/**
 * Cztery kryteria z werdyktem przy każdym.
 *
 * Kryterium bez danych ma własny, trzeci stan — „nieocenione". Zielony ptaszek przy
 * warunku, którego nikt nie sprawdził, jest gorszy niż jego brak, a dwa ostatnie
 * kryteria wymagają liczb, których dobór nie ma skąd wziąć sam.
 */
export function KryteriaObwodu({ oceny }: { oceny: OcenaKryterium[] }) {
  return (
    <div className="space-y-1.5">
      {oceny.map((o) => {
        const styl = STYL_STANU[o.stan];
        const Ikona = o.stan === "ok" ? Check : o.stan === "blad" ? AlertTriangle : HelpCircle;
        return (
          <div
            key={o.kryterium}
            className="flex items-start gap-2 rounded-lg p-2.5 text-sm"
            style={{ background: styl.tlo, color: styl.kolor }}
          >
            <Ikona size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{o.etykieta}</div>
              <div className="opacity-90">{o.opis}</div>
            </div>
            {o.stan !== "nieoceniono" && typeof o.margines_pct === "number" && (
              <span className="pe-mono shrink-0 text-xs tabular-nums opacity-80">
                {o.margines_pct >= 0 ? "zapas " : "przekroczenie "}
                {formatLiczba(Math.abs(o.margines_pct), 0)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
