import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const technicienSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis"),
  prenom: z.string().trim().min(1, "Le prénom est requis"),
  telephone: optionalText,
  email: z.string().email("Email invalide").optional().or(z.literal("")).transform(v => v || undefined),
  id_poste: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  est_actif: z.coerce.number().min(0).max(1).default(1),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type TechnicienFormData = z.infer<typeof technicienSchema>;