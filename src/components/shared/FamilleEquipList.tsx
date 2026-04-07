import { FolderOpen } from "lucide-react";
import { FamilleGammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { FamilleEquipListItem } from "@/lib/types/equipements";

function getFamilleEquipStatutId(f: FamilleEquipListItem): number {
  return computeAggregateStatutId({
    isEmpty: f.nb_equipements === 0,
    allInactive: f.nb_equipements > 0 && f.nb_equipements === f.nb_equipements_inactifs,
    nbReouvert: f.nb_ot_reouvert,
    nbRetard: f.nb_ot_en_retard,
    nbEnCours: f.nb_ot_en_cours,
    prochaineDate: f.prochaine_date,
    joursPeriodicite: f.jours_periodicite_min ?? 0,
  });
}

function filterFamille(f: FamilleEquipListItem, q: string): boolean {
  return f.nom_famille.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q) || false;
}

interface FamilleEquipListProps {
  data: FamilleEquipListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

export function FamilleEquipList({ data, emptyTitle = "Aucune famille", emptyDescription, showTitle = true, showSearch = true }: FamilleEquipListProps) {
  return (
    <CardList
      data={data}
      getKey={(f) => f.id_famille}
      getHref={(f) => `/equipements/familles/${f.id_famille}`}
      getImageId={(f) => f.id_image}
      filterFn={filterFamille}
      icon={<FolderOpen className="size-5 text-muted-foreground" />}
      title="Familles"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      renderContent={(f) => (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{f.nom_famille}</p>
          <p className="text-xs text-muted-foreground truncate">{f.description ?? "\u00A0"}</p>
        </div>
      )}
      renderRight={(f) => (
        <div className="flex flex-col items-center gap-1 w-28 shrink-0">
          <FamilleGammeStatusBadge id={getFamilleEquipStatutId(f)} />
        </div>
      )}
    />
  );
}
