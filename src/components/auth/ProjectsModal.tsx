import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supaDeleteProject, supaListProjects, type CloudProjectListItem, type Session } from "@/lib/supabase";

interface ProjectsModalProps {
  open: boolean;
  session: Session;
  onClose: () => void;
  onLoad: (id: string) => void;
  busyMsg?: string;
  /** Błąd z OSTATNIEJ próby wczytania projektu (patrz `loadFromCloud` w store) —
   *  osobny od `err` niżej, który dotyczy tylko listowania projektów. */
  loadError?: string | null;
}

/** Lista projektów zapisanych w chmurze dla zalogowanego konta — wczytaj lub usuń. */
export function ProjectsModal({ open, session, onClose, onLoad, busyMsg, loadError }: ProjectsModalProps) {
  const [items, setItems] = useState<CloudProjectListItem[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setErr("");
    supaListProjects(session.token, session.user.id)
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : "Wystąpił błąd."));
  }, [open, session]);

  async function handleDelete(id: string) {
    if (!confirm("Usunąć ten projekt z chmury?")) return;
    try {
      await supaDeleteProject(session.token, id);
      setItems((its) => its?.filter((x) => x.id !== id) ?? its);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się usunąć projektu.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Moje projekty w chmurze" className="max-w-lg">
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        {loadError && <div className="mb-2 text-xs text-red-600">{loadError}</div>}
        {busyMsg && <div className="mb-2 text-xs text-slate-500">{busyMsg}</div>}
        {items === null && !err && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Wczytywanie…
          </div>
        )}
        {items?.length === 0 && <div className="text-xs text-slate-400">Brak zapisanych projektów — użyj „Zapisz w chmurze”.</div>}
        <div className="pe-scroll max-h-80 space-y-2 overflow-auto">
          {items?.map((p) => (
            <div key={p.id} className="pe-input flex items-center justify-between py-2">
              <div>
                <div className="text-sm">{p.name}</div>
                <div className="text-[11px] text-slate-400">{new Date(p.updated_at).toLocaleString("pl-PL")}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onLoad(p.id)} className="pe-btn-ghost px-2.5 py-1 text-xs">
                  Wczytaj
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-500">
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
