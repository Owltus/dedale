import { STATUTS_OT } from "@/lib/utils/statuts";
import { OT_STATUT_FILL } from "@/lib/utils/colors";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/// Convertit un tableau OtParStatut[] en segments donut avec couleurs
export function statutsToSegments(data: { id_statut: number; nombre: number }[]): DonutSegment[] {
  return data.map((d) => ({
    label: STATUTS_OT[d.id_statut]?.label ?? "Inconnu",
    value: d.nombre,
    color: OT_STATUT_FILL[d.id_statut] ?? "#94a3b8",
  }));
}
