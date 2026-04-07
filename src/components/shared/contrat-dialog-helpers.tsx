import { useEffect, useRef } from "react";
import { type FieldValues, type Path, type PathValue, type UseFormReturn } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Contrat } from "@/lib/types/contrats";
import { TYPE_DETERMINE, TYPE_TACITE, TYPE_INDETERMINE } from "@/lib/schemas/contrats";

export function contratDefaults(c: Contrat) {
  return {
    id_prestataire: c.id_prestataire, id_type_contrat: c.id_type_contrat,
    reference: c.reference ?? "", date_signature: c.date_signature ?? "", date_debut: c.date_debut,
    date_fin: c.date_fin ?? "", duree_cycle_mois: c.duree_cycle_mois,
    delai_preavis_jours: c.delai_preavis_jours,
    fenetre_resiliation_jours: c.fenetre_resiliation_jours,
    commentaires: c.commentaires ?? "",
  };
}

export function contratCreateDefaults(prestataireId: number) {
  return {
    id_prestataire: prestataireId, id_type_contrat: 0, reference: "",
    date_debut: "", date_fin: "", date_signature: "",
    duree_cycle_mois: null, delai_preavis_jours: 30,
    fenetre_resiliation_jours: null, commentaires: "",
  };
}

export function SelectField({ id, label, value, options, onChange, error }: {
  id: string; label: string; value: unknown;
  options: { key: number; value: number; label: string }[];
  onChange: (v: number) => void; error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ? String(value) : undefined} items={Object.fromEntries(options.map(o => [String(o.value), o.label]))} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="— Sélectionner —" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.key} value={String(o.value)}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ContratTypeFields<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const typeContrat = form.watch("id_type_contrat" as Path<T>) as number;
  const e = form.formState.errors;

  const prevTypeRef = useRef<number>(typeContrat);
  useEffect(() => {
    if (prevTypeRef.current === typeContrat) return;
    prevTypeRef.current = typeContrat;
    if (!typeContrat) return;

    const set = (name: string, value: unknown) =>
      form.setValue(name as Path<T>, value as PathValue<T, Path<T>>);

    if (typeContrat === TYPE_DETERMINE) {
      set("duree_cycle_mois", null);
      set("fenetre_resiliation_jours", null);
    } else if (typeContrat === TYPE_TACITE) {
      set("date_fin", "");
    } else if (typeContrat === TYPE_INDETERMINE) {
      set("date_fin", "");
      set("duree_cycle_mois", null);
      set("fenetre_resiliation_jours", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeContrat]);

  const err = (name: string) => {
    const field = e[name];
    return field?.message ? String(field.message) : undefined;
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Référence *</Label>
        <Input placeholder="Ex: Maintenance CVC 2026" {...form.register("reference" as Path<T>)} />
        {err("reference") && <p className="text-sm text-destructive">{err("reference")}</p>}
      </div>

      <div className={typeContrat === TYPE_DETERMINE ? "grid grid-cols-2 gap-4" : undefined}>
        <div className="space-y-2">
          <Label>Date début *</Label>
          <Input type="date" {...form.register("date_debut" as Path<T>)} />
          {err("date_debut") && <p className="text-sm text-destructive">{err("date_debut")}</p>}
        </div>
        {typeContrat === TYPE_DETERMINE && (
          <div className="space-y-2">
            <Label>Date fin *</Label>
            <Input type="date" {...form.register("date_fin" as Path<T>)} />
            {err("date_fin") && <p className="text-sm text-destructive">{err("date_fin")}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Date signature</Label>
        <Input type="date" {...form.register("date_signature" as Path<T>)} />
        {err("date_signature") && <p className="text-sm text-destructive">{err("date_signature")}</p>}
      </div>

      {typeContrat === TYPE_TACITE && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Cycle (mois) *</Label>
            <Input type="number" {...form.register("duree_cycle_mois" as Path<T>)} />
            {err("duree_cycle_mois") && <p className="text-sm text-destructive">{err("duree_cycle_mois")}</p>}
          </div>
          <div className="space-y-2">
            <Label>Préavis (j)</Label>
            <Input type="number" {...form.register("delai_preavis_jours" as Path<T>)} />
          </div>
          <div className="space-y-2">
            <Label>Fenêtre résil. (j)</Label>
            <Input type="number" {...form.register("fenetre_resiliation_jours" as Path<T>)} />
          </div>
        </div>
      )}

      {typeContrat === TYPE_INDETERMINE && (
        <div className="space-y-2">
          <Label>Préavis (j)</Label>
          <Input type="number" {...form.register("delai_preavis_jours" as Path<T>)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Commentaires</Label>
        <Textarea {...form.register("commentaires" as Path<T>)} />
      </div>
    </>
  );
}
