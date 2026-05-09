import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Check, FileUp, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { useDocumentsForEntity } from "@/hooks/use-documents";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { InfoCard } from "@/components/shared/InfoCard";
import { Card, CardContent } from "@/components/ui/card";
import {
  useOrdreTravail, useUpdateStatutOt, useUpdateOrdreTravail, useDeleteOrdreTravail,
  useBulkUpdateOperations, useOperationsHistorique,
} from "@/hooks/use-ordres-travail";
import { useGamme, useFamilleGamme, useDomaineGamme } from "@/hooks/use-gammes";
import { getEffectiveOtStatutId, getStatutOt } from "@/lib/utils/statuts";
import { buildGammeBreadcrumb } from "@/lib/utils/breadcrumbs";
import { formatDate } from "@/lib/utils/format";
import type { OtEditFormData } from "@/lib/schemas/ordres-travail";
import type { OpExecBatchItem } from "@/lib/types/ordres-travail";
import { isMesureOp } from "@/lib/utils/operations";
import { OtEditDialog } from "./OtEditDialog";
import { OtOperationsTable, type OpDraftChanges } from "./OtOperationsTable";

export function OrdresTravailDetail() {
  const { id } = useParams<{ id: string }>();
  const otId = Number(id);
  const { data, isLoading } = useOrdreTravail(otId);
  const navigate = useNavigate();
  const updateStatut = useUpdateStatutOt();
  const updateOt = useUpdateOrdreTravail();
  const deleteOt = useDeleteOrdreTravail();
  const bulkUpdate = useBulkUpdateOperations();
  const { data: docs = [] } = useDocumentsForEntity("ordres_travail", otId);
  const hasMesureOp = useMemo(
    () => (data?.operations ?? []).some(isMesureOp),
    [data?.operations]
  );
  const { data: historiqueByOp } = useOperationsHistorique(otId, hasMesureOp);
  const { data: gamme } = useGamme(data?.ordre_travail.id_gamme ?? 0);
  const { data: famille } = useFamilleGamme(gamme?.id_famille_gamme ?? 0);
  const { data: domaine } = useDomaineGamme(famille?.id_domaine_gamme ?? 0);

  useSetBreadcrumbTrail(gamme && famille && domaine ? [
    ...buildGammeBreadcrumb(domaine, famille, gamme),
    { label: `#${otId}`, path: `/ordres-travail/${otId}` },
  ] : []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState("operations");
  const [editOpen, setEditOpen] = useState(false);
  const [draftChanges, setDraftChanges] = useState<OpDraftChanges>(new Map());
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isDirty = draftChanges.size > 0;

  // Bloque la navigation React Router tant qu'il y a des modifications non enregistrées
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setConfirmDiscardOpen(true);
    }
  }, [blocker.state]);

  // Bloque la fermeture de la fenêtre / rechargement natif
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleDiscardConfirm = useCallback(() => {
    setDraftChanges(new Map());
    setConfirmDiscardOpen(false);
    if (blocker.state === "blocked") blocker.proceed();
  }, [blocker]);

  const handleDiscardCancel = useCallback(() => {
    setConfirmDiscardOpen(false);
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  const infoItems = useMemo(() => {
    if (!data) return [];
    const ot = data.ordre_travail;
    return [
      { label: "Prestataire", value: ot.nom_prestataire },
      { label: "Localisation", value: ot.nom_localisation },
      { label: "Périodicité", value: ot.libelle_periodicite },
      { label: "Date prévue", value: formatDate(ot.date_prevue) },
      { label: "Date début", value: formatDate(ot.date_debut) },
      { label: "Date clôture", value: formatDate(ot.date_cloture) },
      { label: "Équipement", value: ot.nom_equipement },
    ];
  }, [data]);

  if (isLoading) return <div className="p-6"><p className="text-sm text-muted-foreground">Chargement...</p></div>;
  if (!data) return <div className="p-6"><p className="text-sm text-destructive">OT non trouvé.</p></div>;

  const { ordre_travail: ot, operations } = data;
  const statutCfg = getStatutOt(getEffectiveOtStatutId(ot));
  const isTerminal = ot.id_statut_ot === 3 || ot.id_statut_ot === 4;
  const isActif = [1, 2, 5].includes(ot.id_statut_ot);
  const allOpsDone = operations.length > 0 && operations.every(o => [3, 4, 5].includes(o.id_statut_operation));

  const handleTransition = async (target: number) => {
    try {
      await updateStatut.mutateAsync({ id: otId, nouveauStatut: target });
      toast.success("Statut mis à jour");
    } catch { /* géré par useInvokeMutation */ }
  };

  const onSubmitEdit = async (input: OtEditFormData) => {
    try {
      await updateOt.mutateAsync({
        id: otId,
        input: {
          date_prevue: input.date_prevue,
          id_priorite: input.id_priorite,
          commentaires: input.commentaires ?? null,
        },
      } as never);
      toast.success("OT modifié");
      setEditOpen(false);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSaveDraft = async () => {
    if (!isDirty) return;
    const opsById = new Map(operations.map((o) => [o.id_operation_execution, o]));
    const items: OpExecBatchItem[] = Array.from(draftChanges.entries()).map(([opId, patch]) => {
      const source = opsById.get(opId);
      return {
        id_operation_execution: opId,
        input: {
          id_statut_operation: patch.id_statut_operation ?? source?.id_statut_operation ?? 1,
          valeur_mesuree: patch.valeur_mesuree !== undefined ? patch.valeur_mesuree : (source?.valeur_mesuree ?? null),
          est_conforme: patch.est_conforme !== undefined ? patch.est_conforme : (source?.est_conforme ?? null),
          date_execution: patch.date_execution !== undefined ? patch.date_execution : (source?.date_execution ?? null),
          commentaires: patch.commentaires !== undefined ? patch.commentaires : (source?.commentaires ?? null),
        },
      };
    });
    try {
      await bulkUpdate.mutateAsync({ items } as never);
      toast.success(`${items.length} modification(s) enregistrée(s)`);
      setDraftChanges(new Map());
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDiscardDraft = () => {
    setDraftChanges(new Map());
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={`#${ot.id_ordre_travail} — ${ot.nom_gamme}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium ${statutCfg.className ?? ""}`}>
            {statutCfg.label}
          </span>
          <TooltipProvider delay={300}>
            {activeTab === "operations" && (
              <>
                {!isTerminal && (
                  <HeaderButton
                    icon={<Pencil className="size-4" />}
                    label={isDirty ? "Enregistrer les modifications d'opérations d'abord" : "Modifier"}
                    onClick={() => setEditOpen(true)}
                    disabled={isDirty}
                  />
                )}
                {isActif && (
                  <HeaderButton
                    icon={<Ban className="size-4" />}
                    label="Annuler l'OT"
                    onClick={() => handleTransition(4)}
                    variant="destructive"
                    disabled={isDirty || updateStatut.isPending}
                  />
                )}
                {ot.id_statut_ot === 5 && (
                  <HeaderButton
                    icon={<Check className="size-4" />}
                    label={allOpsDone ? "Clôturer" : "Clôturer (toutes les opérations doivent être terminées)"}
                    onClick={() => handleTransition(3)}
                    disabled={updateStatut.isPending || !allOpsDone || isDirty}
                  />
                )}
                {ot.id_statut_ot === 3 && (
                  <HeaderButton icon={<RotateCcw className="size-4" />} label="Réouvrir" onClick={() => handleTransition(5)} disabled={updateStatut.isPending} />
                )}
                {ot.id_statut_ot === 4 && (
                  <HeaderButton icon={<RefreshCw className="size-4" />} label="Réactiver" onClick={() => handleTransition(1)} disabled={updateStatut.isPending} />
                )}
              </>
            )}
            {activeTab === "documents" && !isTerminal && (
              <HeaderButton icon={<Pencil className="size-4" />} label="Modifier" onClick={() => setEditOpen(true)} />
            )}
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("ot-doc-upload")?.click()} />
            )}
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <InfoCard imageId={ot.id_image} items={infoItems} />

      {ot.commentaires && (
        <Card className="shrink-0">
          <CardContent className="py-3 px-4">
            <p className="text-xs">{ot.commentaires}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="operations" className="flex-1">Opérations ({operations.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtOperationsTable
            operations={operations}
            isTerminal={isTerminal}
            draftChanges={draftChanges}
            onDraftChange={setDraftChanges}
            onSaveDraft={handleSaveDraft}
            onDiscardDraft={handleDiscardDraft}
            isSaving={bulkUpdate.isPending}
            historiqueByOp={historiqueByOp}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="ordres_travail" entityId={otId} inputId="ot-doc-upload" hideAddButton
            namingContext={{ prestataire: ot.nom_prestataire ?? undefined, objet: ot.nom_gamme, date: ot.date_cloture ?? ot.date_prevue }} />
        </TabsContent>
      </Tabs>

      <OtEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        ot={ot}
        onSubmit={onSubmitEdit}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cet ordre de travail ?"
        description={`L'OT #${ot.id_ordre_travail} et toutes ses opérations d'exécution seront définitivement supprimés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteOt.mutateAsync({ id: otId } as never);
            toast.success("OT supprimé");
            navigate(-1);
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={(open) => { if (!open) handleDiscardCancel(); }}
        title="Modifications non enregistrées"
        description={`${draftChanges.size} modification(s) en cours sur les opérations. Quitter sans enregistrer ?`}
        confirmLabel="Quitter sans enregistrer"
        cancelLabel="Rester"
        variant="destructive"
        onConfirm={handleDiscardConfirm}
      />
    </div>
  );
}
