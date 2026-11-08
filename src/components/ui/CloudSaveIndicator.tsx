import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

/** Odpowiednik `SaveIndicator` (autozapis lokalny), ale dla zapisu W CHMURZE —
 *  widoczny tylko po zalogowaniu, bo to jest właśnie ta różnica konta: bez
 *  sesji nie ma czego pokazywać, projekt i tak zapisuje się tylko lokalnie. */
export function CloudSaveIndicator() {
  // RUTYNOWY napis („Zapisano 10:42”, „Zapisywanie…”) jest poniżej 640 px schowany
  // wizualnie (nie usunięty): obok logo, konta i „Menu” zawijał nagłówek na drugi rząd,
  // a to stan, o którym nie trzeba co chwilę czytać. Zostaje ikona w kolorze stanu,
  // a pełny opis w `title` i dla czytników.
  const etykieta = (tekst: string) => <span className="max-sm:sr-only">{tekst}</span>;
  // BŁĄD i KONFLIKT to co innego: tu praca NIE jest w chmurze, a sama ikonka 12 px łatwo
  // umyka. Na telefonie zostaje więc krótkie, widoczne słowo (nagłówek może się wtedy
  // zawinąć — to rzadki stan, w którym właśnie trzeba zwrócić uwagę), a czytnik dostaje
  // pełne zdanie zamiast skrótu.
  const etykietaPilna = (krotko: string, pelny: string) => (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {krotko}
      </span>
      <span className="max-sm:sr-only">{pelny}</span>
    </>
  );
  const session = useProjectStore((s) => s.session);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const lastCloudSaveAt = useProjectStore((s) => s.lastCloudSaveAt);
  const cloudSaveError = useProjectStore((s) => s.cloudSaveError);
  const konflikt = useProjectStore((s) => s.konfliktChmury);
  if (!session) return null;

  if (cloudBusy) {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500" title="Zapisywanie w chmurze…">
        <Loader2 size={12} className="animate-spin" /> {etykieta("Zapisywanie w chmurze…")}
      </span>
    );
  }
  if (cloudSaveError) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600" title={cloudSaveError}>
        <CloudOff size={12} /> {etykietaPilna("Błąd zapisu", "Nie udało się zapisać w chmurze")}
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
        <AlertTriangle size={12} /> {etykietaPilna("Konflikt", "Zmiany niezapisane — konflikt")}
      </span>
    );
  }
  if (!lastCloudSaveAt) return null;
  const time = new Date(lastCloudSaveAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="flex items-center gap-1 text-xs text-emerald-700"
      title={`Projekt zapisuje się automatycznie w chmurze — dostępny z każdego urządzenia po zalogowaniu. Ostatnio o ${time}`}
    >
      <Check size={12} /> {etykieta(`Zapisano ${time}`)}
    </span>
  );
}
