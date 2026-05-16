import { AlertCircle } from "lucide-react";
import { CardList } from "./CardList";
import { DiStatusBadge } from "./StatusBadge";
import { constatTitle, formatDate } from "@/lib/utils/format";
import type { DiListItem } from "@/lib/types/demandes";

function filterDi(r: DiListItem, q: string): boolean {
  return r.constat.toLowerCase().includes(q);
}

interface DiListProps {
  data: DiListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
}

/// Liste de demandes d'intervention affichée sous forme de cartes empilées
export function DiList({
  data,
  emptyTitle = "Aucune demande",
  emptyDescription,
  showTitle = true,
  showSearch = true,
}: DiListProps) {
  return (
    <CardList
      data={data}
      getKey={(r) => r.id_di}
      getHref={(r) => `/demandes/${r.id_di}`}
      filterFn={filterDi}
      icon={<AlertCircle className="size-5 text-muted-foreground" />}
      title="Demandes"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      renderContent={(r) => (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{constatTitle(r.constat)}</p>
          <p className="text-xs text-muted-foreground truncate">{formatDate(r.date_constat)}</p>
        </div>
      )}
      renderRight={(r) => <DiStatusBadge id={r.id_statut_di} />}
    />
  );
}
