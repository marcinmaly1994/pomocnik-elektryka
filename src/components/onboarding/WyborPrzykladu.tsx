import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PRZYKLADY, type PrzykladId } from "@/lib/demo";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Wybór gotowego przykładu.
 *
 * Karty renderują się Z REJESTRU, a nie z listy wpisanej tutaj w JSX: trzeci przykład
 * ma być jednym plikiem i jednym wierszem w rejestrze, bez wracania do tego komponentu.
 *
 * GDZIE TO MIESZKA, JEST WARUNKIEM DZIAŁANIA, nie kwestią porządku. Renderuj to okno
 * POZA blokiem ekranu startowego w `DesignTab`: wybór przykładu wczytuje projekt, ekran
 * startowy natychmiast znika — a okno osadzone w jego bloku odmontowałoby się w połowie
 * własnej akcji. To ta sama pułapka, którą komentarz w `KompletDialog` opisuje dla
 * przełączania zakładek.
 */
export function WyborPrzykladu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const wczytajPrzyklad = useProjectStore((s) => s.wczytajPrzyklad);

  async function wybierz(id: PrzykladId) {
    onOpenChange(false);
    await wczytajPrzyklad(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `title` trafia do `DialogPrimitive.Title` w nagłówku okna (patrz `DialogContent`)
          — osobny <h2> w treści byłby duplikatem tego samego napisu. */}
      <DialogContent className="max-w-2xl" title="Który przykład otworzyć?">
        <p className="text-sm text-slate-600">
          Gotowe do oglądania — rozdzielnica, schemat i kosztorys wypełniają się z rzutu same.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRZYKLADY.map((x) => (
            <button
              key={x.id}
              onClick={() => void wybierz(x.id)}
              className="rounded-lg border border-slate-200 p-4 text-left hover:border-blueprint hover:bg-slate-50"
            >
              <span className="block font-semibold">{x.nazwa}</span>
              <span className="mt-1 block text-sm text-slate-600">{x.opis}</span>
              <span className="mt-2 block text-xs text-slate-500">{x.fakty.join(" · ")}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
