import { Layers } from "lucide-react";
import { FamilleGammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { DomaineEquipListItem } from "@/lib/types/equipements";

function getDomaineEquipStatutId(d: DomaineEquipListItem): number {
  return computeAggregateStatutId({
    isEmpty: d.nb_equipements_total === 0,
    allInactive: d.nb_equipements_total > 0 && d.nb_equipements_total === d.nb_equipements_inactifs,
    nbReouvert: d.nb_ot_reouvert,
    nbRetard: d.nb_ot_en_retard,
    nbEnCours: d.nb_ot_en_cours,
    prochaineDate: d.prochaine_date,
    joursPeriodicite: d.jours_periodicite_min ?? 0,
  });
}

function filterDomaine(d: DomaineEquipListItem, q: string): boolean {
  return d.nom_domaine.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) || false;
}

interface DomaineEquipListProps {
  data: DomaineEquipListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

export function DomaineEquipList({ data, emptyTitle = "Aucun domaine", emptyDescription, showTitle = true, showSearch = true }: DomaineEquipListProps) {
  return (
    <CardList
      data={data}
      getKey={(d) => d.id_domaine}
      getHref={(d) => `/equipements/domaines/${d.id_domaine}`}
      getImageId={(d) => d.id_image}
      filterFn={filterDomaine}
      icon={<Layers className="size-5 text-muted-foreground" />}
      title="Domaines"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      renderContent={(d) => (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{d.nom_domaine}</p>
          <p className="text-xs text-muted-foreground truncate">{d.description ?? "\u00A0"}</p>
        </div>
      )}
      renderRight={(d) => (
        <div className="flex flex-col items-center gap-1 w-28 shrink-0">
          <FamilleGammeStatusBadge id={getDomaineEquipStatutId(d)} />
        </div>
      )}
    />
  );
}
