import { Cpu } from "lucide-react";
import { FamilleGammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { EquipementListItem } from "@/lib/types/equipements";

function getEquipementStatutId(e: EquipementListItem): number {
  return computeAggregateStatutId({
    allInactive: !e.est_actif,
    nbReouvert: e.nb_ot_reouvert,
    nbRetard: e.nb_ot_en_retard,
    nbEnCours: e.nb_ot_en_cours,
    prochaineDate: e.prochaine_date,
    joursPeriodicite: e.jours_periodicite_min ?? 0,
  });
}

function filterEquipement(e: EquipementListItem, q: string): boolean {
  return (
    e.nom_affichage.toLowerCase().includes(q) ||
    e.description?.toLowerCase().includes(q) ||
    false
  );
}

interface EquipementListProps {
  data: EquipementListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

export function EquipementList({ data, emptyTitle = "Aucun équipement", emptyDescription, showTitle = true, showSearch = true }: EquipementListProps) {
  return (
    <CardList
      data={data}
      getKey={(e) => e.id_equipement}
      getHref={(e) => `/equipements/${e.id_equipement}`}
      getImageId={(e) => e.id_image}
      filterFn={filterEquipement}
      icon={<Cpu className="size-5 text-muted-foreground" />}
      title="Équipements"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      cardClassName={(e) => (!e.est_actif ? "opacity-50" : undefined)}
      renderContent={(e) => (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{e.nom_affichage}</p>
          <p className="text-xs text-muted-foreground truncate">{e.description ?? "\u00A0"}</p>
        </div>
      )}
      renderRight={(e) => (
        <div className="flex flex-col items-center gap-1 w-28 shrink-0">
          <FamilleGammeStatusBadge id={getEquipementStatutId(e)} />
        </div>
      )}
    />
  );
}
