import { z } from "zod";

export const diCreateSchema = z.object({
  id_prestataire: z.number().positive().nullable().optional().transform(v => v ?? null),
  constat: z.string().trim().min(1, "Le constat est requis"),
  date_constat: z.string().trim().min(1, "La date est requise"),
});
export type DiCreateFormData = z.infer<typeof diCreateSchema>;

export const diResolutionSchema = z.object({
  date_resolution: z.string().trim().min(1, "La date de resolution est requise"),
  description_resolution: z.string().trim().min(1, "La description de resolution est requise"),
});
export type DiResolutionFormData = z.infer<typeof diResolutionSchema>;
