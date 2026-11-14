import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Menu konta w nagłówku (avatar → e-mail / Moje projekty / Zapisz teraz / Wyloguj).
 * Radix daje za darmo to samo, co `Dialog` w tym katalogu: focus trap, zamykanie
 * Escape/klikiem poza menu i poprawne role dla czytników ekranu — bez tego
 * własny <div> wymagałby ręcznego nasłuchu na `mousedown` poza elementem.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn("z-50 min-w-[220px] rounded-card border border-border bg-white p-1.5 shadow-lg", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink outline-hidden",
        // Radix przenosi fokus klawiatury na `data-highlighted`, a samo slate-50 jest za blade
        // na wskaźnik (WCAG 2.4.11) — pierścień wewnątrz pozycji, żeby menu go nie przycinało.
        "data-highlighted:bg-slate-50 data-highlighted:ring-2 data-highlighted:ring-inset data-highlighted:ring-blueprint data-disabled:pointer-events-none data-disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: DropdownMenuPrimitive.DropdownMenuLabelProps) {
  return <DropdownMenuPrimitive.Label className={cn("px-2.5 py-1.5 text-xs text-slate-400", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: DropdownMenuPrimitive.DropdownMenuSeparatorProps) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
