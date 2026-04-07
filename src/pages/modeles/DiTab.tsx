import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { modeleDiSchema, type ModeleDiFormData } from "@/lib/schemas/referentiels";
import { useModelesDi, useCreateModeleDi } from "@/hooks/use-referentiels";
import { useFamilles, useEquipements } from "@/hooks/use-equipements";
import { formatDate } from "@/lib/utils/format";
import type { ModeleDi } from "@/lib/types/referentiels";
import type { ModelesOutletContext } from "./index";

function filterModeleDi(r: ModeleDi, q: string): boolean {
  return r.nom_modele.toLowerCase().includes(q) || r.libelle_constat.toLowerCase().includes(q) || false;
}

export function DiTab() {
  const { addSignal } = useOutletContext<ModelesOutletContext>();
  const { data: modeles = [] } = useModelesDi();
  const { data: familles = [] } = useFamilles();
  const createMutation = useCreateModeleDi();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<ModeleDiFormData>({
    resolver: typedResolver(modeleDiSchema),
    defaultValues: {
      nom_modele: "",
      description: "",
      id_famille: null as number | null,
      id_equipement: null as number | null,
      libelle_constat: "",
      description_constat: "",
      description_resolution: "",
    },
  });

  const [lastSignal, setLastSignal] = useState(0);
  if (addSignal > 0 && addSignal !== lastSignal) {
    setLastSignal(addSignal);
    form.reset({
      nom_modele: "", description: "", id_famille: null, id_equipement: null,
      libelle_constat: "", description_constat: "", description_resolution: "",
    });
    setDialogOpen(true);
  }

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync({ input: data } as never);
      toast.success("Modèle créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const watchedFamille = form.watch("id_famille");
  const { data: equipementsFamille = [] } = useEquipements(watchedFamille ?? undefined);

  return (
    <>
      <CardList
        data={modeles}
        getKey={(r) => r.id_modele_di}
        getHref={(r) => `/modeles/di/${r.id_modele_di}`}
        filterFn={filterModeleDi}
        icon={<FileText className="size-5 text-muted-foreground" />}
        title="Modèles"
        emptyTitle="Aucun modèle"
        emptyDescription="Créez un modèle pour pré-remplir les demandes d'intervention."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom_modele}</p>
            <p className="text-xs text-muted-foreground truncate">
              {r.libelle_constat}
            </p>
          </div>
        )}
        renderRight={(r) => (
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.date_creation)}</span>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau modèle de DI"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_modele">Nom du modèle *</Label>
            <Input id="nom_modele" {...form.register("nom_modele")} />
            {form.formState.errors.nom_modele && (
              <p className="text-sm text-destructive">{String(form.formState.errors.nom_modele.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>
          {familles.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="id_famille">Famille d'équipement</Label>
              <Select
                value={form.watch("id_famille") ? String(form.watch("id_famille")) : undefined}
                items={Object.fromEntries(familles.map((f) => [String(f.id_famille), f.nom_famille]))}
                onValueChange={(v) => { form.setValue("id_famille", v ? Number(v) : null); form.setValue("id_equipement", null); }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="— Aucune (optionnel) —" /></SelectTrigger>
                <SelectContent>
                  {familles.map((f) => (
                    <SelectItem key={f.id_famille} value={String(f.id_famille)}>{f.nom_famille}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {watchedFamille && equipementsFamille.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="id_equipement">Équipement précis</Label>
              <Select
                value={form.watch("id_equipement") ? String(form.watch("id_equipement")) : undefined}
                items={Object.fromEntries(equipementsFamille.map((e) => [String(e.id_equipement), e.nom_affichage]))}
                onValueChange={(v) => form.setValue("id_equipement", v ? Number(v) : null)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="— Tous (optionnel) —" /></SelectTrigger>
                <SelectContent>
                  {equipementsFamille.map((e) => (
                    <SelectItem key={e.id_equipement} value={String(e.id_equipement)}>{e.nom_affichage}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="libelle_constat">Libellé du constat *</Label>
            <Input id="libelle_constat" {...form.register("libelle_constat")} />
            {form.formState.errors.libelle_constat && (
              <p className="text-sm text-destructive">{String(form.formState.errors.libelle_constat.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description_constat">Description du constat *</Label>
            <Textarea id="description_constat" {...form.register("description_constat")} />
            {form.formState.errors.description_constat && (
              <p className="text-sm text-destructive">{String(form.formState.errors.description_constat.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description_resolution">Résolution suggérée</Label>
            <Textarea id="description_resolution" {...form.register("description_resolution")} />
          </div>
        </div>
      </CrudDialog>
    </>
  );
}
