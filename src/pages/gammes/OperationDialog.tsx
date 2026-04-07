import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { operationSchema, type OperationFormData } from "@/lib/schemas/gammes";
import type { Operation } from "@/lib/types/gammes";
import type { TypeOperation, Unite } from "@/lib/types/referentiels";

export interface OperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gammeId: number;
  editingOp: Operation | null;
  typesOps: TypeOperation[];
  unites: Unite[];
  onSubmit: (input: OperationFormData, isEdit: boolean) => void;
}

export function OperationDialog({ open, onOpenChange, gammeId, editingOp, typesOps, unites, onSubmit }: OperationDialogProps) {
  const form = useForm<OperationFormData>({
    resolver: typedResolver(operationSchema),
    defaultValues: {
      nom_operation: "",
      description: "",
      id_type_operation: 0,
      id_gamme: gammeId,
      seuil_minimum: null,
      seuil_maximum: null,
      id_unite: null,
    },
  });

  // Réinitialiser le formulaire quand on ouvre le dialog
  useEffect(() => {
    if (open) {
      if (editingOp) {
        form.reset({
          nom_operation: editingOp.nom_operation,
          description: editingOp.description ?? "",
          id_type_operation: editingOp.id_type_operation,
          id_gamme: gammeId,
          seuil_minimum: editingOp.seuil_minimum,
          seuil_maximum: editingOp.seuil_maximum,
          id_unite: editingOp.id_unite,
        });
      } else {
        form.reset({
          nom_operation: "",
          description: "",
          id_type_operation: 0,
          id_gamme: gammeId,
          seuil_minimum: null,
          seuil_maximum: null,
          id_unite: null,
        });
      }
    }
  }, [open, editingOp, gammeId, form]);

  const selectedTypeOp = typesOps.find((t) => t.id_type_operation === Number(form.watch("id_type_operation")));
  const showSeuils = selectedTypeOp?.necessite_seuils === 1;

  const handleSubmit = (data: Record<string, unknown>) => {
    // Nettoyer les seuils si le type ne nécessite pas de seuils
    const typed = data as OperationFormData;
    const typeOp = typesOps.find((t) => t.id_type_operation === Number(typed.id_type_operation));
    if (!typeOp?.necessite_seuils) {
      typed.seuil_minimum = null;
      typed.seuil_maximum = null;
      typed.id_unite = null;
    }
    onSubmit(typed, !!editingOp);
  };

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingOp ? "Modifier l'opération" : "Nouvelle opération"}
      onSubmit={form.handleSubmit(handleSubmit)}
      submitLabel={editingOp ? "Enregistrer" : "Créer"}
    >
      <div className="space-y-2">
        <Label htmlFor="nom_operation">Nom *</Label>
        <Input id="nom_operation" {...form.register("nom_operation")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...form.register("description")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="id_type_operation">Type d'opération *</Label>
        <Select value={form.watch("id_type_operation") ? String(form.watch("id_type_operation")) : undefined} items={Object.fromEntries(typesOps.map(t => [String(t.id_type_operation), t.libelle]))} onValueChange={(v) => {
            const val = Number(v);
            form.setValue("id_type_operation", val);
            const t = typesOps.find((t) => t.id_type_operation === val);
            if (!t?.necessite_seuils) { form.setValue("seuil_minimum", null); form.setValue("seuil_maximum", null); form.setValue("id_unite", null); }
          }}>
          <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
          <SelectContent>
            {typesOps.map((t) => <SelectItem key={t.id_type_operation} value={String(t.id_type_operation)}>{t.libelle}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {showSeuils && (
        <>
          <div className="space-y-2">
            <Label htmlFor="id_unite">Unité *</Label>
            <Select value={form.watch("id_unite") ? String(form.watch("id_unite")) : undefined} items={Object.fromEntries(unites.map(u => [String(u.id_unite), `${u.nom} (${u.symbole})`]))} onValueChange={(v) => form.setValue("id_unite", v ? Number(v) : null)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
              <SelectContent>
                {unites.map((u) => <SelectItem key={u.id_unite} value={String(u.id_unite)}>{u.nom} ({u.symbole})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="seuil_minimum">Seuil min</Label>
              <Input id="seuil_minimum" type="number" step="any" value={form.watch("seuil_minimum") ?? ""} onChange={(e) => form.setValue("seuil_minimum", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seuil_maximum">Seuil max</Label>
              <Input id="seuil_maximum" type="number" step="any" value={form.watch("seuil_maximum") ?? ""} onChange={(e) => form.setValue("seuil_maximum", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
        </>
      )}
    </CrudDialog>
  );
}
