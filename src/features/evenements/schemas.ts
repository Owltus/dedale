import { z } from 'zod'

// IDs stables du référentiel (cf. `statuts_evenements`, migration 077).
// Transitions LIBRES : aucun trigger de machine à états côté base, comme pour
// les demandes d'intervention. On peut rouvrir un événement clôturé.
export const STATUT_OUVERT = 1
export const STATUT_EN_COURS = 2
export const STATUT_EN_ATTENTE = 3
export const STATUT_CLOTURE = 4

export const evenementSchema = z.object({
  titre: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  description: z.string().trim().max(5000),
  // Date nue locale (jamais `toISOString()`, cf. lib/date).
  date_evenement: z.string().min(1, 'La date est obligatoire'),
  local_id: z.string(), // '' = aucun
  equipement_id: z.string(), // '' = aucun
})

export type EvenementFormValues = z.infer<typeof evenementSchema>

export function emptyEvenement(dateDuJour: string): EvenementFormValues {
  return {
    titre: '',
    description: '',
    date_evenement: dateDuJour,
    local_id: '',
    equipement_id: '',
  }
}

/**
 * Compte-rendu de clôture. Contrairement aux travaux, la BASE ne l'impose pas :
 * un événement peut être clos sans qu'aucune action ait été nécessaire (« fausse
 * alerte »). Le front le demande quand même, mais l'autorise vide — d'où
 * l'absence de `.min(1)` ici.
 */
export const clotureSchema = z.object({
  compte_rendu: z.string().trim().max(5000),
})

export type ClotureFormValues = z.infer<typeof clotureSchema>
