import { z } from 'zod'
import {
  STATUTS_ZONE,
  LIBELLES_STATUT_ZONE,
  variantStatutZone,
} from '@/features/equipements/statut-zone'
import type { StatutZone } from '@/features/equipements/statut-zone'
import { tachesInlineSchema } from '@/features/equipements/tache-schema'
import { dateObligatoire } from '@/lib/dates-zod'
import { texteObligatoire } from '@/lib/texte-zod'

// IDs stables du référentiel (cf. statuts_travaux dans schema_complete.sql).
// 085 : statut LIBRE (plus de machine à états côté base), ids alignés sur
// statuts_evenements (1 Ouvert, 2 En cours, 4 Terminé — id 3 vacant).
export const STATUT_OUVERT = 1
export const STATUT_EN_COURS = 2
export const STATUT_TERMINE = 4

export const travauxSchema = z.object({
  titre: texteObligatoire('Le titre est obligatoire', 'titre').max(200),
  description: z.string().trim().max(2000),
  // Saisissable (comme `date_evenement` côté Événements) : un travaux se
  // déclare souvent après coup (rattrapage d'historique), sa date n'a pas de
  // raison de tomber le jour de la saisie. Date nue locale (jamais
  // `toISOString()`, cf. lib/date).
  date_demande: dateObligatoire('La date est obligatoire'),
  // 098 : lieu principal du travaux, facultatif, indépendant des tâches —
  // même convention que demandes/schemas.ts ('' = aucun).
  local_id: z.string(),
  equipement_id: z.string(),
  // Tâches (090, généralisées) ajoutées/retouchées directement ici, en
  // création COMME en modification (la fiche, via TacheDialog, reste une
  // autre façon d'y accéder). Filtrées par la mutation : une ligne sans
  // libellé NI lieu est ignorée (l'usager a pu ajouter puis abandonner une
  // ligne).
  // La forme vient de `tachesInlineSchema` (dérivé de la brique `tacheSchema`)
  // et NON d'une redéclaration locale : une tâche est la même chose ici et
  // ailleurs — libellé lisible, ≤ 200 caractères, tableau borné.
  taches: tachesInlineSchema,
})

export type TravauxFormValues = z.infer<typeof travauxSchema>

export function emptyTravaux(dateDuJour: string): TravauxFormValues {
  return {
    titre: '',
    description: '',
    date_demande: dateDuJour,
    local_id: '',
    equipement_id: '',
    taches: [],
  }
}

// ─── Tâches (checklist à statut) d'un travail ────────────────────────────────

// Statut d'une tâche = statut de zone (module partagé avec Événements, 088) —
// réexporté sous ces noms pour ne rien casser côté consommateurs existants.
export const STATUTS_TACHE = STATUTS_ZONE
export type StatutTache = StatutZone
export const LIBELLES_STATUT_TACHE = LIBELLES_STATUT_ZONE
export const variantStatutTache = variantStatutZone

// Tâche généralisée (090, module partagé avec Événements) : un libellé libre
// (identité, requis) ; local/équipement/commentaire facultatifs.
export { tacheSchema, emptyTache } from '@/features/equipements/tache-schema'
export type { TacheFormValues } from '@/features/equipements/tache-schema'

/**
 * Clôture d'un travaux : date de fin + compte-rendu.
 *
 * 085 : le compte-rendu est désormais FACULTATIF, comme pour les événements
 * et les investissements — la base ne le contraint plus (trigger
 * `validation_travaux_compte_rendu` supprimé). Le front le demande quand même
 * (c'est ce qu'on vient documenter à la clôture), mais l'autorise vide.
 *
 * La date reste saisissable : le front pose désormais lui-même `date_fin`
 * (COALESCE côté client), le trigger serveur qui le faisait ayant été retiré.
 */
export const clotureTravauxSchema = z.object({
  date_fin: dateObligatoire('La date de fin est obligatoire'),
  compte_rendu: z.string().trim().max(5000),
})

export type ClotureTravauxFormValues = z.infer<typeof clotureTravauxSchema>
