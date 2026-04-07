import { cn } from "@/lib/utils";

interface DescriptionListProps {
  children: React.ReactNode;
  className?: string;
}

interface DescriptionItemProps {
  label: string;
  value: React.ReactNode;
}

/// Liste descriptive clé-valeur (dl/dt/dd)
export function DescriptionList({ children, className }: DescriptionListProps) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm", className)}>
      {children}
    </dl>
  );
}

/// Élément d'une liste descriptive
export function DescriptionItem({ label, value }: DescriptionItemProps) {
  return (
    <>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </>
  );
}
