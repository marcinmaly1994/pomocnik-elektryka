import { useState } from "react";
import { Menu } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Menu nagłówka na telefonie (poniżej 768 px): Kalkulatory, Protokoły, Dokumentacja,
 * Pomoc i Nowy projekt w arkuszu z prawej, zamiast paska przewijanego w bok.
 *
 * Pasek przewijany ucinał etykiety w pół słowa („Protokoły pomiarow”), a o tym, że
 * jest dalej coś jeszcze, mówiło tylko wygaszenie krawędzi. W arkuszu każda pozycja
 * jest pełna, ma 44 px wysokości i stoi pod kciukiem. Wybór pozycji zamyka arkusz —
 * nawigacja ma przenieść, nie zostawić użytkownika w menu.
 */
export function MenuTelefonu({ children }: { children: React.ReactNode }) {
  const [otwarte, setOtwarte] = useState(false);
  return (
    <Dialog open={otwarte} onOpenChange={setOtwarte}>
      <DialogTrigger asChild>
        <Button variant="subtle" size="icon" aria-label="Menu" className="h-11 w-11 md:hidden">
          <Menu size={20} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu" wariant="arkusz">
        <div
          className="flex flex-col gap-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-start [&>button]:text-base"
          // `onClick` (faza bąbelkowa), NIE `onClickCapture`: React 18 obsługuje fazę
          // przechwytywania osobnym nasłuchem i opróżnia stan PRZED fazą bąbelkową. Zamknięcie
          // arkusza w capture odmontowywało przycisk, zanim dostał własny `onClick` — w przeglądarce
          // kliknięcie „Kalkulatory” zamykało menu i nic nie przenosiło (w jsdom tego nie widać).
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) setOtwarte(false);
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
