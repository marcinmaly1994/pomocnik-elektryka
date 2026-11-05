import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toBladPobraniaKodu, wolnoPrzeladowac } from "@/lib/bledyModulu";
import { zapiszTerazLokalnie } from "@/store/useProjectStore";
import { WERSJA_BUILDU } from "virtual:wersja-buildu";

/**
 * Ostatnia linia obrony przed BIAŁYM EKRANEM.
 *
 * React nie ma miękkiego lądowania: nieprzechwycony wyjątek w renderowaniu gasi całe
 * drzewo, więc znika nie tylko zepsute miejsce, ale i nagłówek, nawigacja i wszystko
 * inne. Użytkownik dostaje pustą stronę bez słowa wyjaśnienia — i bez pojęcia, czy
 * jego projekt jeszcze istnieje (istnieje: siedzi w `localStorage`, ale skąd ma to
 * wiedzieć). Granica błędu zamienia to na komunikat, z którego da się wyjść.
 *
 * Granice błędu MUSZĄ być klasami — nie ma dla nich odpowiednika w hookach. To jedyny
 * komponent klasowy w tym projekcie i to jest jedyny powód.
 *
 * Najczęstszą awarią jest tu nieudane pobranie kodu zakładki po wdrożeniu (patrz
 * `lib/bledyModulu.ts`) i tę leczymy sami, przeładowaniem — z zapisem projektu tuż
 * przed nim, bo przeładowanie wypada w środku okna autozapisu.
 */

interface Props {
  children: ReactNode;
  /** Co robić po „Spróbuj ponownie" — np. wrócić na zakładkę startową. */
  onReset?: () => void;
}

interface State {
  blad: unknown;
  /** Przeładowanie już zlecone: pokazujemy krótki komunikat zamiast panelu awarii,
   *  żeby przez ułamek sekundy przed przeładowaniem nie mignęło „coś poszło nie tak". */
  przeladowuje: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { blad: null, przeladowuje: false };

  static getDerivedStateFromError(blad: unknown): Partial<State> {
    return { blad };
  }

  componentDidCatch(blad: unknown, info: ErrorInfo): void {
    // Konsola zostaje NAWET przy samoczynnym leczeniu: bez tego jedyny ślad po
    // awarii ginie razem z przeładowaniem i nie ma czego zgłosić.
    console.error("Awaria widoku:", blad, info.componentStack);

    if (toBladPobraniaKodu(blad) && wolnoPrzeladowac()) {
      this.setState({ przeladowuje: true });
      // Projekt zapisujemy PRZED przeładowaniem — autozapis ma 600 ms debounce'u,
      // więc bez tego ostatnie zmiany zniknęłyby razem z kartą.
      zapiszTerazLokalnie();
      window.location.reload();
    }
  }

  render() {
    const { blad, przeladowuje } = this.state;
    if (!blad) return this.props.children;

    if (przeladowuje) {
      return (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-400">
          <RefreshCw size={16} className="animate-spin" /> Aplikacja została zaktualizowana — odświeżam…
        </div>
      );
    }

    const poWdrozeniu = toBladPobraniaKodu(blad);
    return (
      <div className="mx-auto my-10 max-w-lg rounded-card border border-border bg-white p-5">
        <div className="mb-2 flex items-center gap-2 text-warn">
          <AlertTriangle size={18} />
          <h2 className="text-base font-semibold">
            {poWdrozeniu ? "Nie udało się wczytać tej części aplikacji" : "Coś poszło nie tak"}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          {poWdrozeniu
            ? "Najczęściej znaczy to, że w międzyczasie ukazała się nowa wersja strony albo zerwało połączenie. Odświeżenie powinno wystarczyć."
            : "Ta część aplikacji się zatrzymała. Reszta działa — możesz wrócić do niej albo odświeżyć stronę."}
        </p>
        {/* Zdanie o projekcie jest tu NAJWAŻNIEJSZE. Pierwsza myśl przy takim ekranie
            brzmi „straciłem pracę", a to nieprawda: rysunek siedzi w pamięci
            przeglądarki i przeżyje zarówno odświeżenie, jak i zamknięcie karty. */}
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Twój projekt jest zapisany w tej przeglądarce i nic mu nie grozi.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              zapiszTerazLokalnie();
              window.location.reload();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-copper px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper/90"
          >
            <RefreshCw size={15} /> Odśwież stronę
          </button>
          {this.props.onReset && (
            <button
              onClick={() => {
                this.setState({ blad: null, przeladowuje: false });
                this.props.onReset?.();
              }}
              className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50"
            >
              Wróć do projektu
            </button>
          )}
        </div>
        {/* Treść błędu schowana, ale dostępna — przy zgłoszeniu problemu to jedyna
            konkretna informacja, jaką użytkownik może przekleić. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-copper">Szczegóły techniczne</summary>
          {/* Wersja wdrożenia RAZEM z treścią błędu: bez niej zgłoszenie „wyskoczył mi
              taki komunikat" nie mówi, której wersji dotyczy — a to pierwsze pytanie,
              jakie się przy nim zadaje. */}
          <pre className="pe-mono mt-1.5 whitespace-pre-wrap break-all text-xs leading-relaxed text-slate-500">
            {blad instanceof Error ? `${blad.name}: ${blad.message}` : String(blad)}
            {`\nwersja ${WERSJA_BUILDU}`}
          </pre>
        </details>
      </div>
    );
  }
}
