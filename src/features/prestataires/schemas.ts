import { z } from 'zod'

// ── Prestataire ─────────────────────────────────────────────────────────────

export const prestataireSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  metier: z.string().trim().max(200),
  email: z.union([z.email("L'email est invalide"), z.literal('')]),
  telephone: z.string().trim().max(50),
  siret: z.string().trim().max(20),
  adresse: z.string().trim().max(500),
  code_postal: z.string().trim().max(20),
  ville: z.string().trim().max(200),
  commentaires: z.string().trim().max(2000),
})

export type PrestataireFormValues = z.infer<typeof prestataireSchema>

export const emptyPrestataire: PrestataireFormValues = {
  libelle: '',
  metier: '',
  email: '',
  telephone: '',
  siret: '',
  adresse: '',
  code_postal: '',
  ville: '',
  commentaires: '',
}

// ── Contrat ──────────────────────────────────────────────────────────────────

export const contratSchema = z
  .object({
    reference: z
      .string()
      .trim()
      .min(1, 'La référence est obligatoire')
      .max(200),
    type_contrat_id: z.string().min(1, 'Le type de contrat est obligatoire'),
    date_debut: z.string().min(1, 'La date de début est obligatoire'),
    date_fin: z.string(),
    objet_avenant: z.string().trim().max(500),
    commentaires: z.string().trim().max(2000),
  })
  .refine((v) => !v.date_fin || v.date_fin >= v.date_debut, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['date_fin'],
  })

export type ContratFormValues = z.infer<typeof contratSchema>

export const emptyContrat: ContratFormValues = {
  reference: '',
  type_contrat_id: '',
  date_debut: '',
  date_fin: '',
  objet_avenant: '',
  commentaires: '',
}
