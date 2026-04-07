import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { contratSchema } from "@/lib/schemas/contrats";
import type { Contrat } from "@/lib/types/contrats";
import type { Prestataire } from "@/lib/types/prestataires";
import type { TypeContrat } from "@/lib/types/referentiels";
import { contratDefaults, SelectField, ContratTypeFields } from "./contrat-dialog-helpers";

interface EditDialogProps {
  open: boolean; onOpenChange: (v: boolean) => void; contrat: Contrat;
  prestataires: Prestataire[]; typesContrats: TypeContrat[];
  onSubmit: (data: unknown) => Promise<void>; isLoading: boolean;
}

/// Dialogue de modification d'un contrat
export function EditContratDialog({ open, onOpenChange, contrat, prestataires, typesContrats, onSubmit, isLoading }: EditDialogProps) {
  const form = useForm({
    resolver: typedResolver(contratSchema),
    defaultValues: contratDefaults(contrat),
  });
  useEffect(() => { if (open) form.reset(contratDefaults(contrat)); }, [open, contrat, form]);

  const prestOpts = prestataires.filter(p => p.id_prestataire !== 1).map(p => ({ key: p.id_prestataire, value: p.id_prestataire, label: p.libelle }));
  const typeOpts = typesContrats.map(t => ({ key: t.id_type_contrat, value: t.id_type_contrat, label: t.libelle }));
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier le contrat</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <SelectField id="edit-prest" label="Prestataire *" value={form.watch("id_prestataire")}
            options={prestOpts} onChange={v => form.setValue("id_prestataire", v)} error={e.id_prestataire ? String(e.id_prestataire.message) : undefined} />
          <SelectField id="edit-type" label="Type *" value={form.watch("id_type_contrat")}
            options={typeOpts} onChange={v => form.setValue("id_type_contrat", v)} error={e.id_type_contrat ? String(e.id_type_contrat.message) : undefined} />
          <ContratTypeFields form={form} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Enregistrement..." : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
