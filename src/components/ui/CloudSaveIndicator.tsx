import { Check, CloudOff, Loader2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

/** Odpowiednik `SaveIndicator` (autozapis lokalny), ale dla zapisu W CHMURZE —
 *  widoczny tylko po zalogowaniu, bo to jest właśnie ta różnica konta: bez
 *  sesji nie ma czego pokazywać, projekt i tak zapisuje się tylko lokalnie. */
export function CloudSaveIndicator({ compact = false }: { compact?: boolean }) {
  const session = useProjectStore((s) => s.session);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const lastCloudSaveAt = useProjectStore((s) => s.lastCloudSaveAt);
  const cloudSaveError = useProjectStore((s) => s.cloudSaveError);
  if (!session) return null;

  if (cloudBusy) {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Zapisywanie w chmurze…
      </span>
    );
  }
  if (cloudSaveError) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600" title={cloudSaveError}>
        <CloudOff size={12} /> Nie udało się zapisać w chmurze
      </span>
    );
  }
  if (!lastCloudSaveAt) return null;
  const time = new Date(lastCloudSaveAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="flex items-center gap-1 text-xs text-emerald-600"
      title={`Projekt zapisuje się automatycznie w chmurze — dostępny z każdego urządzenia po zalogowaniu. Ostatnio o ${time}`}
    >
      <Check size={12} /> {compact ? "Zapisano" : `Zapisano ${time}`}
    </span>
  );
}
