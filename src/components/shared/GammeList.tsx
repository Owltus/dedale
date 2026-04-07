import { ClipboardList, FileText } from "lucide-react";
import { GammeStatusBadge } from "./StatusBadge";
import { computeAggregateStatutId } from "@/lib/utils/statuts";
import { CardList } from "./CardList";
import type { GammeListItem } from "@/lib/types/gammes";

function getGammeStatutId(g: GammeListItem): number {
  return computeAggregateStatutId({
    allInactive: !g.est_active,
    isEmpty: g.nb_ot_total === 0,
    nbReouvert: g.nb_ot_reouvert,
    nbRetard: g.nb_ot_en_retard,
    nbEnCours: g.nb_ot_en_cours,
    prochaineDate: g.prochaine_date,
    joursPeriodicite: g.jours_periodicite,
  });
}

function filterGamme(g: GammeListItem, q: string): boolean {
  return (
    g.nom_gamme.toLowerCase().includes(q) ||
    g.description?.toLowerCase().includes(q) ||
    g.nom_prestataire.toLowerCase().includes(q) ||
    false
  );
}

interface GammeListProps {
  data: GammeListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
  className?: string;
}

/// Liste de gammes affichée sous forme de cartes empilées
export function GammeList({ data, emptyTitle = "Aucune gamme", emptyDescription, showTitle = true, showSearch = true, className }: GammeListProps) {
  return (
    <CardList
      data={data}
      getKey={(g) => g.id_gamme}
      getHref={(g) => `/gammes/${g.id_gamme}`}
      getImageId={(g) => g.id_image}
      filterFn={filterGamme}
      icon={<ClipboardList className="size-5 text-muted-foreground" />}
      title="Gammes"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      className={className}
      cardClassName={(g) => (!g.est_active ? "opacity-50" : undefined)}
      renderContent={(g) => (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {g.nom_gamme} <span className="text-muted-foreground font-normal">— {g.nom_prestataire}</span>
            </p>
            <p className="text-xs text-muted-foreground truncate">{g.description ?? "\u00A0"}</p>
          </div>
          {g.nb_documents > 0 && (
            <FileText className="size-8 shrink-0 text-violet-500 dark:text-violet-400" strokeWidth={1.2} />
          )}
        </>
      )}
      renderRight={(g) => (
        <div className="flex flex-col items-center gap-1 w-28 shrink-0">
          <GammeStatusBadge id={getGammeStatutId(g)} />
          <span className="text-xs text-muted-foreground">{g.libelle_periodicite}</span>
        </div>
      )}
    />
  );
}
