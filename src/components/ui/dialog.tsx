import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zastępuje komponent `Modal` z wersji JS (własny <div> z backdropem i ręcznym
 * onClick do zamykania). Ten tutaj, dzięki Radix, dostaje za darmo:
 *  - focus trap (Tab nie wychodzi poza okno dialogowe),
 *  - zamykanie klawiszem Escape,
 *  - przywrócenie focusu do elementu, który otworzył okno,
 *  - poprawne role="dialog" / aria-modal dla czytników ekranu.
 * Żadnej z tych rzeczy własny <div> w wersji JS nie robił.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
/** Zamyka okno bez otwierania kolejnego — do przycisków „Anuluj"/„Potwierdź".
 *  (`DialogTrigger` też zamyka otwarte okno, ale semantycznie jest przełącznikiem.) */
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  wariant = "okno",
  ...props
}: DialogPrimitive.DialogContentProps & { title: string; wariant?: "okno" | "arkusz" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/80" />
      <DialogPrimitive.Content
        className={cn(
          wariant === "arkusz"
            ? // Arkusz z prawej (menu na telefonie): pełna wysokość, pod kciukiem.
              "fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto rounded-l-xl border-l border-border bg-surface p-5 shadow-pop " +
                // Wjazd TYLKO przy `motion-safe`. Dawne `motion-reduce:animate-none` przegrywało:
                // `data-[state=open]:` dokłada selektor atrybutu, więc animacja wygrywała wagą
                // i arkusz wjeżdżał także u kogoś, kto prosił o brak ruchu.
                "motion-safe:data-[state=open]:animate-[pe-arkusz-wjazd_200ms_ease-out]"
            : "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-white p-5 shadow-lg",
          className
        )}
        {...props}
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogPrimitive.Title className="font-sans text-base font-semibold">
            {title}
          </DialogPrimitive.Title>
          {/* Pole kliknięcia większe niż sama ikona (18 px), a ujemny margines zachowuje
              wygląd nagłówka: w arkuszu (telefon, kciuk) 44 × 44 px, w oknie 30 × 30 px. */}
          <DialogPrimitive.Close
            aria-label="Zamknij"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-slate-700",
              wariant === "arkusz" ? "-m-3 h-11 w-11" : "-m-1.5 h-[30px] w-[30px]"
            )}
          >
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
