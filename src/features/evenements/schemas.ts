import { z } from 'zod'

// IDs stables du référentiel (cf. `statuts_evenements`, migration 077).
// Transitions LIBRES : aucun trigger de machine à états côté base, comme pour
// les demandes d'intervention. On peut rouvrir un événement clôturé.
export const STATUT_OUVERT = 1
export const STATUT_EN_COURS = 2
export const STATUT_CLOTURE = 4
// L'id 3 (« En attente ») a été retiré du cycle (migration 078) : il doublonnait
// « En cours » à l'usage. L'id 4 reste celui de « Clôturé » — les ids sont
// STABLES, on ne les renumérote pas sous peine de réécrire les lignes existantes.

export const evenementSchema = z.object({
  titre: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  description: z.string().trim().max(5000),
  // Date nue locale (jamais `toISOString()`, cf. lib/date).
  date_evenement: z.string().min(1, 'La date est obligatoire'),
  // 086 : un ou plusieurs lieux (local + équipement optionnel), plus les
  // colonnes directes local_id/equipement_id (déplacées vers evenements_lieux).
  // Disponible en création ET en édition — continuité de la fonctionnalité
  // d'origine (le lieu se modifiait déjà depuis ce même formulaire).
  lieux: z.array(z.object({ local_id: z.string(), equipement_id: z.string() })),
})

export type EvenementFormValues = z.infer<typeof evenementSchema>

export function emptyEvenement(dateDuJour: string): EvenementFormValues {
  return {
    titre: '',
    description: '',
    date_evenement: dateDuJour,
    lieux: [],
  }
}

/**
 * Compte-rendu de clôture. Contrairement aux travaux, la BASE ne l'impose pas :
 * un événement peut être clos sans qu'aucune action ait été nécessaire (« fausse
 * alerte »). Le front le demande quand même, mais l'autorise vide — d'où
 * l'absence de `.min(1)` ici.
 */
export const clotureSchema = z.object({
  // Saisissable : on consigne souvent un événement après coup, et sa clôture n'a
  // pas de raison de tomber le jour de la saisie.
  date_cloture: z.string().min(1, 'La date de clôture est obligatoire'),
  compte_rendu: z.string().trim().max(5000),
})

export type ClotureFormValues = z.infer<typeof clotureSchema>

// ─── Lieux concernés (086 ; statut d'avancement par lieu depuis 088) ─────────

// Un « lieu concerné » : un local (requis) + un équipement précis optionnel.
export const lieuSchema = z.object({
  local_id: z.string().min(1, 'Choisis un local'),
  equipement_id: z.string(), // '' = aucun équipement
})

export type LieuFormValues = z.infer<typeof lieuSchema>

export function emptyLieu(): LieuFormValues {
  return { local_id: '', equipement_id: '' }
}
