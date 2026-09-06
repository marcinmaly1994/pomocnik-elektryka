import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

/** Odpowiednik `SaveIndicator` (autozapis lokalny), ale dla zapisu W CHMURZE —
 *  widoczny tylko po zalogowaniu, bo to jest właśnie ta różnica konta: bez
 *  sesji nie ma czego pokazywać, projekt i tak zapisuje się tylko lokalnie. */
export function CloudSaveIndicator({ compact = false }: { compact?: boolean }) {
  const session = useProjectStore((s) => s.session);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const lastCloudSaveAt = useProjectStore((s) => s.lastCloudSaveAt);
  const cloudSaveError = useProjectStore((s) => s.cloudSaveError);
  const konflikt = useProjectStore((s) => s.konfliktChmury);
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
  {
    /* Konflikt musi tu wygrać z godziną ostatniego zapisu. Ta godzina jest prawdziwa —
       tamten zapis się udał — ale po odłożeniu decyzji („zdecyduję później") zielone
       „Zapisano 10:42" mówiłoby, że bieżąca praca jest w chmurze, a nie jest. */
  }
  if (konflikt) {
    return (
      <span
        className="flex items-center gap-1 text-xs"
        style={{ color: "#8A5526" }}
        title={
          konflikt.rodzaj === "protokoly"
            ? "W chmurze jest nowsza wersja tego zestawu protokołów. Rozstrzygnij, którą zachować."
            : "W chmurze jest nowsza wersja tego projektu. Autozapis wstrzymany do czasu rozstrzygnięcia."
        }
      >
        <AlertTriangle size={12} /> Zmiany niezapisane — konflikt
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
