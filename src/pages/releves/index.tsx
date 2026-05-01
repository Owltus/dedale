import { LineChart } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { CardList } from "@/components/shared/CardList";
import { useGammesAvecReleves } from "@/hooks/use-releves";
import { formatDate } from "@/lib/utils/format";
import type { RelevesGammeListItem } from "@/lib/types/releves";

function filterFn(item: RelevesGammeListItem, query: string): boolean {
  const haystack = [
    item.nom_gamme,
    item.nom_famille ?? "",
    item.nom_domaine ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderContent(item: RelevesGammeListItem) {
  const sousTitre = [item.nom_domaine, item.nom_famille]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col min-w-0">
      <span className="font-medium truncate">{item.nom_gamme}</span>
      {sousTitre && (
        <span className="text-xs text-muted-foreground truncate">{sousTitre}</span>
      )}
    </div>
  );
}

function renderRight(item: RelevesGammeListItem) {
  return (
    <div className="flex items-center gap-6 text-xs text-muted-foreground shrink-0">
      <span>
        <span className="font-medium text-foreground">{item.nb_operations_mesure}</span> op. mesure
      </span>
      <span>
        <span className="font-medium text-foreground">{item.nb_releves_12m}</span> relevés (12 mois)
      </span>
      <span>
        Dernier&nbsp;: <span className="font-medium text-foreground">{formatDate(item.date_dernier_releve)}</span>
      </span>
    </div>
  );
}

export function RelevesList() {
  const { data: gammes = [] } = useGammesAvecReleves();

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Relevés">
        <div className="size-8" />
      </PageHeader>

      <CardList
        data={gammes}
        getKey={(g) => g.id_gamme}
        getHref={(g) => `/releves/${g.id_gamme}`}
        getImageId={(g) => g.id_image}
        filterFn={filterFn}
        icon={<LineChart />}
        renderContent={renderContent}
        renderRight={renderRight}
        showTitle={false}
        emptyTitle="Aucune gamme avec relevé"
        emptyDescription="Les gammes ayant au moins une opération de type Mesure apparaîtront ici."
      />
    </div>
  );
}
