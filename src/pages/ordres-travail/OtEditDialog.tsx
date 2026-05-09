import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { otEditSchema, type OtEditFormData } from "@/lib/schemas/ordres-travail";
import type { OrdreTravail } from "@/lib/types/ordres-travail";

export interface OtEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ot: OrdreTravail;
  onSubmit: (input: OtEditFormData) => void;
}

export function OtEditDialog({ open, onOpenChange, ot, onSubmit: onSubmitProp }: OtEditDialogProps) {
  const form = useForm({
    resolver: typedResolver(otEditSchema),
    defaultValues: {
      date_prevue: ot.date_prevue,
      id_priorite: ot.id_priorite,
      commentaires: ot.commentaires ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        date_prevue: ot.date_prevue,
        id_priorite: ot.id_priorite,
        commentaires: ot.commentaires ?? "",
      });
    }
  }, [open, ot.date_prevue, ot.id_priorite, ot.commentaires, form]);

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier l'ordre de travail"
      onSubmit={form.handleSubmit((data) => onSubmitProp(data as OtEditFormData))}
      submitLabel="Enregistrer"
    >
      <div className="space-y-2">
        <Label>Date prévue</Label>
        <Input type="date" {...form.register("date_prevue")} />
      </div>
      <div className="space-y-2">
        <Label>Priorité</Label>
        <Select
          value={String(form.watch("id_priorite"))}
          items={{ "1": "Critique", "2": "Haute", "3": "Normale", "4": "Basse" }}
          onValueChange={(v) => form.setValue("id_priorite", Number(v))}
        >
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
        <Label>Commentaires</Label>
        <Input {...form.register("commentaires")} />
      </div>
    </CrudDialog>
  );
}
