import { z } from 'zod'
import { formatDate, todayLocal } from '@/lib/date'
import { dateObligatoire } from '@/lib/dates-zod'
import { texteObligatoire } from '@/lib/texte-zod'
import { anneeBudgetEnPreparation } from './etat'

// Champ montant : texte numérique optionnel (≥ 0, max 2 décimales).
// Vide accepté → converti en null à l'enregistrement (cf. mutations).
export const montant = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), {
    message: 'Montant invalide (positif, 2 décimales max)',
  })
  // Borne alignée sur la colonne NUMERIC(12,2) : on intercède AVANT le réseau
  // plutôt que de laisser Postgres lever 22003 (numeric field overflow).
  .refine((v) => v === '' || Number(v.replace(',', '.')) <= 9_999_999_999.99, {
    message: 'Montant trop élevé (max ~10 milliards)',
  })

export const investissementSchema = z.object({
  libelle: texteObligatoire('Le libellé est obligatoire', 'libelle').max(200),
  description: z.string().trim().max(2000),
  depense_reelle: montant,
  date_demande: dateObligatoire('La date de proposition est obligatoire'),
  // Année du budget (138) : texte du menu déroulant, miroir du CHECK 2000-2100.
  annee_budget: z
    .string()
    .regex(/^[0-9]{4}$/, "Choisis l'année du budget")
    .refine((v) => Number(v) >= 2000 && Number(v) <= 2100, {
      message: "Choisis l'année du budget",
    }),
})

export type InvestissementFormValues = z.infer<typeof investissementSchema>

export function emptyInvestissement(annee?: number): InvestissementFormValues {
  return {
    annee_budget: String(annee ?? anneeBudgetEnPreparation()),
    libelle: '',
    description: '',
    depense_reelle: '',
    date_demande: todayLocal(),
  }
}

/** Convertit un champ texte montant en number ≥ 0 ou null (vide). */
export function parseMontant(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return Number(trimmed.replace(',', '.'))
}

/**
 * Fin d'un investissement (« Marquer réalisé ») : date + bilan budgétaire.
 *
 * Le bilan n'est PAS obligatoire : un investissement peut se clore sans
 * commentaire quand le prévu et le réel coïncident. L'exiger pousserait à
 * écrire « RAS », ce qui ne renseigne personne — même raisonnement que pour le
 * compte-rendu d'un événement.
 */
export const clotureCapexSchema = z
  .object({
    date_cloture: dateObligatoire('La date de réalisation est obligatoire'),
    /** Dépense réelle : demandée à la réalisation (demande PO). */
    depense_reelle: montant,
    bilan: z.string().trim().max(5000),
    /**
     * Date de demande de l'investissement clôturé. Elle n'est PAS saisie ici
     * (le dialogue la reçoit de la fiche et la pose en valeur par défaut) :
     * elle est là pour que le schéma puisse honorer lui-même la contrainte
     * `investissements_dates_coherentes`. Champ REQUIS à dessein — sans elle,
     * le contrôle redeviendrait silencieusement inopérant.
     */
    date_demande: dateObligatoire('La date de proposition est obligatoire'),
  })
  // Miroir du CHECK `investissements_dates_coherentes`
  // (date_cloture IS NULL OR date_cloture >= date_demande) : on refuse AVANT
  // l'aller-retour réseau plutôt que de laisser remonter un 23514. La
  // comparaison lexicographique est exacte : les deux champs sont des dates
  // nues `YYYY-MM-DD` garanties par `dateObligatoire`.
  .refine((v) => v.date_cloture >= v.date_demande, {
    // Le message CITE la date butoir : « antérieure à la demande » n'aide pas
    // si l'on ne se rappelle plus de quand date la demande.
    error: (issue) => {
      const saisie = issue.input as { date_demande?: unknown }
      const date =
        typeof saisie.date_demande === 'string' ? saisie.date_demande : ''
      return date === ''
        ? 'La réalisation ne peut pas précéder la date de proposition.'
        : `La réalisation ne peut pas précéder la proposition (${formatDate(date)}).`
    },
    path: ['date_cloture'],
  })

/** Valider une proposition : la date de validation (aujourd'hui par défaut, modifiable — 146). */
export const validationCapexSchema = z.object({
  date_validation: dateObligatoire('La date de validation est obligatoire'),
  /**
   * Devis retenus (147) : valider, c'est choisir. Au moins un quand le projet
   * a des devis — l'hôte le vérifie, il sait s'il y en a.
   */
  devis_retenus: z.array(z.string()),
})

/**
 * Un devis d'un projet (147, décision PO du 11/11/2026) : qui le fait, ce
 * qu'il couvre (facultatif), combien HT. Miroir des CHECK
 * investissements_devis_{fournisseur,objet,montant_ht}_check.
 */
export const devisSchema = z.object({
  fournisseur: texteObligatoire('Le fournisseur est obligatoire', 'nom').max(
    100,
  ),
  objet: z.string().trim().max(200),
  montant_ht: montant.refine((v) => v.trim() !== '', {
    message: 'Le montant HT est obligatoire',
  }),
})

export type DevisFormValues = z.infer<typeof devisSchema>

export type ValidationCapexFormValues = z.infer<typeof validationCapexSchema>

export type ClotureCapexFormValues = z.infer<typeof clotureCapexSchema>

/**
 * Refuser une proposition (demande PO du 11/11/2026) : la date du refus
 * (aujourd'hui par défaut, modifiable) et un motif FACULTATIF — la base ne
 * l'exige plus depuis 145.
 */
export const refusCapexSchema = z.object({
  date_arret: dateObligatoire('La date du refus est obligatoire'),
  motif_arret: z.string().trim().max(5000),
})

export type RefusCapexFormValues = z.infer<typeof refusCapexSchema>
