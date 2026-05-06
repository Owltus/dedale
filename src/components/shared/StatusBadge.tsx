import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatutOt, getPriorite, getStatutDi, getStatutContrat, getStatutGamme, getStatutFamilleGamme } from "@/lib/utils/statuts";
import type { AlerteType } from "@/lib/utils/contrat-info";

// Tonalité d'alerte → classes badge (fond/texte) cohérentes avec les statuts contrat.
const ALERTE_BADGE_CLASS: Record<AlerteType, string> = {
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export const OtStatusBadge = memo(function OtStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutOt(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const PrioriteBadge = memo(function PrioriteBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getPriorite(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const DiStatusBadge = memo(function DiStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutDi(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const ContratStatusBadge = memo(function ContratStatusBadge({
  statut,
  sousStatut,
  criticite,
  className,
}: {
  statut: string;
  sousStatut?: string | null;
  criticite?: AlerteType | null;
  className?: string;
}) {
  const cfg = getStatutContrat(statut);
  const tone = criticite ? ALERTE_BADGE_CLASS[criticite] : cfg.className;
  if (!sousStatut) {
    return <Badge variant={cfg.variant} className={cn(tone, className)}>{cfg.label}</Badge>;
  }
  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)}>
      <Badge variant={cfg.variant} className={tone}>{cfg.label}</Badge>
      <Badge variant={cfg.variant} className={tone}>{sousStatut}</Badge>
    </div>
  );
});

export const GammeStatusBadge = memo(function GammeStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutGamme(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const FamilleGammeStatusBadge = memo(function FamilleGammeStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutFamilleGamme(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});
