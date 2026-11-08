import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppTab } from "@/lib/routing";

type Krok = { id: AppTab; tytul: string };

/**
 * Dolny pasek kroku: „← Cofnij: X” i „Dalej: Y →” na Rozdzielnicy, Schemacie i Kosztorysie.
 *
 * Zastępuje pływające pigułki z rogów okna. Te leżały NA treści (szyna DIN, wiersz
 * kosztorysu, zastrzeżenie w stopce), chowały się przy przewijaniu i nie istniały
 * poniżej 768 px — czyli tam, gdzie kciuk najbardziej ich potrzebuje. Pasek stoi
 * w przepływie strony i przykleja się do dołu (`sticky`), więc niczego nie zasłania
 * na stałe, a na końcu strony ląduje NAD stopką. Ten sam wzorzec co pasek stanu
 * Instalacji z „Dalej: Rozdzielnica”.
 *
 * Nazwy przycisków są dokładnie tymi z pigułek — stoją na nich testy e2e.
 */
export function PasekKroku({
  poprzedni,
  nastepny,
  onPick,
  onPrefetch,
}: {
  poprzedni?: Krok;
  nastepny?: Krok;
  onPick: (id: AppTab) => void;
  onPrefetch?: (id: AppTab) => void;
}) {
  if (!poprzedni && !nastepny) return null;
  const pobierz = (id: AppTab) => () => onPrefetch?.(id);
  return (
    <>
    <div aria-hidden="true" className="h-6 shrink-0" />
    <nav
      aria-label="Kroki projektu"
      // Na telefonie pasek ma być JEDNYM rzędem (sticky zjada ekran): przedrostki
      // „Cofnij: ” / „Dalej: ” są tam tylko dla czytnika (`max-sm:sr-only`), widać samą
      // nazwę kroku. Nazwa dostępna i textContent zostają pełne (label-in-name).
      // Przyciski mają `min-w-0`, a nazwa `truncate`, więc przy 345 px pasek się
      // skraca zamiast zawijać.
      // `-mx-4 px-4 sm:-mx-6 sm:px-6`: pasek sięga krawędzi ekranu, więc ujemny margines
      // równa się odstępowi strony (`p-4 sm:p-6` w App.tsx). `mt-auto`: na krótkiej
      // zakładce pasek ląduje tuż nad stopką, nie w środku pustego ekranu (minimalny
      // odstęp od treści daje osobny `h-6` wyżej).
      className="sticky bottom-0 z-20 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 shadow-pop backdrop-blur-sm sm:-mx-6 sm:px-6 md:mx-0 md:rounded-card md:border md:px-4"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {poprzedni ? (
        <Button
          variant="secondary"
          className="min-w-0 max-md:min-h-11"
          onClick={() => onPick(poprzedni.id)}
          onPointerEnter={pobierz(poprzedni.id)}
          onFocus={pobierz(poprzedni.id)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="max-sm:sr-only">Cofnij:</span>{" "}
          <span className="truncate">{poprzedni.tytul}</span>
        </Button>
      ) : (
        <span />
      )}
      {nastepny && (
        <Button
          variant="primary"
          className="ml-auto min-w-0"
          onClick={() => onPick(nastepny.id)}
          onPointerEnter={pobierz(nastepny.id)}
          onFocus={pobierz(nastepny.id)}
        >
          <span className="max-sm:sr-only">Dalej:</span>{" "}
          <span className="truncate">{nastepny.tytul}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      )}
    </nav>
    </>
  );
}
