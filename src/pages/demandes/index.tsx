import { useState } from "react";
import { Plus } from "lucide-react";
import { DiList } from "@/components/shared/DiList";
import { DiCreateDialog } from "./DiCreateDialog";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { useDemandes } from "@/hooks/use-demandes";

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

      <DiList
        data={demandes}
        emptyTitle="Aucune demande"
        emptyDescription="Créez une demande d'intervention via le bouton ci-dessus."
      />

      <DiCreateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
