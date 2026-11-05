import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Warianty odpowiadają dotychczasowym klasom CSS z wersji JS (.pe-btn-copper,
 * .pe-btn-ghost) — ta sama identyfikacja wizualna, ale teraz jako właściwy,
 * reużywalny komponent zamiast powtarzanego w ~40 miejscach className.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-colors disabled:pointer-events-none disabled:opacity-40 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint/40",
  {
    variants: {
      variant: {
        copper: "bg-copper text-white hover:bg-copper-hover",
        ghost: "bg-white border border-border hover:border-blueprint hover:text-blueprint",
        destructive: "bg-danger-grafika text-white hover:bg-danger",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3.5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  }
);
Button.displayName = "Button";
