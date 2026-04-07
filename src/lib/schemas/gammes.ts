import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

// ── Domaines gammes ──

export const domaineGammeSchema = z.object({
  nom_domaine: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type DomaineGammeFormData = z.infer<typeof domaineGammeSchema>;
// ── Familles gammes ──

export const familleGammeSchema = z.object({
  nom_famille: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_domaine_gamme: z.coerce.number().int().positive("Le domaine est requis"),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type FamilleGammeFormData = z.infer<typeof familleGammeSchema>;
// ── Gammes ──

export const gammeSchema = z.object({
  nom_gamme: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  est_reglementaire: z.coerce.number().min(0).max(1).default(0),
  id_periodicite: z.coerce.number().int().positive("La périodicité est requise"),
  id_famille_gamme: z.coerce.number().int().positive("La famille est requise"),
  id_prestataire: z.coerce.number().int().positive().default(1),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type GammeFormData = z.infer<typeof gammeSchema>;
export const operationSchema = z.object({
  nom_operation: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_type_operation: z.coerce.number().int().positive("Le type d'opération est requis"),
  id_gamme: z.coerce.number().int().positive(),
  seuil_minimum: z.coerce.number().nullable().optional().transform(v => v ?? null),
  seuil_maximum: z.coerce.number().nullable().optional().transform(v => v ?? null),
  id_unite: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
}).refine(
  d => d.seuil_minimum === null || d.seuil_maximum === null || d.seuil_minimum <= d.seuil_maximum,
  { message: "Le seuil minimum doit être ≤ au seuil maximum", path: ["seuil_maximum"] }
);
export type OperationFormData = z.infer<typeof operationSchema>;
// ── Édition gamme (sous-ensemble sans id_famille_gamme) ──

export const gammeEditSchema = z.object({
  nom_gamme: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_periodicite: z.coerce.number().int().min(1, "La périodicité est requise"),
  id_prestataire: z.coerce.number().int().default(1),
  est_reglementaire: z.coerce.number().min(0).max(1).default(0),
  id_image: z.number().nullable().default(null),
});
export type GammeEditFormData = z.infer<typeof gammeEditSchema>;
export const modeleOperationSchema = z.object({
  nom_modele: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type ModeleOperationFormData = z.infer<typeof modeleOperationSchema>;
export const modeleOperationItemSchema = z.object({
  nom_operation: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_type_operation: z.coerce.number().int().positive("Le type d'opération est requis"),
  id_modele_operation: z.coerce.number().int().positive(),
  seuil_minimum: z.coerce.number().nullable().optional().transform(v => v ?? null),
  seuil_maximum: z.coerce.number().nullable().optional().transform(v => v ?? null),
  id_unite: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
}).refine(
  d => d.seuil_minimum === null || d.seuil_maximum === null || d.seuil_minimum <= d.seuil_maximum,
  { message: "Le seuil minimum doit être ≤ au seuil maximum", path: ["seuil_maximum"] }
);
export type ModeleOperationItemFormData = z.infer<typeof modeleOperationItemSchema>;
