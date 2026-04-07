import { z } from "zod";

const optionalText = z.string().optional().transform(v => v?.trim() || undefined);

export const prestataireSchema = z.object({
  libelle: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  adresse: optionalText,
  code_postal: z.string().regex(/^\d{5}$/, "Code postal : 5 chiffres").optional().or(z.literal("")).transform(v => v || undefined),
  ville: optionalText,
  telephone: optionalText,
  email: z.string().email("Email invalide").optional().or(z.literal("")).transform(v => v || undefined),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
export type PrestataireFormData = z.infer<typeof prestataireSchema>;