import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { investissementsQueries } from './queries'
import { ID_CLOTURE } from './etat'
import { parseMontant } from './schemas'
import type { InvestissementFormValues } from './schemas'

// Convertit les champs texte du formulaire en payload base (vides → null). Le
// statut n'est plus saisi dans le formulaire : il vaut son DEFAULT (Demandé) à
// la création et se change ensuite via la frise (cf. useChangeStatutCapex).
function toPayload(v: InvestissementFormValues) {
  return {
    libelle: v.libelle.trim(),
    description: v.description.trim() || null,
    montant_demande: parseMontant(v.montant_demande),
    montant_prevu: parseMontant(v.montant_prevu),
    depense_reelle: parseMontant(v.depense_reelle),
    date_demande: v.date_demande,
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
 * Change le statut CapEx (frise cliquable + bouton « Refuser »). Statut LIBRE :
 * aucune machine à états backend → simple UPDATE du statut_capex_id.
 */
/**
 * Change le statut d'un investissement.
 *
 * Passer à « Clôturé » pose la date, le bilan et l'auteur ; en repartir les
 * efface — sinon un investissement rouvert garderait une date de clôture
 * antérieure à son propre suivi, que la contrainte
 * `investissements_dates_coherentes` finirait par refuser (migration 079).
 *
 * La date est une date NUE construite par l'appelant (`isoLocale`), jamais un
 * `toISOString()` : c'est ce qui avait produit le 23514 des ordres de travail.
 */
export function useChangeStatutCapex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      bilan,
      dateCloture,
      clotureBy,
    }: {
      id: string
      statutId: number
      bilan?: string
      dateCloture?: string
      clotureBy?: string
    }) => {
      const cloture = statutId === ID_CLOTURE
      const { data } = await supabase
        .from('investissements')
        .update({
          statut_capex_id: statutId,
          bilan: cloture ? (bilan?.trim() ?? '') || null : null,
          date_cloture: cloture ? (dateCloture ?? null) : null,
          cloture_by: cloture ? (clotureBy ?? null) : null,
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
