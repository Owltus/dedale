import { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Ban, FileUp, GitBranchPlus, Pencil, Plus, Trash2, Unlink2 } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { InfoCard } from "@/components/shared/InfoCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EditContratDialog } from "@/components/shared/ContratEditDialog";
import { ResilierContratDialog } from "@/components/shared/ContratResilierDialog";
import { AvenantContratDialog } from "@/components/shared/ContratAvenantDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prestataireSchema, type PrestataireFormData } from "@/lib/schemas/prestataires";
import { contratSchema, type ContratFormData } from "@/lib/schemas/contrats";
import { ContratTypeFields, contratCreateDefaults } from "@/components/shared/contrat-dialog-helpers";
import type { ContratListItem } from "@/lib/types/contrats";
import { getContratInfo } from "@/lib/utils/contrat-info";
import { usePrestataire, useUpdatePrestataire, useDeletePrestataire } from "@/hooks/use-prestataires";
import {
  useContrats, useContrat, useCreateContrat, useUpdateContrat, useDeleteContrat,
  useResilierContrat, useCreateAvenant,
} from "@/hooks/use-contrats";
import { useTypesContrats, useTypesDocuments } from "@/hooks/use-referentiels";
import { useGammes } from "@/hooks/use-gammes";
import { useOrdresTravail } from "@/hooks/use-ordres-travail";
import { OtList } from "@/components/shared/OtList";
import { GammeList } from "@/components/shared/GammeList";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { DocumentIcon } from "@/components/shared/DocumentIcon";
import { DropZone } from "@/components/shared/DropZone";
import { UploadModal } from "@/components/shared/UploadModal";
import { useUploadQueue } from "@/components/shared/UploadQueue";
import { useDocumentsForEntity, useDownloadDocument } from "@/hooks/use-documents";
import { useInvokeMutation } from "@/hooks/useInvoke";
import { useQueryClient } from "@tanstack/react-query";
import { ContratStatusBadge } from "@/components/shared/StatusBadge";
import { DocumentPreviewDialog, type PreviewableDoc } from "@/pages/documents/DocumentPreviewDialog";
import { formatDate, stripExtension } from "@/lib/utils/format";

function progressColor(p: number): string {
  if (p > 0.9) return "bg-red-500";
  if (p > 0.75) return "bg-amber-500";
  return "bg-primary";
}

function alerteClasses(type: string): string {
  if (type === "danger") return "border-red-400 text-red-700 dark:border-red-600 dark:text-red-400";
  if (type === "warning") return "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400";
  return "border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400";
}

function ContratCard({ contrat: c, onSelect, onEdit, onDelete, onResilier, onAvenant, onAddDocument, onDropFiles, onPreviewDoc }: {
  contrat: ContratListItem;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onResilier: () => void;
  onAvenant: () => void;
  onAddDocument: () => void;
  onDropFiles: (files: { name: string; base64: string }[]) => Promise<void>;
  onPreviewDoc: (doc: PreviewableDoc) => void;
}) {
  const cInfo = useMemo(() => getContratInfo(c), [c]);
  const { data: documents = [] } = useDocumentsForEntity("contrats", c.id_contrat);
  const qcLocal = useQueryClient();
  const unlinkDoc = useInvokeMutation<null, Record<string, unknown>>(
    "unlink_document_contrat",
    { onSettled: () => qcLocal.invalidateQueries({ queryKey: ["documents"] }) },
  );
  const deleteDoc = useInvokeMutation<null, { id: number }>(
    "delete_document",
    { onSettled: () => qcLocal.invalidateQueries({ queryKey: ["documents"] }) },
  );
  const isTerminal = cInfo.statut === "Archivé" || cInfo.statut === "Résilié" || cInfo.statut === "Terminé";
  // Les contrats archivés acceptent encore les documents (le SQL ne bloque pas documents_lies)
  const isDocReadonly = cInfo.statut === "Résilié" || cInfo.statut === "Terminé";
  const hasDelais = c.duree_cycle_mois != null || c.delai_preavis_jours != null || c.fenetre_resiliation_jours != null;
  const [confirmUnlink, setConfirmUnlink] = useState<number | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<number | null>(null);

  return (
    <DropZone onFilesDropped={onDropFiles} disabled={isDocReadonly} className={cn(
      "rounded-lg border p-4 space-y-3 transition-all",
      c.est_archive && "border-dashed border-muted-foreground/30 bg-muted/30 opacity-60"
    )}>
      <div onClick={onSelect} className="space-y-3">
        {/* En-tête : type + alerte + statut + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-center gap-2">
            <p className="text-sm font-semibold">{c.libelle_type} — {c.reference}</p>
            {cInfo.alerte && (
              <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", alerteClasses(cInfo.alerteType!))}>
                {cInfo.alerte}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ContratStatusBadge statut={cInfo.statut} />
            <ActionButtons
              onEdit={!isTerminal ? onEdit : undefined}
              onDelete={onDelete}
              extra={
                <>
                  {!isDocReadonly && (
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onAddDocument(); }} />}>
                        <FileUp className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Ajouter un document</TooltipContent>
                    </Tooltip>
                  )}
                  {!isTerminal && (
                    <>
                      {cInfo.statut !== "Résilié" && (
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onResilier(); }} />}>
                            <Ban className="size-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>Résilier</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onAvenant(); }} />}>
                          <GitBranchPlus className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Créer un avenant</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </>
              }
            />
          </div>
        </div>

        {c.objet_avenant && (
          <p className="text-xs text-muted-foreground -mt-1.5">Avenant : {c.objet_avenant}</p>
        )}

        {c.commentaires && (
          <>
            <p className="text-xs text-muted-foreground italic line-clamp-2">{c.commentaires}</p>
            <Separator />
          </>
        )}

        {/* Description dynamique + barre de progression */}
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground leading-relaxed">{cInfo.texte}</p>
          {cInfo.progression != null && !c.est_archive && (
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progressColor(cInfo.progression))}
                style={{ width: `${Math.round(cInfo.progression * 100)}%` }}
              />
            </div>
          )}
        </div>

        <Separator />

        {/* Grille d'informations */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Début</p>
            <p className="font-medium">{formatDate(c.date_debut)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fin</p>
            <p className="font-medium">{formatDate(c.date_fin)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Signature</p>
            <p className="font-medium">{formatDate(c.date_signature)}</p>
          </div>
          {hasDelais && (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Cycle</p>
                <p className="font-medium">{c.duree_cycle_mois ? `${c.duree_cycle_mois} mois` : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Préavis</p>
                <p className="font-medium">{c.delai_preavis_jours ? `${c.delai_preavis_jours} j` : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fenêtre résil.</p>
                <p className="font-medium">{c.fenetre_resiliation_jours ? `${c.fenetre_resiliation_jours} j` : "—"}</p>
              </div>
            </>
          )}
          {c.date_resiliation && (
            <div>
              <p className="text-xs text-muted-foreground">Résilié le</p>
              <p className="font-medium text-destructive">{formatDate(c.date_resiliation)}</p>
            </div>
          )}
        </div>

        {/* Pied : badge avenants */}
        {c.nb_avenants > 0 && (
          <>
            <Separator />
            <div className="flex items-end justify-end">
              <Badge variant="outline" className="text-xs">
                {c.nb_avenants} avenant{c.nb_avenants > 1 ? "s" : ""}
              </Badge>
            </div>
          </>
        )}

        {/* Documents liés — affiché uniquement s'il y en a */}
        {documents.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {documents.map((doc) => (
                <div key={doc.id_document} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 flex-1 hover:text-foreground transition-colors text-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewDoc(doc);
                    }}
                  >
                    <DocumentIcon fileName={doc.nom_original} className="size-3.5 shrink-0" />
                    <span className="truncate">{stripExtension(doc.nom_original)}</span>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="size-5" title="Délier" onClick={(e) => {
                      e.stopPropagation();
                      setConfirmUnlink(doc.id_document);
                    }}>
                      <Unlink2 className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-5 text-destructive" title="Supprimer" onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteDoc(doc.id_document);
                    }}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmUnlink !== null}
        onOpenChange={(open) => { if (!open) setConfirmUnlink(null); }}
        title="Délier le document"
        description="Ce document ne sera plus associé à ce contrat, mais restera disponible dans la bibliothèque."
        confirmLabel="Délier"
        onConfirm={async () => {
          if (confirmUnlink === null) return;
          try {
            await unlinkDoc.mutateAsync({ idDocument: confirmUnlink, idContrat: c.id_contrat });
            toast.success("Document délié");
          } catch (e) { toast.error(String(e)); }
          setConfirmUnlink(null);
        }}
      />
      <ConfirmDialog
        open={confirmDeleteDoc !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteDoc(null); }}
        title="Supprimer le document"
        description="Le document sera définitivement supprimé. Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          if (confirmDeleteDoc === null) return;
          try {
            await deleteDoc.mutateAsync({ id: confirmDeleteDoc });
            toast.success("Document supprimé");
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteDoc(null);
        }}
      />
    </DropZone>
  );
}

export function PrestatairesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prestataireId = Number(id);

  // Données prestataire
  const { data: prestataire, isLoading } = usePrestataire(prestataireId);
  const updatePrestataire = useUpdatePrestataire();
  const deletePrestataire = useDeletePrestataire();

  // Données contrats
  const { data: allContrats = [] } = useContrats();
  const contrats = allContrats.filter((c) => c.id_prestataire === prestataireId);

  // Données gammes et OT filtrées par prestataire
  const { data: allGammes = [] } = useGammes();
  const gammes = allGammes.filter((g) => g.nom_prestataire === prestataire?.libelle);
  const { data: allOt = [] } = useOrdresTravail();
  const ots = allOt.filter((ot) => ot.nom_prestataire === prestataire?.libelle);
  const { data: prestDocs = [] } = useDocumentsForEntity("prestataires", prestataireId);
  const { data: typesContrats = [] } = useTypesContrats();
  const createContrat = useCreateContrat();
  const updateContrat = useUpdateContrat();
  const deleteContrat = useDeleteContrat();
  const resilierContrat = useResilierContrat();
  const createAvenant = useCreateAvenant();

  // État UI
  const [activeTab, setActiveTab] = useState("contrats");
  const [editPrestOpen, setEditPrestOpen] = useState(false);
  const [deletePrestOpen, setDeletePrestOpen] = useState(false);
  const [createContratOpen, setCreateContratOpen] = useState(false);
  const [selectedContratId, setSelectedContratId] = useState<number | null>(null);
  const [editContratOpen, setEditContratOpen] = useState(false);
  const [deleteContratOpen, setDeleteContratOpen] = useState(false);
  const [resilierOpen, setResilierOpen] = useState(false);
  const [avenantOpen, setAvenantOpen] = useState(false);
  const [docContratId, setDocContratId] = useState<number | null>(null);
  const { data: docContratDocs = [] } = useDocumentsForEntity("contrats", docContratId ?? 0);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [droppedFilesForContrat, setDroppedFilesForContrat] = useState<{ name: string; base64: string }[]>();
  const [previewDoc, setPreviewDoc] = useState<PreviewableDoc | null>(null);
  const [previewData, setPreviewData] = useState<string | null>(null);

  // Prévisualisation documents
  const downloadMutation = useDownloadDocument();
  const handlePreview = async (doc: PreviewableDoc) => {
    try {
      const base64 = await downloadMutation.mutateAsync({ id: doc.id_document });
      setPreviewData(base64);
      setPreviewDoc(doc);
    } catch { /* géré */ }
  };
  const handleDownload = async (doc: PreviewableDoc) => {
    try {
      const destination = await save({ defaultPath: doc.nom_original, title: "Enregistrer le document" });
      if (!destination) return;
      await invoke("save_document_to", { id: doc.id_document, destination });
      toast.success("Document enregistré");
    } catch (err) { toast.error(String(err)); }
  };

  // Upload documents contrat
  const qc = useQueryClient();
  const { enqueue } = useUploadQueue();
  const { data: typesDocuments = [] } = useTypesDocuments();
  const contratTypeId = useMemo(() => typesDocuments.find(t => t.nom === "Contrat")?.id_type_document, [typesDocuments]);
  const linkDocContrat = useInvokeMutation<null, Record<string, unknown>>(
    "link_document_contrat",
    { onSettled: () => qc.invalidateQueries({ queryKey: ["documents"] }) },
  );

  const handleContratDocUpload = useCallback((files: { name: string; base64: string; idTypeDocument: number }[]) => {
    if (!docContratId) return;
    const targetId = docContratId;
    enqueue(files, async (idDocument) => {
      await linkDocContrat.mutateAsync({ idDocument, idContrat: targetId });
    });
  }, [docContratId, enqueue, linkDocContrat]);

  const linkExistingToContrat = useCallback(async (ids: number[]) => {
    if (!docContratId) return;
    const results = await Promise.allSettled(
      ids.map((idDocument) => linkDocContrat.mutateAsync({ idDocument, idContrat: docContratId })),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const ko = results.filter((r) => r.status === "rejected").length;
    if (ko > 0) toast.error(`${ko} liaison${ko > 1 ? "s" : ""} échouée${ko > 1 ? "s" : ""}`);
    if (ok > 0) toast.success(`${ok} document${ok > 1 ? "s" : ""} lié${ok > 1 ? "s" : ""}`);
  }, [docContratId, linkDocContrat]);

  // Contrat sélectionné pour les dialogs
  const { data: selectedContrat } = useContrat(selectedContratId ?? 0);

  // Formulaires
  const prestForm = useForm<PrestataireFormData>({
    resolver: typedResolver(prestataireSchema),
    defaultValues: { libelle: "", description: "", adresse: "", code_postal: "", ville: "", telephone: "", email: "", id_image: null },
  });

  const contratForm = useForm<ContratFormData>({
    resolver: typedResolver(contratSchema),
    defaultValues: contratCreateDefaults(prestataireId),
  });

  if (isLoading) return <div className="p-4"><p className="text-sm text-muted-foreground">Chargement...</p></div>;
  if (!prestataire) return <div className="p-4"><p className="text-sm text-destructive">Prestataire non trouvé.</p></div>;

  const isInternal = prestataire.id_prestataire === 1;

  // Handlers prestataire
  const openEditPrest = () => {
    prestForm.reset({
      libelle: prestataire.libelle, description: prestataire.description ?? "",
      adresse: prestataire.adresse ?? "", code_postal: prestataire.code_postal ?? "",
      ville: prestataire.ville ?? "", telephone: prestataire.telephone ?? "", email: prestataire.email ?? "",
      id_image: prestataire.id_image ?? null,
    });
    setEditPrestOpen(true);
  };

  const onSubmitEditPrest = async (data: unknown) => {
    try {
      await updatePrestataire.mutateAsync({ id: prestataireId, input: data } as never);
      toast.success("Prestataire modifié");
      setEditPrestOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // Handlers contrats
  const openCreateContrat = () => {
    contratForm.reset(contratCreateDefaults(prestataireId));
    setCreateContratOpen(true);
  };

  const onSubmitCreateContrat = async (data: unknown) => {
    try {
      await createContrat.mutateAsync({ input: { ...(data as Record<string, unknown>), id_prestataire: prestataireId } } as never);
      toast.success("Contrat créé");
      setCreateContratOpen(false);
    } catch (e) { toast.error(String(e)); }
  };


  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={prestataire.libelle}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            {activeTab === "contrats" && (
              <HeaderButton icon={<Plus className="size-4" />} label="Nouveau contrat" onClick={openCreateContrat} />
            )}
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le prestataire" onClick={openEditPrest} />
            {!isInternal && (
              <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setDeletePrestOpen(true)} variant="destructive" />
            )}
          </TooltipProvider>
        </div>
      </PageHeader>

      {/* Fiche info */}
      <InfoCard imageId={prestataire.id_image} items={[
        { label: "Adresse", value: prestataire.adresse },
        { label: "Code postal", value: prestataire.code_postal },
        { label: "Ville", value: prestataire.ville },
        { label: "Téléphone", value: prestataire.telephone },
        { label: "Email", value: prestataire.email },
        { label: "Description", value: prestataire.description, span: 3 },
      ]} />

      {/* Onglets */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="contrats" className="flex-1">Contrats ({contrats.length})</TabsTrigger>
          <TabsTrigger value="gammes" className="flex-1">Gammes ({gammes.length})</TabsTrigger>
          <TabsTrigger value="ordres-travail" className="flex-1">Ordres de travail ({ots.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({prestDocs.length})</TabsTrigger>
        </TabsList>

        {/* Onglet Contrats */}
        <TabsContent value="contrats" className="mt-2 flex flex-1 flex-col min-h-0">
          <div className="flex flex-1 flex-col rounded-md border min-h-0">
          {contrats.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="Aucun contrat" description="Créez un contrat pour ce prestataire via le bouton ci-dessus." />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
              {contrats.map((c) => (
                <ContratCard
                  key={c.id_contrat}
                  contrat={c}
                  onSelect={() => setSelectedContratId(selectedContratId === c.id_contrat ? null : c.id_contrat)}
                  onEdit={() => { setSelectedContratId(c.id_contrat); setEditContratOpen(true); }}
                  onDelete={() => { setSelectedContratId(c.id_contrat); setDeleteContratOpen(true); }}
                  onResilier={() => { setSelectedContratId(c.id_contrat); setResilierOpen(true); }}
                  onAvenant={() => { setSelectedContratId(c.id_contrat); setAvenantOpen(true); }}
                  onAddDocument={() => { setDocContratId(c.id_contrat); setDocDialogOpen(true); }}
                  onDropFiles={async (files) => { setDocContratId(c.id_contrat); setDroppedFilesForContrat(files); setDocDialogOpen(true); }}
                  onPreviewDoc={handlePreview}
                />
              ))}

            </div>
          )}
          </div>
        </TabsContent>

        {/* Onglet Gammes */}
        <TabsContent value="gammes" className="mt-2 flex flex-1 flex-col min-h-0">
          <GammeList
            data={gammes}
            emptyTitle="Aucune gamme"
            emptyDescription="Aucune gamme n'est associée à ce prestataire."
          />
        </TabsContent>

        {/* Onglet Ordres de travail */}
        <TabsContent value="ordres-travail" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtList
            data={ots}
            emptyTitle="Aucun ordre de travail"
            emptyDescription="Les OT sont générés via les gammes associées à ce prestataire."
          />
        </TabsContent>

        {/* Onglet Documents */}
        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="prestataires" entityId={prestataireId} readonly />
        </TabsContent>
      </Tabs>

      {/* Dialog edit prestataire */}
      <CrudDialog
        open={editPrestOpen}
        onOpenChange={setEditPrestOpen}
        title="Modifier le prestataire"
        onSubmit={prestForm.handleSubmit(onSubmitEditPrest)}
      >
        <div className="flex gap-6">
          <ImagePicker value={prestForm.watch("id_image") ?? null} onChange={(v) => prestForm.setValue("id_image", v)} />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input {...prestForm.register("libelle")} />
              {prestForm.formState.errors.libelle && <p className="text-sm text-destructive">{String(prestForm.formState.errors.libelle.message)}</p>}
            </div>
            <div className="space-y-2"><Label>Description</Label><Input {...prestForm.register("description")} /></div>
            <div className="space-y-2"><Label>Adresse</Label><Input {...prestForm.register("adresse")} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Code postal</Label><Input {...prestForm.register("code_postal")} maxLength={5} /></div>
              <div className="space-y-2"><Label>Ville</Label><Input {...prestForm.register("ville")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Téléphone</Label><Input {...prestForm.register("telephone")} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" {...prestForm.register("email")} /></div>
            </div>
          </div>
        </div>
      </CrudDialog>

      {/* Dialog create contrat */}
      <CrudDialog
        open={createContratOpen}
        onOpenChange={setCreateContratOpen}
        title="Nouveau contrat"
        onSubmit={contratForm.handleSubmit(onSubmitCreateContrat)}
        submitLabel="Créer"
      >
        <div className="space-y-2">
          <Label>Type *</Label>
          <Select value={contratForm.watch("id_type_contrat") ? String(contratForm.watch("id_type_contrat")) : undefined} items={Object.fromEntries(typesContrats.map(t => [String(t.id_type_contrat), t.libelle]))} onValueChange={(v) => contratForm.setValue("id_type_contrat", Number(v))}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
            <SelectContent>
              {typesContrats.map((t) => <SelectItem key={t.id_type_contrat} value={String(t.id_type_contrat)}>{t.libelle}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ContratTypeFields form={contratForm} />
      </CrudDialog>

      {/* Dialogs contrat actions */}
      {selectedContrat && (
        <>
          <EditContratDialog
            open={editContratOpen} onOpenChange={setEditContratOpen}
            contrat={selectedContrat} prestataireLabel={prestataire.libelle} typesContrats={typesContrats}
            onSubmit={async (data) => {
              try {
                await updateContrat.mutateAsync({ id: selectedContrat.id_contrat, input: data as Record<string, unknown> });
                toast.success("Contrat modifié");
                setEditContratOpen(false);
              } catch (e) { toast.error(String(e)); }
            }}
            isLoading={updateContrat.isPending}
          />
          <ResilierContratDialog
            open={resilierOpen} onOpenChange={setResilierOpen}
            onSubmit={async (data) => {
              try {
                await resilierContrat.mutateAsync({ id: selectedContrat.id_contrat, input: data });
                toast.success("Contrat résilié");
                setResilierOpen(false);
              } catch (e) { toast.error(String(e)); }
            }}
            isLoading={resilierContrat.isPending}
          />
          <AvenantContratDialog
            open={avenantOpen} onOpenChange={setAvenantOpen}
            contrat={selectedContrat} prestataireLabel={prestataire.libelle} typesContrats={typesContrats}
            onSubmit={async (data) => {
              try {
                await createAvenant.mutateAsync({ input: data as Record<string, unknown> });
                toast.success("Avenant créé");
                setAvenantOpen(false);
              } catch (e) { toast.error(String(e)); }
            }}
            isLoading={createAvenant.isPending}
          />
        </>
      )}

      {/* Delete contrat */}
      <ConfirmDialog
        open={deleteContratOpen}
        onOpenChange={setDeleteContratOpen}
        title="Supprimer le contrat"
        description={`Êtes-vous sûr de vouloir supprimer le contrat #${selectedContratId} ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          if (!selectedContratId) return;
          try {
            await deleteContrat.mutateAsync({ id: selectedContratId });
            toast.success("Contrat supprimé");
          } catch (e) { toast.error(String(e)); }
          setDeleteContratOpen(false);
          setSelectedContratId(null);
        }}
      />

      {/* Delete prestataire */}
      <ConfirmDialog
        open={deletePrestOpen}
        onOpenChange={setDeletePrestOpen}
        title="Supprimer le prestataire"
        description="Cette action est irréversible. Les contrats actifs empêcheront la suppression."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deletePrestataire.mutateAsync({ id: prestataireId } as never);
            toast.success("Prestataire supprimé");
            navigate("/prestataires");
          } catch (e) { toast.error(String(e)); }
          setDeletePrestOpen(false);
        }}
      />

      {/* Prévisualisation document */}
      <DocumentPreviewDialog
        doc={previewDoc}
        previewData={previewData}
        onClose={() => { setPreviewDoc(null); setPreviewData(null); }}
        onDownload={handleDownload}
      />

      {/* Upload document contrat */}
      <UploadModal
        open={docDialogOpen}
        onOpenChange={(v) => { setDocDialogOpen(v); if (!v) { setDroppedFilesForContrat(undefined); setDocContratId(null); } }}
        onUpload={handleContratDocUpload}
        initialFiles={droppedFilesForContrat}
        defaultTypeId={contratTypeId}
        linkExisting={{
          linkedDocIds: docContratDocs.map((d) => d.id_document),
          onLink: linkExistingToContrat,
        }}
        namingContext={{
          prestataire: prestataire?.libelle,
          objet: contrats.find(c => c.id_contrat === docContratId)?.reference,
        }}
      />
    </div>
  );
}
