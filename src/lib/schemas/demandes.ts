import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const diCreateSchema = z.object({
  libelle_constat: z.string().trim().min(1, "Le libelle du constat est requis"),
  description_constat: z.string().trim().min(1, "La description est requise"),
  date_constat: z.string().trim().min(1, "La date est requise"),
  description_resolution_suggeree: optionalText,
});
export type DiCreateFormData = z.infer<typeof diCreateSchema>;

export const diResolutionSchema = z.object({
  date_resolution: z.string().trim().min(1, "La date de resolution est requise"),
  description_resolution: z.string().trim().min(1, "La description de resolution est requise"),
});
export type DiResolutionFormData = z.infer<typeof diResolutionSchema>;
