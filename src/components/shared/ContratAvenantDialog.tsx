import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avenantSchema } from "@/lib/schemas/contrats";
import type { Contrat } from "@/lib/types/contrats";
import type { Prestataire } from "@/lib/types/prestataires";
import type { TypeContrat } from "@/lib/types/referentiels";
import { contratDefaults, SelectField, ContratTypeFields } from "./contrat-dialog-helpers";

interface AvenantDialogProps {
  open: boolean; onOpenChange: (v: boolean) => void; contrat: Contrat;
  prestataires: Prestataire[]; typesContrats: TypeContrat[];
  onSubmit: (data: unknown) => Promise<void>; isLoading: boolean;
}

/// Dialogue de création d'un avenant (pré-rempli depuis le contrat courant)
export function AvenantContratDialog({ open, onOpenChange, contrat, prestataires, typesContrats, onSubmit, isLoading }: AvenantDialogProps) {
  const defaults = () => ({
    id_contrat_parent: contrat.id_contrat, objet_avenant: "",
    ...contratDefaults(contrat),
    date_debut: contrat.date_fin ?? contrat.date_debut, date_fin: "", date_signature: "",
  });
  const form = useForm({
    resolver: typedResolver(avenantSchema),
    defaultValues: defaults(),
  });
  useEffect(() => { if (open) form.reset(defaults()); }, [open, contrat, form]);

  const prestOpts = prestataires.filter(p => p.id_prestataire !== 1).map(p => ({ key: p.id_prestataire, value: p.id_prestataire, label: p.libelle }));
  const typeOpts = typesContrats.map(t => ({ key: t.id_type_contrat, value: t.id_type_contrat, label: t.libelle }));
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Créer un avenant</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Objet de l'avenant *</Label>
            <Input {...form.register("objet_avenant")} placeholder="Ex: Prolongation 1 an" />
            {e.objet_avenant && <p className="text-sm text-destructive">{String(e.objet_avenant.message)}</p>}
          </div>
          <SelectField id="av-prest" label="Prestataire *" value={form.watch("id_prestataire")}
            options={prestOpts} onChange={v => form.setValue("id_prestataire", v)} error={e.id_prestataire ? String(e.id_prestataire.message) : undefined} />
          <SelectField id="av-type" label="Type *" value={form.watch("id_type_contrat")}
            options={typeOpts} onChange={v => form.setValue("id_type_contrat", v)} error={e.id_type_contrat ? String(e.id_type_contrat.message) : undefined} />
          <ContratTypeFields form={form} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Création..." : "Créer l'avenant"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
