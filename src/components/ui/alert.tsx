import * as React from "react";
import { AlertTriangle, Check, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Komunikat w treści strony — błąd danych, ostrzeżenie, informacja.
 *
 * Tła NIEPRZEZROCZYSTE z tokenów (`*-tlo`), nie kolory z kanałem alfa: komunikat bywa
 * w przyklejonych panelach, a półprzezroczyste tło przepuszczało przewijaną treść.
 * Błąd ma `role="alert"` (czytnik przerywa i czyta od razu), reszta `role="status"`.
 */
const STYL: Record<NonNullable<AlertProps["variant"]>, { klasy: string; Ikona: LucideIcon }> = {
  info: { klasy: "bg-blueprint-tlo text-blueprint", Ikona: Info },
  success: { klasy: "bg-success-tlo text-success", Ikona: Check },
  caution: { klasy: "bg-caution-tlo text-caution", Ikona: TriangleAlert },
  danger: { klasy: "bg-danger-tlo text-danger", Ikona: AlertTriangle },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "info" | "success" | "caution" | "danger";
  title?: React.ReactNode;
}

export function Alert({ variant = "info", title, className, children, role, ...props }: AlertProps) {
  const { klasy, Ikona } = STYL[variant];
  return (
    <div
      role={role ?? (variant === "danger" ? "alert" : "status")}
      className={cn("flex gap-2 rounded-md p-3 text-sm leading-relaxed", klasy, className)}
      {...props}
    >
      <Ikona aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
