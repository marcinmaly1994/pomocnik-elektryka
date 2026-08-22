import { Check } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Wskaźnik autozapisu. Wyciągnięty z nagłówka do osobnego pliku, bo po przebudowie
 * układu mieszka w pasku stanu edytora — a `DesignTab` jest ładowany leniwie z
 * `App.tsx`, więc import z powrotem do App zrobiłby cykl.
 */
export function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const lastLocalSaveAt = useProjectStore((s) => s.lastLocalSaveAt);
  if (!lastLocalSaveAt) return null;
  const time = new Date(lastLocalSaveAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="flex items-center gap-1 text-xs text-emerald-600"
      title={`Projekt zapisuje się automatycznie w tej przeglądarce — ostatnio o ${time}`}
    >
      <Check size={12} /> {compact ? "Zapisano" : `Zapisano lokalnie ${time}`}
    </span>
  );
}
