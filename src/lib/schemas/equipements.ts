import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const domaineSchema = z.object({
  nom_domaine: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type DomaineFormData = z.infer<typeof domaineSchema>;
export const familleSchema = z.object({
  nom_famille: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_domaine: z.coerce.number().int().positive("Le domaine est requis"),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_modele_equipement: z.coerce.number().int().positive("Le modèle est requis"),
});
export type FamilleFormData = z.infer<typeof familleSchema>;
export const categorieModeleSchema = z.object({
  nom_categorie: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
});
export type CategorieModeleFormData = z.infer<typeof categorieModeleSchema>;

export const modeleEquipementSchema = z.object({
  nom_modele: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_categorie: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type ModeleEquipementFormData = z.infer<typeof modeleEquipementSchema>;

export const champModeleSchema = z.object({
  id_modele_equipement: z.coerce.number().int().positive(),
  nom_champ: z.string().trim().min(1, "Le nom du champ est requis"),
  type_champ: z.enum(["texte", "nombre", "date", "booleen", "liste"]),
  unite: optionalText,
  est_obligatoire: z.coerce.number().int().min(0).max(1).default(0),
  ordre: z.coerce.number().int().min(0).default(0),
  valeurs_possibles: optionalText,
  valeur_defaut: optionalText,
});
export type ChampModeleFormData = z.infer<typeof champModeleSchema>;

export const equipementSchema = z.object({
  nom_affichage: z.string().trim().min(1, "Le nom est requis"),
  date_mise_en_service: optionalText,
  date_fin_garantie: optionalText,
  id_famille: z.coerce.number().int().positive("La famille est requise"),
  id_local: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  est_actif: z.coerce.number().min(0).max(1).default(1),
  commentaires: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
}).refine(
  d => !d.date_mise_en_service || !d.date_fin_garantie || d.date_fin_garantie >= d.date_mise_en_service,
  { message: "La date de fin de garantie doit être postérieure à la mise en service", path: ["date_fin_garantie"] }
);
export type EquipementFormData = z.infer<typeof equipementSchema>;