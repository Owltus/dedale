import { z } from 'zod'
import { todayLocal } from '@/lib/date'
import {
  FILTRE_NON_TERMINES,
  FILTRE_TOUS,
  type FilterOption,
} from '@/components/common/list-filter-bar'
import type { StatusTone } from '@/components/common/status-badge'

// ─────────────────────────────────────────────────────────────────────────────
// Machine à états OT — miroir du trigger validation_transitions_ot.
//   planifie → en_cours / cloture / annule
//   en_cours → planifie / cloture / annule
//   cloture  → reouvert (via RPC reouvrir_ot uniquement)
//   annule   → planifie (résurrection)
//   reouvert → planifie / en_cours / cloture / annule
// NB : la plupart des transitions sont automatiques (gestion_statut_ot bascule
// l'OT selon l'état de ses opérations, et le CLÔT dès qu'elles sont toutes
// terminales — il n'y a donc PAS de bouton « Clôturer » manuel). Le front
// expose seulement : Annuler, Réactiver (résurrection), Réouvrir (RPC).
// ─────────────────────────────────────────────────────────────────────────────

export type StatutOt =
  | 'planifie'
  | 'en_cours'
  | 'cloture'
  | 'annule'
  | 'reouvert'

export type StatutOperation =
  | 'en_attente'
  | 'en_cours'
  | 'terminee'
  | 'annulee'
  | 'non_applicable'

/** Un OT clôturé ou annulé est en lecture seule (preuve légale NF EN 13306). */
export function estVerrouille(statut: string): boolean {
  return statut === 'cloture' || statut === 'annule'
}

/** Libellé lisible d'un statut OT. */
export const LIBELLES_STATUT_OT: Record<string, string> = {
  planifie: 'Planifié',
  en_cours: 'En cours',
  cloture: 'Clôturé',
  annule: 'Annulé',
  reouvert: 'Rouvert',
}

/** Libellé lisible d'un statut d'opération. */
export const LIBELLES_STATUT_OP: Record<string, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee: 'Annulée',
  non_applicable: 'Non applicable',
}

/** Variante de Badge selon le statut OT (couleurs sémantiques). */
export function variantStatutOt(
  statut: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (statut) {
    case 'cloture':
      return 'default'
    case 'annule':
      return 'destructive'
    case 'en_cours':
    case 'reouvert':
      return 'secondary'
    default:
      return 'outline'
  }
}

/**
 * Statuts d'opération sélectionnables manuellement par l'utilisateur.
 * « annulee » est réservé à la cascade système (OT annulé) → exclu.
 */
export const STATUTS_OP_SAISISSABLES: StatutOperation[] = [
  'en_attente',
  'en_cours',
  'terminee',
  'non_applicable',
]

/**
 * Code couleur (liseré de carte) du statut d'une opération d'exécution, sur le
 * principe des cartes Demandes : en attente = gris (neutral), en cours = bleu
 * (info), terminée = vert (success), non applicable / annulée = rouge
 * (destructive). Consommé via le liseré `border-l-*` de la carte d'opération.
 */
export function statutOperationTone(statut: string): StatusTone {
  switch (statut) {
    case 'en_cours':
      return 'info' // bleu
    case 'terminee':
      return 'success' // vert
    case 'non_applicable':
    case 'annulee':
      return 'destructive' // rouge
    default:
      return 'neutral' // en attente (gris)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtre par statut de la liste des OT.
// `matchStatutFilter` / `statutFilterOptions` de `common/list-filter-bar` opèrent
// sur des id NUMÉRIQUES ; le statut d'un OT est une CHAÎNE → équivalents dédiés
// ci-dessous, qui réutilisent les mêmes sentinelles (FILTRE_TOUS / FILTRE_NON_TERMINES).
// ─────────────────────────────────────────────────────────────────────────────

/** Statuts terminaux d'un OT (lecture seule, exclus du filtre « Non terminés »). */
export const STATUTS_OT_TERMINAUX: StatutOt[] = ['cloture', 'annule']

// Ordre d'affichage des statuts dans le Select (cycle de vie de l'OT).
const ORDRE_STATUTS_OT: StatutOt[] = [
  'planifie',
  'en_cours',
  'reouvert',
  'cloture',
  'annule',
]

/** Options du filtre de statut OT : « Non terminés » (défaut) + « Tous » + chaque statut. */
export function statutOtFilterOptions(): FilterOption[] {
  return [
    { value: FILTRE_NON_TERMINES, label: 'Non terminés' },
    { value: FILTRE_TOUS, label: 'Tous les statuts' },
    ...ORDRE_STATUTS_OT.map((s) => ({
      value: s,
      label: LIBELLES_STATUT_OT[s] ?? s,
    })),
  ]
}

/**
 * Prédicat de filtrage par statut OT (chaîne) : miroir « string » de
 * `matchStatutFilter`. `FILTRE_TOUS` = tout, `FILTRE_NON_TERMINES` = exclut les
 * statuts terminaux, sinon égalité exacte d'identifiant de statut.
 */
export function matchStatutOt(statut: string, filterValue: string): boolean {
  if (filterValue === FILTRE_TOUS) return true
  if (filterValue === FILTRE_NON_TERMINES)
    return !STATUTS_OT_TERMINAUX.includes(statut as StatutOt)
  return statut === filterValue
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de création d'un OT (depuis une gamme).
// ─────────────────────────────────────────────────────────────────────────────

export const otCreateSchema = z.object({
  gamme_id: z.string().min(1, 'Sélectionnez une gamme'),
  date_prevue: z.string().min(1, 'La date prévue est obligatoire'),
})

export type OtCreateFormValues = z.infer<typeof otCreateSchema>

export function emptyOtCreate(): OtCreateFormValues {
  return { gamme_id: '', date_prevue: todayLocal() }
}

// Motif obligatoire pour annuler ou rouvrir un OT (CHECK + RPC backend).
export const motifSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire').max(2000),
})

export type MotifFormValues = z.infer<typeof motifSchema>
