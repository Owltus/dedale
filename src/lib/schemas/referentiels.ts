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
  constat: z.string().trim().min(1, "Le constat est requis"),
});
export type ModeleDiFormData = z.infer<typeof modeleDiSchema>;
