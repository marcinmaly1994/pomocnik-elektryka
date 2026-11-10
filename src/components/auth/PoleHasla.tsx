import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PoleHaslaProps {
  etykieta: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  /** Krótka informacja pod polem, np. wymagania co do długości. */
  podpowiedz?: string;
}

/**
 * Pole hasła z przyciskiem „pokaż/ukryj” — jedno dla wszystkich okien konta.
 *
 * Przycisk stoi POZA `<label>`: etykieta z dwoma elementami formularza w środku
 * wiąże się tylko z pierwszym, a czytniki ekranu i tak czytałyby oba jako jedno.
 * Jego nazwa celowo nie zawiera słowa „hasło” — inaczej wyszukanie pola po etykiecie
 * („Hasło”) trafiałoby też w przycisk.
 */
export function PoleHasla({ etykieta, value, onChange, autoComplete, podpowiedz }: PoleHaslaProps) {
  const id = useId();
  const [widoczne, setWidoczne] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-slate-500">
        {etykieta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={widoczne ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-input w-full pr-9 text-sm"
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={podpowiedz ? `${id}-podp` : undefined}
        />
        <button
          type="button"
          onClick={() => setWidoczne((w) => !w)}
          aria-label={widoczne ? "Ukryj wpisane znaki" : "Pokaż wpisane znaki"}
          aria-pressed={widoczne}
          title={widoczne ? "Ukryj" : "Pokaż"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-ink"
        >
          {widoczne ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {podpowiedz && (
        <div id={`${id}-podp`} className="mt-1 text-[11px] text-slate-500">
          {podpowiedz}
        </div>
      )}
    </div>
  );
}
