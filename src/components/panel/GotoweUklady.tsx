import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useWczytajUklad } from "@/hooks/useWczytajUklad";
import { modulySzablonu, SZABLONY_ROZDZIELNIC, type SzablonRozdzielnicy } from "@/lib/panel/szablonyRozdzielnic";

/** Lista układów jako karty — na pustym ekranie rozdzielnicy i w oknie wyboru. */
export function ListaUkladow({ onWybierz }: { onWybierz: (s: SzablonRozdzielnicy) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="gotowe-uklady">
      {SZABLONY_ROZDZIELNIC.map((s) => {
        const moduly = modulySzablonu(s);
        const rzedy = Math.ceil(moduly / s.config.perRow);
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onWybierz(s)}
              className="h-full w-full rounded-card border border-border bg-white p-3 text-left transition-colors hover:border-copper hover:bg-[#FDF6EF]"
            >
              <div className="text-sm font-semibold text-ink">{s.nazwa}</div>
              <div className="mt-0.5 text-xs leading-snug text-slate-600">{s.opis}</div>
              <div className="mt-1.5 font-mono text-xs text-slate-400">
                {moduly} mod. · {rzedy} × {s.config.perRow}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Przycisk „Gotowe układy…" z oknem wyboru — przy ustawieniach rozdzielnicy. */
export function GotoweUkladyPrzycisk({ maAparaty }: { maAparaty: boolean }) {
  const [otwarte, setOtwarte] = useState(false);
  const wczytaj = useWczytajUklad();
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOtwarte(true)}>
        <LayoutTemplate size={14} /> Gotowe układy…
      </Button>
      <Dialog open={otwarte} onOpenChange={setOtwarte}>
        <DialogContent title="Gotowe układy rozdzielnic">
          <p className="mb-3 text-sm text-slate-600">
            Typowy układ jako punkt wyjścia — nastawy, opisy i obwody poprawisz potem jak przy składaniu ręcznym.
            {maAparaty && " Zastąpi bieżące aparaty; „Cofnij” przy ustawieniach rozdzielnicy je przywróci."}
          </p>
          <ListaUkladow
            onWybierz={(s) => {
              wczytaj(s);
              setOtwarte(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
