import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { BookOpen, Cpu, FileUp, LayersPlus, Link, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { OtList } from "@/components/shared/OtList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { InfoCard } from "@/components/shared/InfoCard";
import { CardList } from "@/components/shared/CardList";
import { ActionButtons } from "@/components/shared/ActionButtons";
import type { Operation } from "@/lib/types/gammes";
import { useGamme, useUpdateGamme, useDeleteGamme, useOperations, useCreateOperation, useUpdateOperation, useDeleteOperation, useGammeModeles, useLinkModeleOperation, useUnlinkModeleOperation, useFamilleGamme, useDomaineGamme, useGammeEquipements, useLinkGammeEquipement, useLinkGammeEquipementsBatch, useUnlinkGammeEquipement } from "@/hooks/use-gammes";
import { usePrestataires } from "@/hooks/use-prestataires";
import { usePeriodicites } from "@/hooks/use-referentiels";
import { useEquipements } from "@/hooks/use-equipements";
import { useModelesOperations } from "@/hooks/use-modeles-operations";
import { useOtByGamme, useCreateOrdreTravail } from "@/hooks/use-ordres-travail";
import { useTechniciens } from "@/hooks/use-techniciens";
import { useTypesOperations, useUnites } from "@/hooks/use-referentiels";
import { otCreateSchema } from "@/lib/schemas/ordres-travail";
import type { GammeEditFormData } from "@/lib/schemas/gammes";
import type { OperationFormData } from "@/lib/schemas/gammes";
import type { Equipement } from "@/lib/types/equipements";
import type { ModeleOperation } from "@/lib/types/gammes";
import { EquipementLinkDialog } from "./EquipementLinkDialog";
import { GammeEditDialog } from "./GammeEditDialog";
import { OperationDialog } from "./OperationDialog";

function filterOperation(op: Operation, q: string): boolean {
  return op.nom_operation.toLowerCase().includes(q) || op.description?.toLowerCase().includes(q) || false;
}

function filterModeleOperation(m: ModeleOperation, q: string): boolean {
  return m.nom_modele.toLowerCase().includes(q);
}

function filterEquipement(eq: Equipement, q: string): boolean {
  return eq.nom_affichage.toLowerCase().includes(q);
}

export function GammesDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const gammeId = Number(id);

  // Données
  const { data: gamme, isLoading } = useGamme(gammeId);
  const { data: operations = [] } = useOperations(gammeId);
  const { data: ots = [] } = useOtByGamme(gammeId);
  const { data: famille } = useFamilleGamme(gamme?.id_famille_gamme ?? 0);
  const { data: domaine } = useDomaineGamme(famille?.id_domaine_gamme ?? 0);
  const { data: techniciens = [] } = useTechniciens();
  const { data: typesOps = [] } = useTypesOperations();
  const { data: unites = [] } = useUnites();
  const { data: prestataires = [] } = usePrestataires();
  const { data: periodicites = [] } = usePeriodicites();
  const { data: gammeEquipements = [] } = useGammeEquipements(gammeId);
  const { data: allEquipements = [] } = useEquipements();
  const linkGammeEquipement = useLinkGammeEquipement();
  const linkGammeEquipementsBatch = useLinkGammeEquipementsBatch();
  const unlinkGammeEquipement = useUnlinkGammeEquipement();
  const { data: modeleIds = [] } = useGammeModeles(gammeId);
  const { data: allModeles = [] } = useModelesOperations();
  const linkModele = useLinkModeleOperation();
  const unlinkModele = useUnlinkModeleOperation();

  // Mutations
  const updateGamme = useUpdateGamme();
  const deleteGamme = useDeleteGamme();
  const createOp = useCreateOperation();
  const updateOp = useUpdateOperation();
  const deleteOp = useDeleteOperation();
  const createOt = useCreateOrdreTravail();

  // State
  const [activeTab, setActiveTab] = useState("ot");
  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [deleteOpTarget, setDeleteOpTarget] = useState<Operation | null>(null);
  const [otDialogOpen, setOtDialogOpen] = useState(false);
  const [modeleDialogOpen, setModeleDialogOpen] = useState(false);
  const [editGammeOpen, setEditGammeOpen] = useState(false);
  const [confirmDeleteGamme, setConfirmDeleteGamme] = useState(false);
  const [equipDialogOpen, setEquipDialogOpen] = useState(false);

  // Breadcrumb
  useSetBreadcrumbTrail(domaine && famille && gamme ? [
    { label: "Gammes", path: "/gammes" },
    { label: domaine.nom_domaine, path: `/gammes/domaines/${famille.id_domaine_gamme}` },
    { label: famille.nom_famille, path: `/gammes/familles/${gamme.id_famille_gamme}` },
    { label: gamme.nom_gamme, path: `/gammes/${id}` },
  ] : []);

  // ── Opérations CRUD ──

  const openCreateOp = () => {
    setEditingOp(null);
    setOpDialogOpen(true);
  };

  const openEditOp = (op: Operation) => {
    setEditingOp(op);
    setOpDialogOpen(true);
  };

  const onSubmitOp = async (input: OperationFormData, isEdit: boolean) => {
    try {
      if (isEdit && editingOp) { await updateOp.mutateAsync({ id: editingOp.id_operation, input } as never); }
      else { await createOp.mutateAsync({ input } as never); }
      toast.success("Opération enregistrée");
      setOpDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const onDeleteOp = async () => {
    if (!deleteOpTarget) return;
    try {
      await deleteOp.mutateAsync({ id: deleteOpTarget.id_operation } as never);
      toast.success("Opération supprimée");
    } catch (e) { toast.error(String(e)); }
    setDeleteOpTarget(null);
  };

  // ── Gamme edit ──

  const onSubmitEditGamme = async (input: GammeEditFormData) => {
    try {
      await updateGamme.mutateAsync({ id: gammeId, input: {
        ...input,
        id_famille_gamme: gamme!.id_famille_gamme,
      } } as never);
      toast.success("Gamme modifiée");
      setEditGammeOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const linkedTypes = allModeles.filter((m) => modeleIds.includes(m.id_modele_operation));
  const availableTypes = allModeles.filter((m) => !modeleIds.includes(m.id_modele_operation));

  const handleLinkType = async (idModeleOperation: number) => {
    try {
      await linkModele.mutateAsync({ idGamme: gammeId, idModeleOperation } as never);
      toast.success("Modèle associé");
    } catch (e) { toast.error(String(e)); }
  };

  const handleUnlinkType = async (idModeleOperation: number) => {
    try {
      await unlinkModele.mutateAsync({ idGamme: gammeId, idModeleOperation } as never);
      toast.success("Modèle dissocié");
    } catch (e) { toast.error(String(e)); }
  };

  const otForm = useForm({
    resolver: typedResolver(otCreateSchema),
    defaultValues: { id_gamme: gammeId, date_prevue: "", id_priorite: 3, id_technicien: null, id_di: null, commentaires: "" },
  });

  const openCreateOt = () => {
    otForm.reset({ id_gamme: gammeId, date_prevue: "", id_priorite: 3, id_technicien: null, id_di: null, commentaires: "" });
    setOtDialogOpen(true);
  };

  const onCreateOt = async (data: Record<string, unknown>) => {
    try {
      await createOt.mutateAsync({ input: data } as never);
      toast.success("Ordre de travail créé");
      setOtDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // ── Rendu ──

  if (isLoading) return <div className="p-6"><p className="text-sm text-muted-foreground">Chargement...</p></div>;
  if (!gamme) return <div className="p-6"><p className="text-sm text-destructive">Gamme non trouvée.</p></div>;

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={gamme.nom_gamme}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium ${gamme.est_active === 1 ? "border-green-400 text-green-700" : "border-muted-foreground/40 text-muted-foreground"}`}>
            {gamme.est_active === 1 ? "Active" : "Inactive"}
          </span>
          <TooltipProvider delay={300}>
            {activeTab === "operations" && (
              <HeaderButton icon={<LayersPlus className="size-4" />} label="Ajouter une opération" onClick={openCreateOp} />
            )}
            {activeTab === "ot" && (
              <HeaderButton icon={<Plus className="size-4" />} label="Créer un OT" onClick={openCreateOt} />
            )}
            {activeTab === "modeles" && (
              <HeaderButton icon={<LayersPlus className="size-4" />} label="Associer un modèle" onClick={() => setModeleDialogOpen(true)} />
            )}
            {activeTab === "equipements" && (
              <HeaderButton icon={<Link className="size-4" />} label="Lier des équipements" onClick={() => setEquipDialogOpen(true)} />
            )}
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("gamme-doc-upload")?.click()} />
            )}
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier" onClick={() => setEditGammeOpen(true)} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setConfirmDeleteGamme(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <InfoCard imageId={gamme.id_image} items={[
        { label: "Famille", value: famille?.nom_famille },
        { label: "Périodicité", value: periodicites.find(p => p.id_periodicite === gamme.id_periodicite)?.libelle },
        { label: "Prestataire", value: prestataires.find(p => p.id_prestataire === gamme.id_prestataire)?.libelle },
        { label: "Réglementaire", value: gamme.est_reglementaire === 1 ? "Oui" : "Non" },
        { label: "Localisation", value: gamme.nom_localisation_calc },
      ]} />

      {gamme.description && (
        <Card className="shrink-0">
          <CardContent className="py-3 px-4">
            <p className="text-xs">{gamme.description}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="ot" className="flex-1">Ordres de travail ({ots.length})</TabsTrigger>
          <TabsTrigger value="operations" className="flex-1">Opérations spécifiques ({operations.length})</TabsTrigger>
          <TabsTrigger value="modeles" className="flex-1">Opérations modèle ({linkedTypes.length})</TabsTrigger>
          <TabsTrigger value="equipements" className="flex-1">Équipements ({gammeEquipements.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-2 flex flex-1 flex-col min-h-0">
          <CardList
            data={operations}
            getKey={(op) => op.id_operation}
            filterFn={filterOperation}
            icon={<ListChecks className="size-5 text-muted-foreground" />}
            showTitle={false}
            showSearch={false}
            emptyTitle="Aucune opération"
            emptyDescription="Ajoutez des opérations spécifiques via le bouton ci-dessus."
            renderContent={(op) => (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{op.nom_operation}</p>
                <p className="text-xs text-muted-foreground truncate">{op.description ?? "\u00A0"}</p>
              </div>
            )}
            renderRight={(op) => (
              <ActionButtons
                onEdit={() => openEditOp(op)}
                onDelete={() => setDeleteOpTarget(op)}
              />
            )}
          />
        </TabsContent>

        <TabsContent value="ot" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtList
            data={ots}
            emptyTitle="Aucun ordre de travail"
            emptyDescription="Créez un OT pour planifier l'exécution de cette gamme."
          />
        </TabsContent>

        <TabsContent value="modeles" className="mt-2 flex flex-1 flex-col min-h-0">
          <CardList
            data={linkedTypes}
            getKey={(m) => m.id_modele_operation}
            getHref={(m) => `/modeles-operations/${m.id_modele_operation}`}
            filterFn={filterModeleOperation}
            icon={<BookOpen className="size-5 text-muted-foreground" />}
            showTitle={false}
            showSearch={false}
            emptyTitle="Aucun modèle associé"
            emptyDescription="Associez un modèle d'opérations via le bouton ci-dessus."
            renderContent={(m) => (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.nom_modele}</p>
                <p className="text-xs text-muted-foreground truncate">{m.description ?? "\u00A0"}</p>
              </div>
            )}
            renderRight={(m) => (
              <ActionButtons onDelete={() => handleUnlinkType(m.id_modele_operation)} />
            )}
          />
        </TabsContent>

        <TabsContent value="equipements" className="mt-2 flex flex-1 flex-col min-h-0">
          <CardList
            data={gammeEquipements}
            getKey={(eq) => eq.id_equipement}
            getHref={(eq) => `/equipements/${eq.id_equipement}`}
            filterFn={filterEquipement}
            icon={<Cpu className="size-5 text-muted-foreground" />}
            showTitle={false}
            showSearch={false}
            emptyTitle="Aucun équipement lié"
            emptyDescription="Liez des équipements à cette gamme via le bouton ci-dessus."
            renderContent={(eq) => (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{eq.nom_affichage}</p>
                <p className="text-xs text-muted-foreground truncate">{"\u00A0"}</p>
              </div>
            )}
            renderRight={(eq) => (
              <ActionButtons
                onDelete={() => {
                  unlinkGammeEquipement.mutateAsync({ idGamme: gammeId, idEquipement: eq.id_equipement } as never)
                    .then(() => toast.success("Équipement retiré"))
                    .catch((err: unknown) => toast.error(String(err)));
                }}
              />
            )}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="gammes" entityId={gammeId} inputId="gamme-doc-upload" hideAddButton />
        </TabsContent>
      </Tabs>

      {/* Dialog opération */}
      <OperationDialog
        open={opDialogOpen}
        onOpenChange={setOpDialogOpen}
        gammeId={gammeId}
        editingOp={editingOp}
        typesOps={typesOps}
        unites={unites}
        onSubmit={onSubmitOp}
      />

      {/* Confirmation suppression opération */}
      <ConfirmDialog
        open={!!deleteOpTarget}
        onOpenChange={(open) => !open && setDeleteOpTarget(null)}
        title="Supprimer l'opération"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleteOpTarget?.nom_operation} » ?`}
        onConfirm={onDeleteOp}
      />

      {/* Dialog association modèle */}
      <Dialog open={modeleDialogOpen} onOpenChange={setModeleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associer un modèle d'opérations</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {availableTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Tous les modèles sont déjà associés.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {availableTypes.map((m) => (
                  <button
                    key={m.id_modele_operation}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-b-0"
                    onClick={async () => { await handleLinkType(m.id_modele_operation); setModeleDialogOpen(false); }}
                  >
                    <div>
                      <div className="font-medium">{m.nom_modele}</div>
                      {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                    </div>
                    <Plus className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Gérer les modèles sur la page{" "}
              <a href="/modeles-operations" onClick={(e) => { e.preventDefault(); setModeleDialogOpen(false); navigate("/modeles-operations"); }} className="text-primary underline hover:no-underline">
                Gammes types
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog création OT */}
      <CrudDialog
        open={otDialogOpen}
        onOpenChange={setOtDialogOpen}
        title="Créer un ordre de travail"
        onSubmit={otForm.handleSubmit(onCreateOt, (errors) => {
          const msgs = Object.entries(errors).map(([k, v]) => `${k}: ${v?.message}`).join(", ");
          toast.error(`Validation : ${msgs}`);
        })}
        submitLabel="Créer"
      >
        <div className="space-y-2">
          <Label htmlFor="date_prevue">Date prévue *</Label>
          <Input id="date_prevue" type="date" {...otForm.register("date_prevue")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="id_priorite">Priorité</Label>
          <Select value={String(otForm.watch("id_priorite") ?? 3)} items={{ "1": "Critique", "2": "Haute", "3": "Normale", "4": "Basse" }} onValueChange={(v) => otForm.setValue("id_priorite", Number(v))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Critique</SelectItem>
              <SelectItem value="2">Haute</SelectItem>
              <SelectItem value="3">Normale</SelectItem>
              <SelectItem value="4">Basse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="id_technicien">Technicien</Label>
          <Select value={otForm.watch("id_technicien") ? String(otForm.watch("id_technicien")) : undefined} items={Object.fromEntries(techniciens.map(t => [String(t.id_technicien), `${t.nom} ${t.prenom}`]))} onValueChange={(v) => otForm.setValue("id_technicien", v ? Number(v) : null)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— Aucun —" /></SelectTrigger>
            <SelectContent>
              {techniciens.map((t) => <SelectItem key={t.id_technicien} value={String(t.id_technicien)}>{t.nom} {t.prenom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commentaires">Commentaires</Label>
          <Input id="commentaires" {...otForm.register("commentaires")} />
        </div>
      </CrudDialog>

      {/* Dialog édition gamme */}
      <GammeEditDialog
        open={editGammeOpen}
        onOpenChange={setEditGammeOpen}
        gamme={gamme}
        periodicites={periodicites}
        prestataires={prestataires}
        onSubmit={onSubmitEditGamme}
      />

      {/* Confirmation suppression gamme */}
      <ConfirmDialog
        open={confirmDeleteGamme}
        onOpenChange={setConfirmDeleteGamme}
        title="Supprimer cette gamme ?"
        description={`La gamme « ${gamme.nom_gamme} » et toutes ses opérations spécifiques seront supprimées.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteGamme.mutateAsync({ id: gammeId } as never);
            toast.success("Gamme supprimée");
            navigate(`/gammes/familles/${gamme.id_famille_gamme}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteGamme(false);
        }}
      />

      {/* Dialog liaison équipements — groupé par famille avec liaison en masse */}
      <EquipementLinkDialog
        open={equipDialogOpen}
        onOpenChange={setEquipDialogOpen}
        gammeId={gammeId}
        linkedEquipements={gammeEquipements}
        allEquipements={allEquipements}
        linkMutation={linkGammeEquipement}
        batchLinkMutation={linkGammeEquipementsBatch}
      />
    </div>
  );
}

