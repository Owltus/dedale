import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Machine à états OT — miroir du trigger validation_transitions_ot.
//   planifie → en_cours / cloture / annule
//   en_cours → planifie / cloture / annule
//   cloture  → reouvert (via RPC reouvrir_ot uniquement)
//   annule   → planifie (résurrection)
//   reouvert → planifie / en_cours / cloture / annule
// NB : la plupart des transitions sont automatiques (gestion_statut_ot bascule
// l'OT selon l'état de ses opérations). Le front expose seulement les actions
// utiles : Clôturer, Annuler, Réactiver (résurrection), Réouvrir (RPC).
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

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de création d'un OT (depuis une gamme).
// ─────────────────────────────────────────────────────────────────────────────

export const otCreateSchema = z.object({
  gamme_id: z.string().min(1, 'Sélectionnez une gamme'),
  date_prevue: z.string().min(1, 'La date prévue est obligatoire'),
})

export type OtCreateFormValues = z.infer<typeof otCreateSchema>

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyOtCreate(): OtCreateFormValues {
  return { gamme_id: '', date_prevue: today() }
}

// Motif obligatoire pour annuler ou rouvrir un OT (CHECK + RPC backend).
export const motifSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire').max(2000),
})

export type MotifFormValues = z.infer<typeof motifSchema>
