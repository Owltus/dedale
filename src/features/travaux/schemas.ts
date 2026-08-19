import { z } from 'zod'
import {
  STATUTS_ZONE,
  LIBELLES_STATUT_ZONE,
  variantStatutZone,
} from '@/features/equipements/statut-zone'
import type { StatutZone } from '@/features/equipements/statut-zone'

// IDs stables du référentiel (cf. statuts_travaux dans schema_complete.sql).
// 085 : statut LIBRE (plus de machine à états côté base), ids alignés sur
// statuts_evenements (1 Ouvert, 2 En cours, 4 Terminé — id 3 vacant).
export const STATUT_OUVERT = 1
export const STATUT_EN_COURS = 2
export const STATUT_TERMINE = 4

export const travauxSchema = z.object({
  titre: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  description: z.string().trim().max(2000),
  // Lieux ajoutés/retouchés directement ici, en création COMME en
  // modification (la fiche, via TacheDialog, reste une autre façon d'y
  // accéder). Filtrés par la mutation : une ligne sans local_id est ignorée
  // (l'usager a pu ajouter puis abandonner une ligne).
  lieux: z.array(z.object({ local_id: z.string(), equipement_id: z.string() })),
})

export type TravauxFormValues = z.infer<typeof travauxSchema>

export function emptyTravaux(): TravauxFormValues {
  return {
    titre: '',
    description: '',
    lieux: [],
  }
}

// ─── Tâches (to-do à statut) d'un travail ────────────────────────────────────

// Statut d'une tâche = statut de zone (module partagé avec Événements, 088) —
// réexporté sous ces noms pour ne rien casser côté consommateurs existants
// (TacheRow, TacheDialog, mutations).
export const STATUTS_TACHE = STATUTS_ZONE
export type StatutTache = StatutZone
export const LIBELLES_STATUT_TACHE = LIBELLES_STATUT_ZONE
export const variantStatutTache = variantStatutZone

// Une « zone concernée » : un local (requis) + un équipement précis optionnel.
export const tacheSchema = z.object({
  local_id: z.string().min(1, 'Choisis un local'),
  equipement_id: z.string(), // '' = aucun équipement
})

export type TacheFormValues = z.infer<typeof tacheSchema>

export function emptyTache(): TacheFormValues {
  return { local_id: '', equipement_id: '' }
}

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
  date_fin: z.string().min(1, 'La date de fin est obligatoire'),
  compte_rendu: z.string().trim().max(5000),
})

export type ClotureTravauxFormValues = z.infer<typeof clotureTravauxSchema>
