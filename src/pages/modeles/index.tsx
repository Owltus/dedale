import { type ReactNode, useCallback, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { useSetBreadcrumbTrail } from "@/components/layout/BreadcrumbContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { id: "operations", label: "Opérations" },
  { id: "equipements", label: "Équipements" },
  { id: "di", label: "Demandes d'intervention" },
] as const;

export interface ModelesOutletContext {
  addSignal: number;
  setDetailTitle: (title: string | null) => void;
  setDetailActions: (actions: ReactNode) => void;
}

export function Modeles() {
  const location = useLocation();
  const navigate = useNavigate();
  const [addSignal, setAddSignal] = useState(0);
  const [detailTitle, setDetailTitleRaw] = useState<string | null>(null);
  const [detailActions, setDetailActionsRaw] = useState<ReactNode>(null);
  const setDetailTitle = useCallback((t: string | null) => setDetailTitleRaw(t), []);
  const setDetailActions = useCallback((a: ReactNode) => setDetailActionsRaw(a), []);

  // Onglet actif déduit de l'URL : /modeles/operations/... → "operations"
  const segments = location.pathname.replace("/modeles", "").split("/").filter(Boolean);
  const activeTab = TABS.find((t) => t.id === segments[0])?.id ?? "operations";
  const isDetailView = segments.length > 1;

  // Fil d'Ariane dynamique
  const title = isDetailView && detailTitle ? detailTitle : "Modèles";
  useSetBreadcrumbTrail(
    isDetailView && detailTitle
      ? [
          { label: "Modèles", path: `/modeles/${activeTab}` },
          { label: detailTitle, path: location.pathname },
        ]
      : [{ label: "Modèles", path: location.pathname }],
  );

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={title}>
        {isDetailView ? (
          detailActions
        ) : (
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Créer un modèle" onClick={() => setAddSignal((s) => s + 1)} />
          </TooltipProvider>
        )}
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/modeles/${v}`)} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-3 flex flex-1 flex-col min-h-0 gap-3 overflow-auto">
          <Outlet context={{ addSignal: isDetailView ? 0 : addSignal, setDetailTitle, setDetailActions } satisfies ModelesOutletContext} />
        </div>
      </Tabs>
    </div>
  );
}
