import { useState } from "react";
import { Wrench } from "lucide-react";
import { OtGammeCell } from "./OtGammeCell";
import { OtStatusBadge } from "./StatusBadge";
import { DateRangePicker } from "./DateRangePicker";
import { CardList } from "./CardList";
import { OtDocumentsButton } from "./OtDocumentsButton";
import { formatDateWithWeek } from "@/lib/utils/format";
import { getEffectiveOtStatutId } from "@/lib/utils/statuts";
import type { OtListItem } from "@/lib/types/ordres-travail";

function filterOt(ot: OtListItem, q: string): boolean {
  return (
    ot.nom_gamme?.toLowerCase().includes(q) ||
    ot.description_gamme?.toLowerCase().includes(q) ||
    false
  );
}

interface OtListProps {
  data: OtListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
  showDateRange?: boolean;
}

/// Liste d'ordres de travail affichée sous forme de cartes empilées
export function OtList({ data, emptyTitle = "Aucun ordre de travail", emptyDescription, showTitle = true, showSearch = true, showDateRange = true }: OtListProps) {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });

  // Pré-filtrage par date (avant de passer au CardList qui gère la recherche texte)
  const dateFiltered = (dateRange.from || dateRange.to)
    ? data.filter((ot) => {
        const dateStr = [3, 4].includes(ot.id_statut_ot) ? ot.date_cloture : ot.date_prevue;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to && d > dateRange.to) return false;
        return true;
      })
    : data;

  return (
    <CardList
      data={dateFiltered}
      getKey={(ot) => ot.id_ordre_travail}
      getHref={(ot) => `/ordres-travail/${ot.id_ordre_travail}`}
      getImageId={(ot) => ot.id_image}
      filterFn={filterOt}
      icon={<Wrench className="size-5 text-muted-foreground" />}
      title="Ordres de travail"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showTitle={showTitle}
      showSearch={showSearch}
      extraToolbar={showDateRange
        ? <DateRangePicker from={dateRange.from} to={dateRange.to} onSelect={setDateRange} />
        : undefined
      }
      renderContent={(ot) => (
        <>
          <div className="flex-1 min-w-0">
            <OtGammeCell nomGamme={ot.nom_gamme} />
            <p className="text-xs text-muted-foreground truncate">{ot.description_gamme ?? "\u00A0"}</p>
          </div>
          {ot.nb_documents > 0 && (
            <OtDocumentsButton idOrdreTravail={ot.id_ordre_travail} nbDocuments={ot.nb_documents} />
          )}
        </>
      )}
      renderRight={(ot) => (
        <div className="flex flex-col items-center gap-1 w-32 shrink-0">
          <OtStatusBadge id={getEffectiveOtStatutId(ot)} />
          <span className="text-xs text-muted-foreground">
            {[3, 4].includes(ot.id_statut_ot)
              ? formatDateWithWeek(ot.date_cloture)
              : formatDateWithWeek(ot.date_prevue)}
          </span>
        </div>
      )}
    />
  );
}
