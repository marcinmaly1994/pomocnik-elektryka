import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface CardProps {
  title: string;
  icon?: LucideIcon;
  tag?: string;
  children: React.ReactNode;
}

export function Card({ title, icon: Icon, tag, children }: CardProps) {
  return (
    <div className="pe-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={18} className="shrink-0 text-copper" />}
          <h3 className="pe-display text-lg">{title}</h3>
        </div>
        {tag && <Badge variant="info" className="shrink-0">{tag}</Badge>}
      </div>
      {children}
    </div>
  );
}
