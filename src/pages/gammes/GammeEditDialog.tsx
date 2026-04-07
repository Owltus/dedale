import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { gammeEditSchema, type GammeEditFormData } from "@/lib/schemas/gammes";
import type { Gamme } from "@/lib/types/gammes";
import type { Periodicite } from "@/lib/types/referentiels";
import type { Prestataire } from "@/lib/types/prestataires";

export interface GammeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamme: Gamme;
  periodicites: Periodicite[];
  prestataires: Prestataire[];
  onSubmit: (input: GammeEditFormData) => void;
}

export function GammeEditDialog({ open, onOpenChange, gamme, periodicites, prestataires, onSubmit: onSubmitProp }: GammeEditDialogProps) {
  const form = useForm<GammeEditFormData>({
    resolver: typedResolver(gammeEditSchema),
    defaultValues: {
      nom_gamme: gamme.nom_gamme,
      description: gamme.description ?? "",
      id_periodicite: gamme.id_periodicite,
      id_prestataire: gamme.id_prestataire,
      est_reglementaire: gamme.est_reglementaire,
      id_image: gamme.id_image,
    },
  });

  // Réinitialiser le formulaire quand la gamme change
  useEffect(() => {
    if (open) {
      form.reset({
        nom_gamme: gamme.nom_gamme,
        description: gamme.description ?? "",
        id_periodicite: gamme.id_periodicite,
        id_prestataire: gamme.id_prestataire,
        est_reglementaire: gamme.est_reglementaire,
        id_image: gamme.id_image,
      });
    }
  }, [open, gamme, form]);

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la gamme"
      className="sm:max-w-lg"
      onSubmit={form.handleSubmit((data) => onSubmitProp(data as GammeEditFormData))}
      submitLabel="Enregistrer"
    >
      <div className="flex gap-6">
        <ImagePicker value={form.watch("id_image")} onChange={(v) => form.setValue("id_image", v)} />
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label>Nom *</Label>
            <Input {...form.register("nom_gamme")} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input {...form.register("description")} />
          </div>
          <div className="space-y-2">
            <Label>Périodicité *</Label>
            <Select value={form.watch("id_periodicite") ? String(form.watch("id_periodicite")) : undefined} items={Object.fromEntries(periodicites.map(p => [String(p.id_periodicite), p.libelle]))} onValueChange={(v) => form.setValue("id_periodicite", Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
              <SelectContent>
                {periodicites.map((p) => <SelectItem key={p.id_periodicite} value={String(p.id_periodicite)}>{p.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prestataire *</Label>
            <Select value={String(form.watch("id_prestataire"))} items={Object.fromEntries(prestataires.map(p => [String(p.id_prestataire), p.libelle]))} onValueChange={(v) => form.setValue("id_prestataire", Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {prestataires.map((p) => <SelectItem key={p.id_prestataire} value={String(p.id_prestataire)}>{p.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.watch("est_reglementaire") === 1} onCheckedChange={(v) => form.setValue("est_reglementaire", v ? 1 : 0)} />
            <Label>Réglementaire</Label>
          </div>
        </div>
      </div>
    </CrudDialog>
  );
}
