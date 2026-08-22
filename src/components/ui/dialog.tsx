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
  ...props
}: DialogPrimitive.DialogContentProps & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/80" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-card border border-border bg-white p-5 shadow-lg",
          className
        )}
        {...props}
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogPrimitive.Title className="font-sans text-base font-semibold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
