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
    <Card className={cn(className)}>
      <CardContent className="flex items-center gap-4 p-4">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div>
          <p className={cn("text-2xl font-bold", VARIANT_CLASSES[variant])}>{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
