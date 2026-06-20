import { z } from 'zod'

// IDs stables de la machine à états (cf. statuts_travaux dans schema_complete.sql).
// 1 Ouvert → {2,3,5} ; 2 Planifié → {3,5} ; 3 En cours → {4,5} ; 4 Terminé → {3} ;
// 5 Annulé → {1} (réactivation).
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
  [STATUT_ANNULE]: [STATUT_OUVERT],
}

/** Un travaux terminé ou annulé est en lecture seule (hors réouverture). */
export function estVerrouille(statutId: number): boolean {
  return statutId === STATUT_TERMINE || statutId === STATUT_ANNULE
}

export const travauxSchema = z.object({
  titre: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  description: z.string().trim().max(2000),
})

export type TravauxFormValues = z.infer<typeof travauxSchema>

export function emptyTravaux(): TravauxFormValues {
  return {
    titre: '',
    description: '',
  }
}

// ─── Tâches (to-do à statut) d'un travail ────────────────────────────────────

/** Statuts d'une tâche (codes stables, miroir du CHECK backend). */
export const STATUTS_TACHE = [
  'en_attente',
  'en_cours',
  'realise',
  'non_realise',
  'non_applicable',
] as const
export type StatutTache = (typeof STATUTS_TACHE)[number]

/** Libellé lisible d'un statut de tâche. */
export const LIBELLES_STATUT_TACHE: Record<StatutTache, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  realise: 'Réalisé',
  non_realise: 'Non réalisé',
  non_applicable: 'Non applicable',
}

/** Variante de `Badge` cohérente pour un statut de tâche. */
export function variantStatutTache(
  statut: StatutTache,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (statut) {
    case 'realise':
      return 'default'
    case 'non_realise':
      return 'destructive'
    case 'en_cours':
    case 'non_applicable':
      return 'secondary'
    default: // en_attente
      return 'outline'
  }
}

export const tacheSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(300),
  local_id: z.string(), // '' = aucun local
  equipement_id: z.string(), // '' = aucun équipement
})

export type TacheFormValues = z.infer<typeof tacheSchema>

export function emptyTache(): TacheFormValues {
  return { libelle: '', local_id: '', equipement_id: '' }
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
