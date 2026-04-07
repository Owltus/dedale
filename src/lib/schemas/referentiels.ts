import { z } from "zod";

// Helper pour champs texte optionnels (vide → undefined)
const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

// Unités, types d'opérations, types de documents, postes : lecture seule (données système)

// ── Modèles de DI ──
export const modeleDiSchema = z.object({
  nom_modele: z.string().trim().min(1, "Le nom du modèle est requis"),
  description: optionalText,
  id_famille: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_equipement: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  libelle_constat: z.string().trim().min(1, "Le libellé du constat est requis"),
  description_constat: z.string().trim().min(1, "La description du constat est requise"),
  description_resolution: optionalText,
});
export type ModeleDiFormData = z.infer<typeof modeleDiSchema>;
// ── Établissement ──
export const etablissementSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis"),
  id_type_erp: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_categorie_erp: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  adresse: optionalText,
  code_postal: z.string().regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres").optional().or(z.literal("")).transform(v => v || null),
  ville: optionalText,
});
export type EtablissementFormData = z.infer<typeof etablissementSchema>;
