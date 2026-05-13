import { useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { DiCreateDialog } from "./DiCreateDialog";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { DiStatusBadge } from "@/components/shared/StatusBadge";
import { useDemandes } from "@/hooks/use-demandes";
import { constatTitle, formatDate } from "@/lib/utils/format";
import type { DiListItem } from "@/lib/types/demandes";

function filterDi(r: DiListItem, q: string): boolean {
  return r.constat.toLowerCase().includes(q) || false;
}

export function DemandesList() {
  const { data: demandes = [] } = useDemandes();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Demandes d'intervention">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Nouvelle demande" onClick={() => setDialogOpen(true)} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={demandes}
        getKey={(r) => r.id_di}
        getHref={(r) => `/demandes/${r.id_di}`}
        filterFn={filterDi}
        icon={<AlertCircle className="size-5 text-muted-foreground" />}
        title="Demandes"
        emptyTitle="Aucune demande"
        emptyDescription="Créez une demande d'intervention via le bouton ci-dessus."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{constatTitle(r.constat)}</p>
            <p className="text-xs text-muted-foreground truncate">{formatDate(r.date_constat)}</p>
          </div>
        )}
        renderRight={(r) => (
          <DiStatusBadge id={r.id_statut_di} />
        )}
      />

      <DiCreateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
