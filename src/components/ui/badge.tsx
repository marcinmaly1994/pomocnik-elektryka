import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Znacznik: krótka wartość albo stan przy wyniku („2,5 mm²”, „czeka”, „gotowy”).
 *
 * Zastępuje dawną parę klas znacznika z arkusza (chip + tag w trzech kolorach). Warianty
 * nazwane ZNACZENIEM, nie kolorem: `info` (niebieski), `success` (zielony), `accent`
 * (miedziany — wyróżnienie bez oceny), `caution`, `danger`.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold leading-4",
  {
    variants: {
      variant: {
        neutral: "border-border bg-paper text-slate-600",
        info: "border-border-strong bg-blueprint-tlo text-blueprint",
        success: "border-border-strong bg-success-tlo text-success",
        accent: "border-border-strong bg-copper-tlo text-caution",
        caution: "border-border-strong bg-caution-tlo text-caution",
        danger: "border-border-strong bg-danger-tlo text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Stała wariantów obok komponentu (jak w button.tsx) — używa jej też <button> wyglądający jak znacznik.
// eslint-disable-next-line react-refresh/only-export-components
export { badgeVariants };
