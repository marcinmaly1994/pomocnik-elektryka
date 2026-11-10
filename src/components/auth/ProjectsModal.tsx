import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { Cloud, Loader2, Monitor, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supaDeleteProject, supaListProjects, type CloudProjectListItem, type Session } from "@/lib/supabase";
import { filtrujPoRodzaju, LIMIT_ZAPISOW, type RodzajDokumentu } from "@/lib/dokumenty";
import type { WpisProjektu } from "@/lib/projektyLokalne";
import { Button } from "@/components/ui/button";

interface ProjectsModalProps {
  open: boolean;
  /** `null` dla niezalogowanego — okno pokazuje wtedy samą listę lokalną. */
  session: Session | null;
  /** Który rodzaj dokumentów listować — projekty instalacji czy zestawy protokołów.
   *  Oba leżą w tej samej tabeli i różnią się polem `kind` (patrz `lib/dokumenty.ts`). */
  rodzaj: RodzajDokumentu;
  onClose: () => void;
  onLoad: (id: string) => void;
  busyMsg?: string;
  /** Błąd z OSTATNIEJ próby wczytania — osobny od `err` niżej, który dotyczy
   *  wyłącznie listowania. */
  loadError?: string | null;
  /** Komunikat o przekroczonym limicie, gdy okno otwarto właśnie po to, żeby
   *  użytkownik coś usunął. */
  limitMsg?: string | null;

  /** Projekty z TEJ PRZEGLĄDARKI. Tylko dla `rodzaj === "projekt"` — zestawy
   *  protokołów nie mają odpowiednika lokalnego. */
  projektyLokalne?: WpisProjektu[];
  biezacyLokalny?: string | null;
  onOtworzLokalny?: (id: string) => void;
  onUsunLokalny?: (id: string) => void;
}

const TEKSTY: Record<RodzajDokumentu, { tytul: string; pusto: string; usunPytanie: string }> = {
  projekt: {
    tytul: "Moje projekty",
    pusto: "Brak zapisanych projektów — użyj „Zapisz w chmurze”.",
    usunPytanie: "Usunąć ten projekt z chmury?",
  },
  protokoly: {
    tytul: "Moje zestawy protokołów",
    pusto: "Brak zapisanych protokołów — użyj „Zapisz na koncie” w zakładce Protokoły pomiarowe.",
    usunPytanie: "Usunąć ten zestaw protokołów z chmury?",
  },
};

/** Nagłówek sekcji — dwa źródła projektów stoją obok siebie, więc każde musi
 *  powiedzieć o sobie, czym jest, bez czytania instrukcji. */
function NaglowekSekcji({ ikona: Ikona, children }: { ikona: typeof Cloud; children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
      <Ikona size={12} /> {children}
    </h3>
  );
}

/**
 * Lista dokumentów — z tej przeglądarki i z konta, w jednym oknie.
 *
 * Dwie listy razem, a nie dwa osobne okna, z jednego powodu: różnica między „u mnie
 * w przeglądarce" a „na koncie" jest dla laika niewidoczna, dopóki nie zobaczy obu
 * naraz. Postawione obok siebie tłumaczą się same — a przy okazji widać, że projekt
 * bez konta nie przeniesie się na inne urządzenie.
 */
export function ProjectsModal({
  open,
  session,
  rodzaj,
  onClose,
  onLoad,
  busyMsg,
  loadError,
  limitMsg,
  projektyLokalne,
  biezacyLokalny,
  onOtworzLokalny,
  onUsunLokalny,
}: ProjectsModalProps) {
  const [items, setItems] = useState<CloudProjectListItem[] | null>(null);
  const [err, setErr] = useState("");
  const t = TEKSTY[rodzaj];
  const zLokalnymi = rodzaj === "projekt" && !!projektyLokalne;

  useEffect(() => {
    if (!open || !session) return;
    setItems(null);
    setErr("");
    supaListProjects(session.token, session.user.id)
      .then((all) => setItems(filtrujPoRodzaju(all, rodzaj)))
      .catch((e) => setErr(e instanceof Error ? e.message : "Wystąpił błąd."));
  }, [open, session, rodzaj]);

  async function handleDelete(id: string) {
    if (!session || !confirm(t.usunPytanie)) return;
    try {
      await supaDeleteProject(session.token, id);
      setItems((its) => its?.filter((x) => x.id !== id) ?? its);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się usunąć.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.tytul} className="max-w-lg">
        {/* Komunikat o limicie stoi NAD listą, bo to on jest powodem otwarcia okna —
            użytkownik ma tu do wykonania konkretną decyzję, a nie przejrzeć zapisy. */}
        {limitMsg && (
          <Alert variant="caution" className="mb-2 text-xs">
            {limitMsg}
          </Alert>
        )}
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        {loadError && <div className="mb-2 text-xs text-red-600">{loadError}</div>}
        {busyMsg && <div className="mb-2 text-xs text-slate-500">{busyMsg}</div>}

        {zLokalnymi && (
          <section className="mb-4">
            <NaglowekSekcji ikona={Monitor}>W tej przeglądarce</NaglowekSekcji>
            <div className="mb-2 text-xs leading-relaxed text-slate-400">
              Wykorzystano{" "}
              <strong className="text-slate-500">
                {projektyLokalne!.length} z {LIMIT_ZAPISOW}
              </strong>{" "}
              miejsc. Te projekty żyją tylko na tym urządzeniu — wyczyszczenie danych witryny je kasuje.
            </div>
            {projektyLokalne!.length === 0 && (
              <div className="text-xs text-slate-400">Brak projektów w tej przeglądarce.</div>
            )}
            <div className="pe-scroll max-h-48 space-y-2 overflow-auto">
              {projektyLokalne!.map((p) => {
                const otwarty = p.id === biezacyLokalny;
                return (
                  <div key={p.id} className="pe-input flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {p.nazwa}
                        {otwarty && <span className="ml-2 text-xs text-copper">otwarty</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.zmieniony ? new Date(p.zmieniony).toLocaleString("pl-PL") : "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {/* Otwarty projekt nie dostaje „Wczytaj": kliknięcie nie zrobiłoby
                          nic widocznego, a przycisk, który nic nie robi, uczy nieufności. */}
                      {!otwarty && (
                        <Button variant="secondary" size="sm"
                          onClick={() => onOtworzLokalny?.(p.id)}
                        >
                          Otwórz
                        </Button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Usunąć projekt „${p.nazwa}" z tej przeglądarki? Tej operacji nie da się cofnąć.`)) {
                            onUsunLokalny?.(p.id);
                          }
                        }}
                        aria-label={`Usuń ${p.nazwa}`}
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          {zLokalnymi && <NaglowekSekcji ikona={Cloud}>Na koncie</NaglowekSekcji>}
          {!session ? (
            <div className="text-xs leading-relaxed text-slate-400">
              Załóż konto, żeby mieć projekty także na innych urządzeniach i nie stracić ich przy czyszczeniu danych
              przeglądarki.
            </div>
          ) : (
            <>
              {items === null && !err && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" /> Wczytywanie…
                </div>
              )}
              {items?.length === 0 && <div className="text-xs text-slate-400">{t.pusto}</div>}
              {/* Zasada nadpisywania stoi tu, a nie w osobnej pomocy: to jedyne miejsce,
                  gdzie widać nazwy obok siebie, więc tutaj pytanie „co się stanie, jeśli
                  zapiszę pod tą samą nazwą" pojawia się naturalnie. */}
              <div className="mb-2 text-xs leading-relaxed text-slate-400">
                Wykorzystano{" "}
                <strong className="text-slate-500">
                  {items?.length ?? 0} z {LIMIT_ZAPISOW}
                </strong>{" "}
                miejsc.
                <br />
                Zapis pod nazwą, która już jest na liście, <strong className="text-slate-500">nadpisuje</strong> tamtą
                pozycję — nie tworzy kolejnej. Nową pozycję robi dopiero nowa nazwa.
              </div>
              <div className="pe-scroll max-h-80 space-y-2 overflow-auto">
                {items?.map((p) => (
                  <div key={p.id} className="pe-input flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="text-xs text-slate-400">{new Date(p.updated_at).toLocaleString("pl-PL")}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" size="sm" onClick={() => onLoad(p.id)}>
                        Wczytaj
                      </Button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        aria-label={`Usuń ${p.name}`}
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
