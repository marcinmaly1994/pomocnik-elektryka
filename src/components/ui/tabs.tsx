import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/** Zakładki „Profil"/„Ustawienia" w panelu konta — ten sam wzorzec co `Dialog` i
 *  `DropdownMenu` w tym katalogu: cienki wrapper stylistyczny nad gotowym Radixem
 *  (już był w zależnościach), zamiast pisania własnej obsługi klawiatury/aria. */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn("flex gap-1 rounded-lg border border-border bg-white p-1 text-sm", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-slate-500 transition-colors",
        "data-[state=active]:bg-[#C1793F14] data-[state=active]:font-semibold data-[state=active]:text-[#8A5526]",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.TabsContentProps) {
  return <TabsPrimitive.Content className={cn("pt-4", className)} {...props} />;
}
