import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Jeden przycisk dla całej aplikacji — od redesignu (PR 2) także w miejsce dawnych
 * klas przycisków z arkusza (pe-btn-…), które zniknęły z CSS.
 *
 * Stare nazwy wariantów (`copper`, `ghost`, `destructive`) zostają jako ALIASY tych
 * samych klas: ~50 wywołań w kodzie nie musi się zmieniać razem z tym plikiem.
 * Akcja główna (`primary`) ma na telefonie min. 44 px wysokości — kciuk w rękawicy
 * na budowie to inny cel niż kursor myszy.
 */
const WARIANTY = {
  primary: "bg-copper text-white hover:bg-copper-hover max-md:min-h-11",
  secondary: "bg-surface border border-border text-ink hover:border-blueprint hover:text-blueprint",
  subtle: "bg-transparent text-slate-600 hover:bg-paper hover:text-ink",
  danger: "bg-danger-grafika text-white hover:bg-danger",
  link: "bg-transparent text-blueprint underline-offset-2 hover:underline",
} as const;

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-[color,background-color,border-color,transform] duration-szybko ease-out active:scale-[.98] " +
    "disabled:pointer-events-none disabled:opacity-40 " +
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blueprint focus-visible:ring-offset-2 " +
    "motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        ...WARIANTY,
        copper: WARIANTY.primary,
        ghost: WARIANTY.secondary,
        destructive: WARIANTY.danger,
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-5 text-base",
        icon: "h-8 w-8",
      },
    },
    // Link nie ma wysokości ani wcięć przycisku. Jako wariant złożony, bo klasy rozmiaru
    // stoją w wyniku PO klasach wariantu i `tailwind-merge` zostawiłby `h-10 px-4`.
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Akcja w toku: przycisk zablokowany, kręciołek NA treści (szerokość się nie zmienia).
   * Używać tylko bez `asChild` — Slot wymaga jednego dziecka.
   */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            {/* opacity-0, nie invisible: visibility:hidden wypada z nazwy dostępnej przycisku w prawdziwych przeglądarkach, a szerokość i tak ma zostać */}
            <span className="inline-flex items-center gap-1.5 opacity-0">{children}</span>
            <Loader2 aria-hidden="true" className="absolute h-4 w-4 animate-spin motion-reduce:animate-none" />
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

// Eksport wariantów potrzebny linkom i `asChild`; wyjątek od reguły odświeżania (wzorzec shadcn).
// eslint-disable-next-line react-refresh/only-export-components
export { buttonVariants };
