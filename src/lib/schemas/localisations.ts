import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const batimentSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type BatimentFormData = z.infer<typeof batimentSchema>;
export const niveauSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_batiment: z.coerce.number().int().positive("Le bâtiment est requis"),
});
export type NiveauFormData = z.infer<typeof niveauSchema>;
export const localSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  surface: z.coerce.number().positive("La surface doit être positive").nullable().optional().transform(v => v ?? null),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  id_niveau: z.coerce.number().int().positive("Le niveau est requis"),
});
export type LocalFormData = z.infer<typeof localSchema>;