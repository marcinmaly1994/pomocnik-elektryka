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
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={18} className="text-copper" />}
          <h3 className="pe-display text-lg">{title}</h3>
        </div>
        {tag && <Badge variant="info">{tag}</Badge>}
      </div>
      {children}
    </div>
  );
}
