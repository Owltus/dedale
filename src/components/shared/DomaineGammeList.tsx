import { Layers } from "lucide-react";
import { FamilleGammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { DomaineGammeListItem } from "@/lib/types/gammes";

function getDomaineStatutId(d: DomaineGammeListItem): number {
  return computeAggregateStatutId({
    isEmpty: d.nb_gammes_total === 0,
    allInactive: d.nb_gammes_total > 0 && d.nb_gammes_total === d.nb_gammes_inactives,
    hasUnassigned: d.nb_ot_sans_ot > 0,
    nbReouvert: d.nb_ot_reouvert,
    nbRetard: d.nb_ot_en_retard,
    nbEnCours: d.nb_ot_en_cours,
    prochaineDate: d.prochaine_date,
    joursPeriodicite: d.jours_periodicite_min ?? 0,
  });
}

function filterDomaine(d: DomaineGammeListItem, q: string): boolean {
  return (
    d.nom_domaine.toLowerCase().includes(q) ||
    d.description?.toLowerCase().includes(q) ||
    false
  );
}

interface DomaineGammeListProps {
  data: DomaineGammeListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

/// Liste de domaines gammes affichée sous forme de cartes empilées
export function DomaineGammeList({ data, emptyTitle = "Aucun domaine", emptyDescription, showTitle = true, showSearch = true }: DomaineGammeListProps) {
  return (
    <CardList
      data={data}
      getKey={(d) => d.id_domaine_gamme}
      getHref={(d) => `/gammes/domaines/${d.id_domaine_gamme}`}
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
          <FamilleGammeStatusBadge id={getDomaineStatutId(d)} />
        </div>
      )}
    />
  );
}
