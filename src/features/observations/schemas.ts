import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Énumérations métier (miroir des ENUM Postgres) + libellés/variantes UI.
//   observation_source : controle_reglementaire | commission_securite |
//                        inspection_interne
//   observation_gravite : mineure | majeure | bloquante
//   observation_statut : en_cours | levee
// Pas de machine à états imposée : seule transition utile en V1 = en_cours → levee.
// La cohérence de levée (date_levee + levee_by obligatoires) est garantie par un
// CHECK backend (observations_levee_coherente) ; on envoie donc les trois champs.
// ─────────────────────────────────────────────────────────────────────────────

export type ObservationSource =
  | 'controle_reglementaire'
  | 'commission_securite'
  | 'inspection_interne'

export type ObservationGravite = 'mineure' | 'majeure' | 'bloquante'

export type ObservationStatut = 'en_cours' | 'levee'

export const SOURCES: ObservationSource[] = [
  'controle_reglementaire',
  'commission_securite',
  'inspection_interne',
]

export const GRAVITES: ObservationGravite[] = [
  'mineure',
  'majeure',
  'bloquante',
]

export const LIBELLES_SOURCE: Record<string, string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  commission_securite: 'Commission de sécurité',
  inspection_interne: 'Inspection interne',
}

export const LIBELLES_GRAVITE: Record<string, string> = {
  mineure: 'Mineure',
  majeure: 'Majeure',
  bloquante: 'Bloquante',
}

export const LIBELLES_STATUT: Record<string, string> = {
  en_cours: 'En cours',
  levee: 'Levée',
}

/** Variante de Badge selon le statut d'observation. */
export function variantStatut(
  statut: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  return statut === 'levee' ? 'default' : 'secondary'
}

/** Variante de Badge selon la gravité (la gravité bloquante = danger). */
export function variantGravite(
  gravite: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (gravite) {
    case 'bloquante':
      return 'destructive'
    case 'majeure':
      return 'secondary'
    default:
      return 'outline'
  }
}

/** Libellé lisible d'un type de ligne du registre (v_registre_securite). */
export function libelleTypeLigne(type: string | null): string {
  switch (type) {
    case 'ot_controle':
      return 'Contrôle réglementaire (OT clôturé)'
    case 'observation_controle_reglementaire':
      return 'Observation — contrôle réglementaire'
    case 'observation_commission_securite':
      return 'Observation — commission de sécurité'
    case 'observation_inspection_interne':
      return 'Observation — inspection interne'
    default:
      return type ?? '—'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de création d'une observation.
//   - source = controle_reglementaire ⇒ ot_id obligatoire (CHECK backend).
//     L'UI impose donc un OT dans ce cas (validation Zod superRefine).
// ─────────────────────────────────────────────────────────────────────────────

export const observationCreateSchema = z
  .object({
    source: z.enum([
      'controle_reglementaire',
      'commission_securite',
      'inspection_interne',
    ]),
    gravite: z.enum(['mineure', 'majeure', 'bloquante']),
    description: z
      .string()
      .trim()
      .min(1, 'La description est obligatoire')
      .max(2000),
    echeance: z.string(),
    ot_id: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.source === 'controle_reglementaire' && !v.ot_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['ot_id'],
        message:
          'Un contrôle réglementaire doit être rattaché à un ordre de travail.',
      })
    }
  })

export type ObservationCreateValues = z.infer<typeof observationCreateSchema>

export function emptyObservationCreate(): ObservationCreateValues {
  return {
    source: 'inspection_interne',
    gravite: 'mineure',
    description: '',
    echeance: '',
    ot_id: '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de levée d'une observation.
//   La preuve documentaire (document_levee_id) est reportée en V1.5 : ici on
//   capture uniquement la date de levée et un commentaire optionnel.
// ─────────────────────────────────────────────────────────────────────────────

export const observationLeverSchema = z.object({
  date_levee: z.string().min(1, 'La date de levée est obligatoire'),
  commentaire_levee: z.string().trim().max(2000),
})

export type ObservationLeverValues = z.infer<typeof observationLeverSchema>

export function emptyObservationLever(): ObservationLeverValues {
  return {
    date_levee: new Date().toISOString().slice(0, 10),
    commentaire_levee: '',
  }
}
