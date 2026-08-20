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
  // 086 : une ou plusieurs tâches (090, généralisées — libellé libre, lieu
  // facultatif). Disponible en création ET en édition — continuité de la
  // fonctionnalité d'origine (le lieu se modifiait déjà depuis ce même
  // formulaire).
  taches: z.array(
    z.object({
      id: z.string().optional(),
      libelle: z.string(),
      local_id: z.string(),
      equipement_id: z.string(),
    }),
  ),
  // 094 (D2) : activation des tâches sur cette fiche — désactivé masque la
  // carte Tâches sur la fiche SANS supprimer les tâches déjà enregistrées
  // (mises en sommeil, récupérables en réactivant).
  taches_activees: z.boolean(),
})

export type EvenementFormValues = z.infer<typeof evenementSchema>

export function emptyEvenement(dateDuJour: string): EvenementFormValues {
  return {
    titre: '',
    description: '',
    date_evenement: dateDuJour,
    taches: [],
    taches_activees: true,
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

// ─── Tâches (086 ; statut d'avancement depuis 088 ; généralisées depuis 090) ─

// Tâche généralisée (090, module partagé avec Travaux) : un libellé libre
// (identité, requis) ; local/équipement/commentaire facultatifs.
export {
  tacheSchema as lieuSchema,
  emptyTache as emptyLieu,
} from '@/features/equipements/tache-schema'
export type { TacheFormValues as LieuFormValues } from '@/features/equipements/tache-schema'
