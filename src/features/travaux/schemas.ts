import { z } from 'zod'

// IDs stables de la machine à états (cf. statuts_travaux dans schema_complete.sql).
// 1 Ouvert → {2,3,5} ; 2 Planifié → {3,5} ; 3 En cours → {4,5} ; 4 Terminé → {3} ; 5 Annulé = terminal.
export const STATUT_OUVERT = 1
export const STATUT_PLANIFIE = 2
export const STATUT_EN_COURS = 3
export const STATUT_TERMINE = 4
export const STATUT_ANNULE = 5

/** Transitions autorisées par la machine à états backend (miroir du trigger). */
export const TRANSITIONS: Record<number, number[]> = {
  [STATUT_OUVERT]: [STATUT_PLANIFIE, STATUT_EN_COURS, STATUT_ANNULE],
  [STATUT_PLANIFIE]: [STATUT_EN_COURS, STATUT_ANNULE],
  [STATUT_EN_COURS]: [STATUT_TERMINE, STATUT_ANNULE],
  [STATUT_TERMINE]: [STATUT_EN_COURS],
  [STATUT_ANNULE]: [],
}

/** Un travaux terminé ou annulé est en lecture seule (hors réouverture). */
export function estVerrouille(statutId: number): boolean {
  return statutId === STATUT_TERMINE || statutId === STATUT_ANNULE
}

export const travauxSchema = z.object({
  titre: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  description: z.string().trim().max(2000),
  prestataire_id: z.string(),
  date_demande: z.string().min(1, 'La date de demande est obligatoire'),
  date_prevue: z.string(),
  date_fin: z.string(),
  local_ids: z.array(z.string()),
  equipement_ids: z.array(z.string()),
})

export type TravauxFormValues = z.infer<typeof travauxSchema>

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyTravaux(): TravauxFormValues {
  return {
    titre: '',
    description: '',
    prestataire_id: '',
    date_demande: today(),
    date_prevue: '',
    date_fin: '',
    local_ids: [],
    equipement_ids: [],
  }
}

// Compte-rendu obligatoire au passage « Terminé » (contrôlé aussi par trigger).
export const compteRenduSchema = z.object({
  compte_rendu: z
    .string()
    .trim()
    .min(1, 'Le compte-rendu est obligatoire pour clôturer')
    .max(5000),
})

export type CompteRenduFormValues = z.infer<typeof compteRenduSchema>
