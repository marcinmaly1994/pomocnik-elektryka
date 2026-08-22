import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supaDeleteProject, supaListProjects, type CloudProjectListItem, type Session } from "@/lib/supabase";
import { filtrujPoRodzaju, LIMIT_ZAPISOW, type RodzajDokumentu } from "@/lib/dokumenty";

interface ProjectsModalProps {
  open: boolean;
  session: Session;
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
}

const TEKSTY: Record<RodzajDokumentu, { tytul: string; pusto: string; usunPytanie: string }> = {
  projekt: {
    tytul: "Moje projekty w chmurze",
    pusto: "Brak zapisanych projektów — użyj „Zapisz w chmurze”.",
    usunPytanie: "Usunąć ten projekt z chmury?",
  },
  protokoly: {
    tytul: "Moje zestawy protokołów",
    pusto: "Brak zapisanych protokołów — użyj „Zapisz na koncie” w zakładce Protokoły pomiarowe.",
    usunPytanie: "Usunąć ten zestaw protokołów z chmury?",
  },
};

/** Lista dokumentów danego rodzaju zapisanych na koncie — wczytaj albo usuń. */
export function ProjectsModal({ open, session, rodzaj, onClose, onLoad, busyMsg, loadError, limitMsg }: ProjectsModalProps) {
  const [items, setItems] = useState<CloudProjectListItem[] | null>(null);
  const [err, setErr] = useState("");
  const t = TEKSTY[rodzaj];

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setErr("");
    supaListProjects(session.token, session.user.id)
      .then((all) => setItems(filtrujPoRodzaju(all, rodzaj)))
      .catch((e) => setErr(e instanceof Error ? e.message : "Wystąpił błąd."));
  }, [open, session, rodzaj]);

  async function handleDelete(id: string) {
    if (!confirm(t.usunPytanie)) return;
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
          <div className="mb-2 rounded-md p-2.5 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
            {limitMsg}
          </div>
        )}
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        {loadError && <div className="mb-2 text-xs text-red-600">{loadError}</div>}
        {busyMsg && <div className="mb-2 text-xs text-slate-500">{busyMsg}</div>}
        {items === null && !err && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Wczytywanie…
          </div>
        )}
        {items?.length === 0 && <div className="text-xs text-slate-400">{t.pusto}</div>}
        {/* Zasada nadpisywania stoi tu, a nie w osobnej pomocy: to jedyne miejsce,
            gdzie widać nazwy obok siebie, więc tutaj pytanie „co się stanie, jeśli
            zapiszę pod tą samą nazwą" pojawia się naturalnie. */}
        <div className="mb-2 text-[11px] leading-relaxed text-slate-400">
          Wykorzystano <strong className="text-slate-500">{items?.length ?? 0} z {LIMIT_ZAPISOW}</strong> miejsc.
          <br />
          Zapis pod nazwą, która już jest na liście, <strong className="text-slate-500">nadpisuje</strong> tamtą pozycję —
          nie tworzy kolejnej. Nową pozycję robi dopiero nowa nazwa.
        </div>
        <div className="pe-scroll max-h-80 space-y-2 overflow-auto">
          {items?.map((p) => (
            <div key={p.id} className="pe-input flex items-center justify-between py-2">
              <div className="min-w-0">
                <div className="truncate text-sm">{p.name}</div>
                <div className="text-[11px] text-slate-400">{new Date(p.updated_at).toLocaleString("pl-PL")}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => onLoad(p.id)} className="pe-btn-ghost px-2.5 py-1 text-xs">
                  Wczytaj
                </button>
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
      </DialogContent>
    </Dialog>
  );
}
