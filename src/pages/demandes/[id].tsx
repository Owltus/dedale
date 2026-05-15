import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, FileUp, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { InfoCard } from "@/components/shared/InfoCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { diResolutionSchema, type DiResolutionFormData } from "@/lib/schemas/demandes";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { DiEditDialog } from "./DiEditDialog";
import { useDocumentsForEntity } from "@/hooks/use-documents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDemande, useDeleteDemande, useDiLocalisations, useDiEquipements, useResoudreDemande, useReouvrirDemande, useRepasserOuverteDemande } from "@/hooks/use-demandes";
import { useLocalisationsTree } from "@/hooks/use-localisations";
import { usePrestataires } from "@/hooks/use-prestataires";
import { getStatutDi } from "@/lib/utils/statuts";
import { constatTitle, formatDate } from "@/lib/utils/format";

export function DemandesDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const diId = Number(id);
  const { data: di, isLoading } = useDemande(diId);
  const { data: docs = [] } = useDocumentsForEntity("di", diId);
  const deleteDi = useDeleteDemande();
  const { data: prestataires = [] } = usePrestataires();
  const { data: linkedLocalIds = [] } = useDiLocalisations(diId);
  const { data: linkedEquipements = [] } = useDiEquipements(diId);
  const { data: treeNodes = [] } = useLocalisationsTree();
  const resoudre = useResoudreDemande();
  const reouvrir = useReouvrirDemande();
  const repasserOuverte = useRepasserOuverteDemande();
  const [activeTab, setActiveTab] = useState("detail");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const resolveForm = useForm<DiResolutionFormData>({
    resolver: zodResolver(diResolutionSchema),
    defaultValues: { date_resolution: "", description_resolution: "" },
  });

  // Réinitialise le dialog de résolution en réutilisant l'historique si présent
  // (cas réouverture) — sinon champs vides à remplir par l'utilisateur.
  const openResolveDialog = () => {
    if (!di) return;
    resolveForm.reset({
      date_resolution: di.date_resolution ?? "",
      description_resolution: di.description_resolution ?? "",
    });
    setResolveOpen(true);
  };

  // Résoudre les IDs localisations en labels lisibles
  const linkedLocNodes = linkedLocalIds
    .map((id) => treeNodes.find((n) => n.id_local === id))
    .filter(Boolean) as typeof treeNodes;

  if (isLoading) return <div className="p-4"><p className="text-sm text-muted-foreground">Chargement...</p></div>;
  if (!di) return <div className="p-4"><p className="text-sm text-destructive">Demande non trouvée.</p></div>;

  const statutCfg = getStatutDi(di.id_statut_di);
  const prestataireLabel = di.id_prestataire
    ? prestataires.find((p) => p.id_prestataire === di.id_prestataire)?.libelle ?? null
    : null;
  const localisationsValue = linkedLocNodes.map((n) => n.label).join(" · ") || null;
  const equipementsValue = linkedEquipements.map((e) => e.nom_affichage).join(" · ") || null;

  const handleResoudre = async (data: unknown) => {
    try {
      await resoudre.mutateAsync({ id: diId, input: data } as never);
      toast.success("Demande résolue");
      setResolveOpen(false);
    } catch { /* géré */ }
  };

  const handleReouvrir = async () => {
    try {
      await reouvrir.mutateAsync({ id: diId });
      toast.success("Demande réouverte");
    } catch { /* géré */ }
  };

  const handleRepasserOuverte = async () => {
    try {
      await repasserOuverte.mutateAsync({ id: diId });
      toast.success("Demande repassée en ouverte");
    } catch { /* géré */ }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={`DI #${di.id_di}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium ${statutCfg.className ?? ""}`}>
            {statutCfg.label}
          </span>
          <TooltipProvider delay={300}>
            <HeaderButton
              icon={<Pencil className="size-4" />}
              label="Éditer la demande"
              onClick={() => setEditOpen(true)}
            />
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("di-doc-upload")?.click()} />
            )}
            {/* Ouverte → Résoudre */}
            {di.id_statut_di === 1 && (
              <HeaderButton icon={<Check className="size-4" />} label="Résoudre" onClick={openResolveDialog} />
            )}
            {/* Résolue → Réouvrir */}
            {di.id_statut_di === 2 && (
              <HeaderButton icon={<RotateCcw className="size-4" />} label="Réouvrir" onClick={handleReouvrir} />
            )}
            {/* Réouverte → Résoudre ou Repasser en ouverte */}
            {di.id_statut_di === 3 && (
              <>
                <HeaderButton icon={<Check className="size-4" />} label="Résoudre" onClick={openResolveDialog} />
                <HeaderButton icon={<Undo2 className="size-4" />} label="Repasser en ouverte" onClick={handleRepasserOuverte} />
              </>
            )}
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      {/* Fiche de présentation — la date de résolution n'est affichée que si la DI
          est effectivement résolue (statut 2). Sur une DI rouverte ou repassée en
          ouverte, l'ancienne date reste en DB mais la masquer ici évite la dissonance
          « statut Ouverte + date de résolution remplie ». */}
      <InfoCard items={[
        { label: "Date du constat", value: formatDate(di.date_constat) },
        di.id_statut_di === 2 ? { label: "Date résolution", value: formatDate(di.date_resolution) } : null,
        { label: "Prestataire", value: prestataireLabel },
        { label: "Localisations", value: localisationsValue, span: 2 },
        { label: "Équipements", value: equipementsValue, span: 2 },
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="detail" className="flex-1">Détail</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="detail" className="mt-2 flex flex-1 flex-col gap-3 overflow-y-auto no-scrollbar min-h-0">
          {/* Constat */}
          <Card className="shrink-0">
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Constat</p>
              <p className="text-sm whitespace-pre-wrap">{di.constat}</p>
            </CardContent>
          </Card>

          {/* Résolution (si résolue) */}
          {di.description_resolution && (
            <Card className="shrink-0">
              <CardContent className="py-3 px-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résolution</p>
                <p className="text-sm whitespace-pre-wrap">{di.description_resolution}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="di" entityId={diId} inputId="di-doc-upload" hideAddButton
            namingContext={{ prestataire: prestataireLabel ?? undefined, objet: constatTitle(di.constat), date: di.date_resolution ?? di.date_constat }} />
        </TabsContent>
      </Tabs>

      {/* Dialog édition */}
      <DiEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        di={di}
        linkedLocalIds={linkedLocalIds}
        linkedEquipements={linkedEquipements}
      />

      {/* Dialog résolution */}
      <CrudDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title="Résoudre la demande"
        onSubmit={resolveForm.handleSubmit(handleResoudre)}
        submitLabel="Résoudre"
      >
        <div className="space-y-2">
          <Label>Date de résolution *</Label>
          <Input type="date" {...resolveForm.register("date_resolution")} />
          {resolveForm.formState.errors.date_resolution && <p className="text-sm text-destructive">{String(resolveForm.formState.errors.date_resolution.message)}</p>}
        </div>
        <div className="space-y-2">
          <Label>Description de la résolution *</Label>
          <Textarea autoFocus {...resolveForm.register("description_resolution")} />
          {resolveForm.formState.errors.description_resolution && <p className="text-sm text-destructive">{String(resolveForm.formState.errors.description_resolution.message)}</p>}
        </div>
      </CrudDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette demande ?"
        description={`La demande « ${constatTitle(di.constat)} » sera supprimée définitivement avec toutes ses liaisons.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteDi.mutateAsync({ id: diId });
            toast.success("Demande supprimée");
            navigate("/demandes");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
