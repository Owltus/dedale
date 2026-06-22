import { z } from 'zod'

// ── Prestataire ─────────────────────────────────────────────────────────────

// Formulaire allégé (décision PO) : un prestataire = un NOM + une DESCRIPTION +
// une IMAGE. Les coordonnées (métier, SIRET, contact, adresse…) restent en base
// mais ne sont plus saisies ici. `commentaires` porte la description.
export const prestataireSchema = z.object({
  libelle: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  commentaires: z.string().trim().max(2000),
  miniature_id: z.string().nullable(),
})

export type PrestataireFormValues = z.infer<typeof prestataireSchema>

export const emptyPrestataire: PrestataireFormValues = {
  libelle: '',
  commentaires: '',
  miniature_id: null,
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
