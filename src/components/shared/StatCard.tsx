import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: number | string;
  variant?: "default" | "destructive" | "warning";
  icon?: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES = {
  default: "text-foreground",
  destructive: "text-destructive",
  warning: "text-yellow-600 dark:text-yellow-400",
};

/// Carte KPI avec label, valeur et variante de couleur
export function StatCard({ label, value, variant = "default", icon, className }: StatCardProps) {
  return (
    <Card className={cn("py-0 gap-0", className)}>
      <CardContent className="flex items-center gap-2 px-3 py-1.5">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-semibold ml-auto", VARIANT_CLASSES[variant])}>{value}</p>
      </CardContent>
    </Card>
  );
}
