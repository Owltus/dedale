import { z } from 'zod'
import { tachesInlineSchema } from '@/features/equipements/tache-schema'
import { formatDate } from '@/lib/date'
import { dateObligatoire } from '@/lib/dates-zod'

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
  date_evenement: dateObligatoire('La date est obligatoire'),
  // 098 : lieu principal de l'événement, facultatif, indépendant des tâches —
  // même convention que demandes/schemas.ts ('' = aucun).
  local_id: z.string(),
  equipement_id: z.string(),
  // 086 : une ou plusieurs tâches (090, généralisées — libellé libre, lieu
  // facultatif). Disponible en création ET en édition — continuité de la
  // fonctionnalité d'origine (le lieu se modifiait déjà depuis ce même
  // formulaire).
  // La forme vient de `tachesInlineSchema` (dérivé de la brique `tacheSchema`)
  // et NON d'une redéclaration locale : une tâche est la même chose ici et
  // ailleurs — libellé lisible, ≤ 200 caractères, tableau borné.
  taches: tachesInlineSchema,
})

export type EvenementFormValues = z.infer<typeof evenementSchema>

export function emptyEvenement(dateDuJour: string): EvenementFormValues {
  return {
    titre: '',
    description: '',
    date_evenement: dateDuJour,
    local_id: '',
    equipement_id: '',
    taches: [],
  }
}

/**
 * Compte-rendu de clôture. Contrairement aux travaux, la BASE ne l'impose pas :
 * un événement peut être clos sans qu'aucune action ait été nécessaire (« fausse
 * alerte »). Le front le demande quand même, mais l'autorise vide — d'où
 * l'absence de `.min(1)` ici.
 */
export const clotureSchema = z
  .object({
    // Saisissable : on consigne souvent un événement après coup, et sa clôture n'a
    // pas de raison de tomber le jour de la saisie.
    date_cloture: dateObligatoire('La date de clôture est obligatoire'),
    compte_rendu: z.string().trim().max(5000),
    /**
     * Date de l'événement clôturé. Elle n'est PAS saisie ici (le dialogue la
     * reçoit de la fiche et la pose en valeur par défaut) : elle est là pour
     * que le schéma puisse honorer lui-même la contrainte
     * `evenements_dates_coherentes`. Champ REQUIS à dessein — le type oblige
     * l'appelant à la fournir, sinon le contrôle redeviendrait silencieusement
     * inopérant.
     */
    date_evenement: dateObligatoire('La date de l’événement est obligatoire'),
  })
  // Miroir du CHECK `evenements_dates_coherentes`
  // (date_cloture IS NULL OR date_cloture >= date_evenement) : on refuse AVANT
  // l'aller-retour réseau plutôt que de laisser remonter un 23514. La
  // comparaison lexicographique est exacte : les deux champs sont des dates
  // nues `YYYY-MM-DD` garanties par `dateObligatoire`.
  .refine((v) => v.date_cloture >= v.date_evenement, {
    // Le message CITE la date butoir : « antérieure à l'événement » n'aide pas
    // si l'on ne se rappelle plus de quand date l'événement.
    error: (issue) => {
      const saisie = issue.input as { date_evenement?: unknown }
      const date =
        typeof saisie.date_evenement === 'string' ? saisie.date_evenement : ''
      return date === ''
        ? 'La clôture ne peut pas précéder la date de l’événement.'
        : `La clôture ne peut pas précéder l’événement (${formatDate(date)}).`
    },
    path: ['date_cloture'],
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
