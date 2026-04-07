import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Crosshair, FileUp, MapPin, Package, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { InfoCard } from "@/components/shared/InfoCard";
import { LocalisationCascadeSelect } from "@/components/shared/LocalisationCascadeSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { diResolutionSchema, type DiResolutionFormData } from "@/lib/schemas/demandes";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDemande, useDeleteDemande, useDiLocalisations, useLinkDiLocalisation, useUnlinkDiLocalisation, useDiEquipements, useLinkDiEquipement, useUnlinkDiEquipement, useResoudreDemande, useReouvrirDemande, useRepasserOuverteDemande } from "@/hooks/use-demandes";
import { useLocalisationsTree, useEquipementsByLocal } from "@/hooks/use-localisations";
import { getStatutDi } from "@/lib/utils/statuts";
import { formatDate } from "@/lib/utils/format";

export function DemandesDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const diId = Number(id);
  const { data: di, isLoading } = useDemande(diId);
  const deleteDi = useDeleteDemande();
  const { data: linkedLocalIds = [] } = useDiLocalisations(diId);
  const { data: linkedEquipements = [] } = useDiEquipements(diId);
  const { data: treeNodes = [] } = useLocalisationsTree();
  const linkLoc = useLinkDiLocalisation();
  const unlinkLoc = useUnlinkDiLocalisation();
  const linkEquip = useLinkDiEquipement();
  const unlinkEquip = useUnlinkDiEquipement();
  const resoudre = useResoudreDemande();
  const reouvrir = useReouvrirDemande();
  const repasserOuverte = useRepasserOuverteDemande();
  const [activeTab, setActiveTab] = useState("detail");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addLocOpen, setAddLocOpen] = useState(false);
  const [newLocalId, setNewLocalId] = useState<number | null>(null);
  const [newEquipId, setNewEquipId] = useState<number | null>(null);
  const { data: equipementsLocal = [] } = useEquipementsByLocal(newLocalId ?? 0);

  const resolveForm = useForm<DiResolutionFormData>({
    resolver: zodResolver(diResolutionSchema),
    defaultValues: { date_resolution: new Date().toISOString().split("T")[0], description_resolution: "" },
  });

  // Résoudre les IDs localisations en labels lisibles
  const linkedLocNodes = linkedLocalIds
    .map((id) => treeNodes.find((n) => n.id_local === id))
    .filter(Boolean) as typeof treeNodes;

  const isModifiable = di?.id_statut_di !== 2;

  const handleAddCiblage = async () => {
    if (!newLocalId) return;
    try {
      // Lier la localisation si pas déjà liée
      if (!linkedLocalIds.includes(newLocalId)) {
        await linkLoc.mutateAsync({ idDi: diId, idLocal: newLocalId });
      }
      // Lier l'équipement si sélectionné
      if (newEquipId) {
        await linkEquip.mutateAsync({ idDi: diId, idEquipement: newEquipId });
      }
      toast.success("Ciblage ajouté");
      setAddLocOpen(false);
      setNewLocalId(null);
      setNewEquipId(null);
    } catch { /* géré */ }
  };

  const handleRemoveLocalisation = async (idLocal: number) => {
    try {
      await unlinkLoc.mutateAsync({ idDi: diId, idLocal });
      toast.success("Localisation retirée");
    } catch { /* géré */ }
  };

  const handleRemoveEquipement = async (idEquipement: number) => {
    try {
      await unlinkEquip.mutateAsync({ idDi: diId, idEquipement });
      toast.success("Équipement retiré");
    } catch { /* géré */ }
  };

  if (isLoading) return <div className="p-4"><p className="text-sm text-muted-foreground">Chargement...</p></div>;
  if (!di) return <div className="p-4"><p className="text-sm text-destructive">Demande non trouvée.</p></div>;

  const statutCfg = getStatutDi(di.id_statut_di);

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
      <PageHeader title={`DI #${di.id_di} — ${di.libelle_constat}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium ${statutCfg.className ?? ""}`}>
            {statutCfg.label}
          </span>
          <TooltipProvider delay={300}>
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("di-doc-upload")?.click()} />
            )}
            {/* Ouverte → Résoudre */}
            {di.id_statut_di === 1 && (
              <HeaderButton icon={<Check className="size-4" />} label="Résoudre" onClick={() => { resolveForm.reset(); setResolveOpen(true); }} />
            )}
            {/* Résolue → Réouvrir */}
            {di.id_statut_di === 2 && (
              <HeaderButton icon={<RotateCcw className="size-4" />} label="Réouvrir" onClick={handleReouvrir} />
            )}
            {/* Réouverte → Résoudre ou Repasser en ouverte */}
            {di.id_statut_di === 3 && (
              <>
                <HeaderButton icon={<Check className="size-4" />} label="Résoudre" onClick={() => { resolveForm.reset(); setResolveOpen(true); }} />
                <HeaderButton icon={<Undo2 className="size-4" />} label="Repasser en ouverte" onClick={handleRepasserOuverte} />
              </>
            )}
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      {/* Fiche constat */}
      <InfoCard items={[
        { label: "Date du constat", value: formatDate(di.date_constat) },
        di.date_resolution ? { label: "Date résolution", value: formatDate(di.date_resolution) } : null,
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="detail" className="flex-1">Détail</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="detail" className="mt-2 flex flex-1 flex-col gap-3 overflow-y-auto no-scrollbar min-h-0">
          {/* Description constat */}
          <Card className="shrink-0">
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Description du constat</p>
              <p className="text-sm">{di.description_constat}</p>
              {di.description_resolution_suggeree && (
                <>
                  <p className="text-xs font-medium text-muted-foreground pt-2">Résolution suggérée</p>
                  <p className="text-sm">{di.description_resolution_suggeree}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Résolution (si résolue) */}
          {di.description_resolution && (
            <Card className="shrink-0">
              <CardContent className="py-3 px-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Résolution</p>
                <p className="text-sm">{di.description_resolution}</p>
              </CardContent>
            </Card>
          )}

          {/* Ciblage : localisations + équipements */}
          <Card className="shrink-0">
            <CardContent className="py-3 px-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Crosshair className="size-3.5" />
                  Ciblage
                </p>
                {isModifiable && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setNewLocalId(null); setNewEquipId(null); setAddLocOpen(true); }}>
                    <Plus className="size-3.5 mr-1" />
                    Ajouter
                  </Button>
                )}
              </div>

              {/* Localisations liées */}
              {linkedLocNodes.map((node) => (
                <div key={`loc-${node.id_local}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate">{node.label}</span>
                  </div>
                  {isModifiable && (
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveLocalisation(node.id_local)}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}

              {/* Équipements liés */}
              {linkedEquipements.map((eq) => (
                <div key={`eq-${eq.id_equipement}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{eq.nom_affichage}</span>
                      {eq.localisation_label && (
                        <span className="text-xs text-muted-foreground truncate block">{eq.localisation_label}</span>
                      )}
                    </div>
                  </div>
                  {isModifiable && (
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveEquipement(eq.id_equipement)}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}

              {/* État vide */}
              {linkedLocNodes.length === 0 && linkedEquipements.length === 0 && !addLocOpen && (
                <p className="text-sm text-muted-foreground">Aucun ciblage défini.</p>
              )}

              {/* Formulaire d'ajout cascade */}
              {addLocOpen && (
                <div className="space-y-2 rounded-md border p-3">
                  <LocalisationCascadeSelect value={newLocalId} onChange={(v) => { setNewLocalId(v); setNewEquipId(null); }} />
                  {newLocalId && equipementsLocal.length > 0 && (
                    <div className="space-y-2">
                      <Label>Équipement</Label>
                      <Select value={newEquipId ? String(newEquipId) : undefined} items={Object.fromEntries(equipementsLocal.map(e => [String(e.id_equipement), e.nom_affichage]))} onValueChange={(v) => setNewEquipId(v ? Number(v) : null)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="— Aucun (optionnel) —" /></SelectTrigger>
                        <SelectContent>
                          {equipementsLocal.map(e => <SelectItem key={e.id_equipement} value={String(e.id_equipement)}>{e.nom_affichage}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAddLocOpen(false)}>Annuler</Button>
                    <Button size="sm" disabled={!newLocalId || (linkedLocalIds.includes(newLocalId) && !newEquipId)} onClick={handleAddCiblage}>Ajouter</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="di" entityId={diId} inputId="di-doc-upload" hideAddButton />
        </TabsContent>
      </Tabs>

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
          <Textarea {...resolveForm.register("description_resolution")} />
          {resolveForm.formState.errors.description_resolution && <p className="text-sm text-destructive">{String(resolveForm.formState.errors.description_resolution.message)}</p>}
        </div>
      </CrudDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette demande ?"
        description={`La demande « ${di.libelle_constat} » sera supprimée définitivement avec toutes ses liaisons.`}
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
