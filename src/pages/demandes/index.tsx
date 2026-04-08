import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertCircle, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { diCreateSchema } from "@/lib/schemas/demandes";
import { DiStatusBadge } from "@/components/shared/StatusBadge";
import { LocalisationCascadeSelect } from "@/components/shared/LocalisationCascadeSelect";
import { useDemandes, useCreateDemande, useCreateDemandeFromModele, useLinkDiLocalisation, useLinkDiEquipement } from "@/hooks/use-demandes";
import { useEquipementsByLocal, useEquipementsByLocalAndFamille, useLocalisationFilterByFamille } from "@/hooks/use-localisations";
import { useEquipements } from "@/hooks/use-equipements";
import { useModelesDi } from "@/hooks/use-referentiels";
import { usePrestataires } from "@/hooks/use-prestataires";
import { formatDate } from "@/lib/utils/format";
import type { DiListItem } from "@/lib/types/demandes";

function filterDi(r: DiListItem, q: string): boolean {
  return r.libelle_constat.toLowerCase().includes(q) || false;
}

export function DemandesList() {
  const navigate = useNavigate();
  const { data: demandes = [] } = useDemandes();
  const { data: modelesDi = [] } = useModelesDi();
  const { data: prestataires = [] } = usePrestataires();
  const createMutation = useCreateDemande();
  const createFromModele = useCreateDemandeFromModele();
  const linkLocalisation = useLinkDiLocalisation();
  const linkEquipement = useLinkDiEquipement();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState<number | null>(null);
  const [selectedEquipement, setSelectedEquipement] = useState<number | null>(null);
  const [selectedModeleId, setSelectedModeleId] = useState<number | null>(null);

  // Le modèle sélectionné
  const selectedModele = modelesDi.find(m => m.id_modele_di === selectedModeleId);
  const modeleFamilleId = selectedModele?.id_famille ?? null;
  const modeleEquipementId = selectedModele?.id_equipement ?? null;

  // Si le modèle cible un équipement précis, récupérer sa localisation
  const { data: allEquipements = [] } = useEquipements(modeleFamilleId ?? undefined);
  const modeleEquipement = modeleEquipementId ? allEquipements.find(e => e.id_equipement === modeleEquipementId) : null;
  const autoLocalId = modeleEquipement?.id_local ?? null;

  // Filtrage cascade : locaux/niveaux/bâtiments ayant des équipements de cette famille
  const { data: locFilter } = useLocalisationFilterByFamille(modeleFamilleId ?? 0);

  // Équipements filtrés par local + famille si applicable
  const { data: equipementsLocal = [] } = useEquipementsByLocal(selectedLocal ?? 0);
  const { data: equipementsFamille = [] } = useEquipementsByLocalAndFamille(selectedLocal ?? 0, modeleFamilleId ?? 0);
  const equipementsList = modeleFamilleId ? equipementsFamille : equipementsLocal;

  // Auto-remplir le local quand un modèle avec équipement précis est sélectionné
  useEffect(() => {
    if (autoLocalId && modeleEquipementId) {
      setSelectedLocal(autoLocalId);
    }
  }, [autoLocalId, modeleEquipementId]);

  const form = useForm({
    resolver: zodResolver(diCreateSchema),
    defaultValues: { id_prestataire: null, libelle_constat: "", description_constat: "", date_constat: new Date().toISOString().split("T")[0], description_resolution_suggeree: "" },
  });

  const openCreate = () => {
    form.reset({ id_prestataire: null, libelle_constat: "", description_constat: "", date_constat: new Date().toISOString().split("T")[0], description_resolution_suggeree: "" });
    setSelectedLocal(null);
    setSelectedEquipement(null);
    setSelectedModeleId(null);
    setDialogOpen(true);
  };

  const handleModeleChange = (modeleId: number | null) => {
    setSelectedModeleId(modeleId);
    setSelectedLocal(null);
    setSelectedEquipement(null);
    if (!modeleId) return;
    const m = modelesDi.find(x => x.id_modele_di === modeleId);
    if (!m) return;
    form.setValue("libelle_constat", m.libelle_constat);
    form.setValue("description_constat", m.description_constat);
    form.setValue("description_resolution_suggeree", m.description_resolution ?? "");
    // Si équipement précis ciblé → auto-remplir localisation + équipement
    if (m.id_equipement) {
      setSelectedEquipement(m.id_equipement);
      // Le local sera résolu via autoLocalId après le render (quand allEquipements est chargé)
    }
  };

  const onSubmit = async (formData: unknown) => {
    try {
      // Créer via modèle ou manuellement
      const result = selectedModeleId
        ? await createFromModele.mutateAsync({ idModeleDi: selectedModeleId })
        : await createMutation.mutateAsync({ input: formData } as never);
      // Lier la localisation et/ou l'équipement si sélectionnés
      if (selectedLocal) {
        await linkLocalisation.mutateAsync({ idDi: result.id_di, idLocal: selectedLocal });
      }
      if (selectedEquipement) {
        await linkEquipement.mutateAsync({ idDi: result.id_di, idEquipement: selectedEquipement });
      }
      toast.success("Demande créée");
      setDialogOpen(false);
      navigate(`/demandes/${result.id_di}`);
    } catch { /* géré par useInvokeMutation */ }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Demandes d'intervention">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Nouvelle demande" onClick={openCreate} />
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
            <p className="text-sm font-medium truncate">{r.libelle_constat}</p>
            <p className="text-xs text-muted-foreground truncate">{formatDate(r.date_constat)}</p>
          </div>
        )}
        renderRight={(r) => (
          <DiStatusBadge id={r.id_statut_di} />
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle demande d'intervention"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        {modelesDi.length > 0 && (
          <div className="space-y-2">
            <Label>Depuis un modèle</Label>
            <Select value={selectedModeleId ? String(selectedModeleId) : undefined} items={Object.fromEntries(modelesDi.map(m => [String(m.id_modele_di), m.nom_modele]))} onValueChange={(v) => handleModeleChange(v ? Number(v) : null)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="— Saisie manuelle —" /></SelectTrigger>
              <SelectContent>
                {modelesDi.map(m => <SelectItem key={m.id_modele_di} value={String(m.id_modele_di)}>{m.nom_modele}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Libellé du constat *</Label>
          <Input {...form.register("libelle_constat")} />
          {form.formState.errors.libelle_constat && <p className="text-sm text-destructive">{String(form.formState.errors.libelle_constat.message)}</p>}
        </div>
        <div className="space-y-2">
          <Label>Description du constat *</Label>
          <Textarea {...form.register("description_constat")} />
          {form.formState.errors.description_constat && <p className="text-sm text-destructive">{String(form.formState.errors.description_constat.message)}</p>}
        </div>
        <div className="space-y-2">
          <Label>Prestataire</Label>
          <Select
            value={form.watch("id_prestataire") ? String(form.watch("id_prestataire")) : undefined}
            items={Object.fromEntries(prestataires.filter(p => p.id_prestataire !== 1).map(p => [String(p.id_prestataire), p.libelle]))}
            onValueChange={(v) => form.setValue("id_prestataire", v ? Number(v) : null)}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="— Aucun (optionnel) —" /></SelectTrigger>
            <SelectContent>
              {prestataires.filter(p => p.id_prestataire !== 1).map(p => (
                <SelectItem key={p.id_prestataire} value={String(p.id_prestataire)}>{p.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Date du constat *</Label>
          <Input type="date" {...form.register("date_constat")} />
        </div>
        {/* Cascade localisation + équipement — masquée si équipement précis ciblé */}
        {modeleEquipementId ? (
          <div className="rounded-md border p-3 space-y-1 bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground">Ciblage automatique</p>
            <p className="text-sm">{modeleEquipement?.nom_affichage ?? "Chargement..."}</p>
          </div>
        ) : (
          <>
            <LocalisationCascadeSelect value={selectedLocal} onChange={(v) => { setSelectedLocal(v); setSelectedEquipement(null); }} filter={locFilter} />
            {selectedLocal && equipementsList.length > 0 && (
              <div className="space-y-2">
                <Label>Équipement{modeleFamilleId ? " *" : ""}</Label>
                <Select value={selectedEquipement ? String(selectedEquipement) : undefined} items={Object.fromEntries(equipementsList.map(e => [String(e.id_equipement), e.nom_affichage]))} onValueChange={(v) => setSelectedEquipement(v ? Number(v) : null)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={modeleFamilleId ? "— Sélectionner —" : "— Aucun (optionnel) —"} /></SelectTrigger>
                  <SelectContent>
                    {equipementsList.map(e => <SelectItem key={e.id_equipement} value={String(e.id_equipement)}>{e.nom_affichage}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </CrudDialog>
    </div>
  );
}
