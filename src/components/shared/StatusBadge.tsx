import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatutOt, getPriorite, getStatutDi, getStatutContrat, getStatutGamme, getStatutFamilleGamme } from "@/lib/utils/statuts";

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

export const ContratStatusBadge = memo(function ContratStatusBadge({ statut, className }: { statut: string; className?: string }) {
  const cfg = getStatutContrat(statut);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const GammeStatusBadge = memo(function GammeStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutGamme(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});

export const FamilleGammeStatusBadge = memo(function FamilleGammeStatusBadge({ id, className }: { id: number; className?: string }) {
  const cfg = getStatutFamilleGamme(id);
  return <Badge variant={cfg.variant} className={cn(cfg.className, className)}>{cfg.label}</Badge>;
});
