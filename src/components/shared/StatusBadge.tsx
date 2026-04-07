import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { getStatutOt, getPriorite, getStatutDi, getStatutContrat, getStatutGamme, getStatutFamilleGamme } from "@/lib/utils/statuts";

export const OtStatusBadge = memo(function OtStatusBadge({ id }: { id: number }) {
  const cfg = getStatutOt(id);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});

export const PrioriteBadge = memo(function PrioriteBadge({ id }: { id: number }) {
  const cfg = getPriorite(id);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});

export const DiStatusBadge = memo(function DiStatusBadge({ id }: { id: number }) {
  const cfg = getStatutDi(id);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});

export const ContratStatusBadge = memo(function ContratStatusBadge({ statut }: { statut: string }) {
  const cfg = getStatutContrat(statut);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});

export const GammeStatusBadge = memo(function GammeStatusBadge({ id }: { id: number }) {
  const cfg = getStatutGamme(id);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});

export const FamilleGammeStatusBadge = memo(function FamilleGammeStatusBadge({ id }: { id: number }) {
  const cfg = getStatutFamilleGamme(id);
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
});
