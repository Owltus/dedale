import { useState } from "react";
import { FileText, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { OtGammeCell } from "./OtGammeCell";
import { OtStatusBadge } from "./StatusBadge";
import { DateRangePicker } from "./DateRangePicker";
import { CardList } from "./CardList";
import { formatDate } from "@/lib/utils/format";
import type { OtListItem } from "@/lib/types/ordres-travail";

/// Calcule l'ID de statut effectif à afficher selon la cascade de proximité
function getEffectiveStatutId(ot: OtListItem): number {
  if (ot.est_en_retard === 1) return 12;

  if (ot.id_statut_ot === 1) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const datePrevue = new Date(ot.date_prevue);
    datePrevue.setHours(0, 0, 0, 0);
    const diff = Math.ceil((datePrevue.getTime() - today.getTime()) / 86_400_000);
    const p = ot.jours_periodicite;

    if (diff <= 7 && p >= 30) return 13;                           // Cette semaine
    if (diff > 7 && diff <= 14 && p >= 30) return 14;             // Semaine prochaine
    if (diff > 14 && diff <= 30 && p >= 60) return 15;            // Ce mois-ci
    if (diff > 30 && p >= 730) {                                   // Cette année
      const finAnnee = new Date(today.getFullYear(), 11, 31);
      if (datePrevue <= finAnnee) return 16;
    }
    return ot.est_automatique === 1 ? 11 : 1;                      // Programmé / Planifié
  }

  return ot.id_statut_ot;
}

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
      extraToolbar={
        <div className={cn(!showDateRange && "invisible")}>
          <DateRangePicker from={dateRange.from} to={dateRange.to} onSelect={setDateRange} />
        </div>
      }
      renderContent={(ot) => (
        <>
          <div className="flex-1 min-w-0">
            <OtGammeCell nomGamme={ot.nom_gamme} />
            <p className="text-xs text-muted-foreground truncate">{ot.description_gamme ?? "\u00A0"}</p>
          </div>
          {ot.nb_documents > 0 && (
            <FileText className="size-8 shrink-0 text-violet-500 dark:text-violet-400" strokeWidth={1.2} />
          )}
        </>
      )}
      renderRight={(ot) => (
        <div className="flex flex-col items-center gap-1 w-28 shrink-0">
          <OtStatusBadge id={getEffectiveStatutId(ot)} />
          <span className="text-xs text-muted-foreground">
            {[3, 4].includes(ot.id_statut_ot)
              ? formatDate(ot.date_cloture)
              : formatDate(ot.date_prevue)}
          </span>
        </div>
      )}
    />
  );
}
