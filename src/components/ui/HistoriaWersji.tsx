import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { biezacyId } from "@/lib/projektyLokalne";
import { czytajWersje, doPrzywrocenia, usunWersje, zapiszWersje, type WersjaProjektu } from "@/lib/wersjeProjektu";

/** `localStorage` albo nic — w trybie prywatnym niektórych przeglądarek dostęp rzuca. */
function magazyn(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const dataWersji = (t: number) =>
  new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Okno „Wersje projektu" (F15 z audytu 5.11.2026): zapis migawki pod nazwą i powrót
 * do niej.
 *
 * Przywrócenie zastępuje bieżący stan i czyści historię Ctrl+Z (patrz
 * `loadProjectPayload`), więc ZANIM to zrobi, odkłada bieżący stan jako kolejną
 * wersję — pomyłkowe „Przywróć" jest wtedy odwracalne tym samym oknem.
 */
export function HistoriaWersji({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const getProjectPayload = useProjectStore((s) => s.getProjectPayload);
  const loadProjectPayload = useProjectStore((s) => s.loadProjectPayload);
  const bgImages = useProjectStore((s) => s.bgImages);

  const [nazwa, setNazwa] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [doPotwierdzenia, setDoPotwierdzenia] = useState<WersjaProjektu | null>(null);
  // Odświeżane ręcznie po każdej zmianie — lista żyje w `localStorage`, nie w stanie.
  const [, setWersjaListy] = useState(0);
  const odswiez = () => setWersjaListy((n) => n + 1);

  const m = magazyn();
  const projektId = m ? biezacyId(m) : null;
  const wersje = m && projektId ? czytajWersje(m, projektId) : [];

  function zapisz(nazwaWersji: string): boolean {
    if (!m || !projektId) return false;
    const wynik = zapiszWersje(m, projektId, nazwaWersji, getProjectPayload());
    if (!wynik.ok) {
      setBlad(wynik.powod);
      return false;
    }
    setBlad(null);
    odswiez();
    return true;
  }

  function przywroc(w: WersjaProjektu) {
    // Najpierw zabezpieczenie bieżącego stanu — bez niego przywracamy dopiero wtedy,
    // gdy użytkownik wyraźnie się na to zgodzi (brak miejsca to jedyny powód porażki).
    if (!zapisz(`Przed przywróceniem: ${w.nazwa}`)) return;
    loadProjectPayload(doPrzywrocenia(w, bgImages));
    setDoPotwierdzenia(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDoPotwierdzenia(null);
          setBlad(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent title="Wersje projektu">
        <div className="space-y-3 text-sm" data-testid="historia-wersji">
          <p className="text-slate-600">
            Zapisz stan projektu przed większą zmianą, żeby móc do niego wrócić. Wersje zostają w tej przeglądarce, bez podkładu rzutu.
          </p>
          {!projektId ? (
            <p className="text-slate-500">Projekt nie ma jeszcze zapisu w tej przeglądarce — wersje będą dostępne po pierwszej zmianie.</p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (zapisz(nazwa)) setNazwa("");
              }}
            >
              <input
                aria-label="Nazwa wersji"
                value={nazwa}
                onChange={(e) => setNazwa(e.target.value)}
                placeholder="np. przed zmianą obwodów"
                className="min-w-0 flex-1 rounded-md border border-border px-2 py-1.5"
              />
              <Button type="submit" variant="copper" size="sm" className="gap-1.5">
                <History size={14} /> Zapisz wersję
              </Button>
            </form>
          )}
          {blad && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700" role="alert">
              {blad}
            </p>
          )}

          {wersje.length === 0 ? (
            projektId && <p className="text-slate-500">Nie ma jeszcze żadnej zapisanej wersji.</p>
          ) : (
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {wersje.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="wersja-projektu">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{w.nazwa}</div>
                    <div className="text-xs text-slate-500">
                      {dataWersji(w.utworzona)} · {w.payload.draft?.elements?.length ?? 0} el.
                    </div>
                  </div>
                  {doPotwierdzenia?.id === w.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-600">Bieżący stan zapisze się jako wersja.</span>
                      <Button size="sm" variant="copper" onClick={() => przywroc(w)}>
                        Przywróć
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDoPotwierdzenia(null)}>
                        Anuluj
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDoPotwierdzenia(w)}>
                        <RotateCcw size={14} /> Przywróć…
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Usuń wersję ${w.nazwa}`}
                        onClick={() => {
                          if (m && projektId) usunWersje(m, projektId, w.id);
                          odswiez();
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
