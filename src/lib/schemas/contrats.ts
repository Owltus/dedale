import { z } from "zod";

export const TYPE_DETERMINE = 1;
export const TYPE_TACITE = 2;
export const TYPE_INDETERMINE = 3;

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

const contratFields = {
  id_prestataire: z.coerce.number().int().positive("Le prestataire est requis"),
  id_type_contrat: z.coerce.number().int().positive("Le type de contrat est requis"),
  reference: z.string().trim().min(1, "La référence est requise"),
  date_signature: optionalText,
  date_debut: z.string().trim().min(1, "La date de début est requise"),
  date_fin: optionalText,
  duree_cycle_mois: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  delai_preavis_jours: z.coerce.number().int().min(0).nullable().optional().transform(v => v ?? null),
  fenetre_resiliation_jours: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  commentaires: optionalText,
};

function validateContratFields(d: { id_type_contrat: number; date_debut: string; date_fin?: string; date_signature?: string; duree_cycle_mois?: number | null }, ctx: z.RefinementCtx) {
  if (d.date_fin && d.date_debut > d.date_fin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de fin doit être postérieure au début", path: ["date_fin"] });
  }
  if (d.date_signature && d.date_signature > d.date_debut) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de signature doit être antérieure au début", path: ["date_signature"] });
  }
  if (d.id_type_contrat === TYPE_DETERMINE && !d.date_fin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de fin est requise pour un contrat à durée déterminée", path: ["date_fin"] });
  }
  if (d.id_type_contrat === TYPE_TACITE && !d.duree_cycle_mois) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La durée du cycle est requise pour une tacite reconduction", path: ["duree_cycle_mois"] });
  }
}

export const contratSchema = z.object(contratFields).superRefine(validateContratFields);
export type ContratFormData = z.infer<typeof contratSchema>;

export const avenantSchema = z.object({
  id_contrat_parent: z.coerce.number().int().positive(),
  objet_avenant: z.string().trim().min(1, "L'objet de l'avenant est requis"),
  ...contratFields,
}).superRefine(validateContratFields);
export type AvenantFormData = z.infer<typeof avenantSchema>;

export const resiliationSchema = z.object({
  date_notification: z.string().trim().min(1, "La date de notification est requise"),
  date_resiliation: z.string().trim().min(1, "La date de résiliation est requise"),
}).refine(
  d => d.date_notification <= d.date_resiliation,
  { message: "La notification doit être antérieure à la résiliation", path: ["date_resiliation"] }
);
export type ResiliationFormData = z.infer<typeof resiliationSchema>;
