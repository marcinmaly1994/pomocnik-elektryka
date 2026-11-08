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
    <nav
      aria-label="Kroki projektu"
      // `flex-wrap`: na 360 px dwa długie podpisy („Cofnij: Rozdzielnica” + „Dalej:
      // Kosztorys”) nie mieszczą się w jednym rzędzie i poszerzały dokument; wtedy
      // „Dalej” schodzi niżej (`ml-auto` trzyma je po prawej).
      // `-mx-6 px-6`: pasek na telefonie sięga krawędzi ekranu, bo strona ma teraz
      // `p-6` na każdej szerokości. Task 5 zmienia odstęp strony i dopasuje te klasy
      // razem z nim (wtedy `-mx-4 px-4 sm:-mx-6 sm:px-6`).
      className="sticky bottom-0 z-20 -mx-6 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/95 px-6 py-3 shadow-pop backdrop-blur-sm md:mx-0 md:rounded-card md:border md:px-4"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {poprzedni ? (
        <Button
          variant="secondary"
          className="max-md:min-h-11"
          onClick={() => onPick(poprzedni.id)}
          onPointerEnter={pobierz(poprzedni.id)}
          onFocus={pobierz(poprzedni.id)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Cofnij: {poprzedni.tytul}
        </Button>
      ) : (
        <span />
      )}
      {nastepny && (
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => onPick(nastepny.id)}
          onPointerEnter={pobierz(nastepny.id)}
          onFocus={pobierz(nastepny.id)}
        >
          Dalej: {nastepny.tytul}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
