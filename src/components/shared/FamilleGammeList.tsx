import { FolderOpen } from "lucide-react";
import { FamilleGammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { FamilleGammeListItem } from "@/lib/types/gammes";

function getFamilleStatutId(f: FamilleGammeListItem): number {
  return computeAggregateStatutId({
    isEmpty: f.nb_gammes === 0,
    allInactive: f.nb_gammes > 0 && f.nb_gammes === f.nb_gammes_inactives,
    hasUnassigned: f.nb_ot_sans_ot > 0,
    nbReouvert: f.nb_ot_reouvert,
    nbRetard: f.nb_ot_en_retard,
    nbEnCours: f.nb_ot_en_cours,
    prochaineDate: f.prochaine_date,
    joursPeriodicite: f.jours_periodicite_min ?? 0,
  });
}

function filterFamille(f: FamilleGammeListItem, q: string): boolean {
  return (
    f.nom_famille.toLowerCase().includes(q) ||
    f.description?.toLowerCase().includes(q) ||
    false
  );
}

interface FamilleGammeListProps {
  data: FamilleGammeListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

/// Liste de familles gammes affichée sous forme de cartes empilées
export function FamilleGammeList({ data, emptyTitle = "Aucune famille", emptyDescription, showTitle = true, showSearch = true }: FamilleGammeListProps) {
  return (
    <CardList
      data={data}
      getKey={(f) => f.id_famille_gamme}
      getHref={(f) => `/gammes/familles/${f.id_famille_gamme}`}
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
          <FamilleGammeStatusBadge id={getFamilleStatutId(f)} />
        </div>
      )}
    />
  );
}
