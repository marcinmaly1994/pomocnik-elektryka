import { AlertTriangle, Check } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { komunikatZapisu } from "@/lib/zapisLokalny";

/**
 * Wskaźnik autozapisu. Wyciągnięty z nagłówka do osobnego pliku, bo po przebudowie
 * układu mieszka w pasku stanu edytora — a `DesignTab` jest ładowany leniwie z
 * `App.tsx`, więc import z powrotem do App zrobiłby cykl.
 *
 * Nieudany zapis MUSI wygrywać z godziną ostatniego udanego. Wcześniej wyjątek
 * z `localStorage` (przepełniona pamięć przeglądarki) był połykany po cichu, więc
 * wskaźnik zamierał na starej godzinie — zielony, z ptaszkiem, twierdząc, że projekt
 * jest zapisany. Patrz `localSaveError` w store.
 */

export function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const lastLocalSaveAt = useProjectStore((s) => s.lastLocalSaveAt);
  const localSaveError = useProjectStore((s) => s.localSaveError);
  const stan = komunikatZapisu(localSaveError, lastLocalSaveAt);
  if (!stan) return null;
  const Ikona = stan.ostrzezenie ? AlertTriangle : Check;
  return (
    <span
      className={`flex items-center gap-1 text-xs ${stan.ostrzezenie ? "font-medium text-warn" : "text-emerald-700"}`}
      title={stan.tytul}
    >
      <Ikona size={12} /> {compact ? stan.krotki : stan.tekst}
    </span>
  );
}
