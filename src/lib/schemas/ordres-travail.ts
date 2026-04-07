import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const otCreateSchema = z.object({
  id_gamme: z.coerce.number().int().positive("La gamme est requise"),
  date_prevue: z.string().trim().min(1, "La date prévue est requise"),
  id_priorite: z.coerce.number().int().positive().default(3),
  id_technicien: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_di: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  commentaires: optionalText,
});
export type OtCreateFormData = z.infer<typeof otCreateSchema>;

export const otEditSchema = z.object({
  date_prevue: z.string().min(1, "La date est requise"),
  id_priorite: z.coerce.number().int(),
  id_technicien: z.coerce.number().int().nullable().default(null),
  commentaires: optionalText,
});
export type OtEditFormData = z.infer<typeof otEditSchema>;

export const opExecUpdateSchema = z.object({
  // Statut 4 (Annulée) est réservé au système — exclure de la validation manuelle
  id_statut_operation: z.coerce.number().int().min(1).max(5)
    .refine(v => v !== 4, { message: "Le statut Annulée est réservé au système" }),
  valeur_mesuree: z.coerce.number().nullable().optional().transform(v => v ?? null),
  est_conforme: z.coerce.number().min(0).max(1).nullable().optional().transform(v => v ?? null),
  date_execution: optionalText,
  commentaires: optionalText,
}).refine(
  // CHECK SQL : statut 2 (En cours) ou 3 (Terminée) exige date_execution NOT NULL
  d => !(d.id_statut_operation === 2 || d.id_statut_operation === 3) || !!d.date_execution,
  { message: "La date d'exécution est requise pour les statuts En cours et Terminée", path: ["date_execution"] }
);
export type OpExecUpdateFormData = z.infer<typeof opExecUpdateSchema>;
