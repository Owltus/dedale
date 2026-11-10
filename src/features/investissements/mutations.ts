import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { investissementsQueries } from './queries'
import { ID_REALISE, ID_REFUSE } from './etat'
import { parseMontant } from './schemas'
import type { InvestissementFormValues } from './schemas'

// Convertit les champs texte du formulaire en payload base (vides → null). Le
// statut n'est plus saisi dans le formulaire : il vaut son DEFAULT (Demandé) à
// la création et se change ensuite par les boutons de la fiche (cf. useChangeStatutCapex).
function toPayload(v: InvestissementFormValues) {
  return {
    libelle: v.libelle.trim(),
    description: v.description.trim() || null,
    fournisseur: v.fournisseur.trim() || null,
    montant_demande: parseMontant(v.montant_demande),
    montant_prevu: parseMontant(v.montant_prevu),
    depense_reelle: parseMontant(v.depense_reelle),
    date_demande: v.date_demande,
    annee_budget: Number(v.annee_budget),
  }
}

export function useCreateInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: InvestissementFormValues
    }) => {
      const { data } = await supabase
        .from('investissements')
        .insert({
          ...toPayload(values),
          site_id: siteId,
          created_by: createdBy,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

export function useUpdateInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: InvestissementFormValues
    }) => {
      const { data } = await supabase
        .from('investissements')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/**
 * Change le statut d'un investissement, et son année de budget pour un report
 * (138). La base journalise l'un comme l'autre dans l'historique.
 *
 * Passer à « Réalisé » pose la date, le bilan et l'auteur ; en repartir les
 * efface — sinon un dossier rouvert garderait une date de fin antérieure à son
 * propre suivi (`investissements_dates_coherentes`, migration 079). La date
 * est une date NUE (`isoLocale`), jamais un `toISOString()`.
 *
 * « Refusé » suit la même logique avec le trio motif / date / auteur : la base
 * EXIGE un motif, et en repartir l'efface.
 */
export function useChangeStatutCapex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      annee,
      bilan,
      dateCloture,
      clotureBy,
      motifArret,
      dateArret,
      arreteBy,
      montantPrevu,
      depenseReelle,
    }: {
      id: string
      statutId: number
      /** Année du budget après l'action (report = +1). */
      annee: number
      bilan?: string
      dateCloture?: string
      clotureBy?: string
      /** Obligatoire pour « Refusé » — la base le refuse sinon. */
      motifArret?: string
      dateArret?: string
      arreteBy?: string
      /** Montant validé, saisi en validant (absent = inchangé). */
      montantPrevu?: number | null
      /** Dépense réelle, saisie en marquant réalisé (absent = inchangée). */
      depenseReelle?: number | null
    }) => {
      const realise = statutId === ID_REALISE
      const refus = statutId === ID_REFUSE
      const { data } = await supabase
        .from('investissements')
        .update({
          statut_capex_id: statutId,
          annee_budget: annee,
          bilan: realise ? (bilan?.trim() ?? '') || null : null,
          date_cloture: realise ? (dateCloture ?? null) : null,
          cloture_by: realise ? (clotureBy ?? null) : null,
          motif_arret: refus ? (motifArret?.trim() ?? '') || null : null,
          date_arret: refus ? (dateArret ?? null) : null,
          arrete_by: refus ? (arreteBy ?? null) : null,
          ...(montantPrevu !== undefined && { montant_prevu: montantPrevu }),
          ...(depenseReelle !== undefined && { depense_reelle: depenseReelle }),
        })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

export function useDeleteInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete).
      await supabase
        .from('investissements')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/**
 * Désigne LE devis d'un investissement (144) — ou le retire (`null`). Le
 * document reste rattaché au dossier : il repasse simplement dans
 * « Documents ».
 */
export function useDefinirDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      documentId,
    }: {
      id: string
      documentId: string | null
    }) => {
      await supabase
        .from('investissements')
        .update({ devis_document_id: documentId })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}
