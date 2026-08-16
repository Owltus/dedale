import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { evenementsQueries } from './queries'
import { STATUT_CLOTURE } from './schemas'
import type { EvenementFormValues } from './schemas'

/**
 * Formulaire → payload base. Les chaînes vides deviennent `null` : `''` est la
 * convention des inputs, `null` celle de la base (cf. `optionalIntId`).
 */
function toPayload(v: EvenementFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
    date_evenement: v.date_evenement,
    local_id: v.local_id || null,
    equipement_id: v.equipement_id || null,
  }
}

export function useCreateEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: EvenementFormValues
    }) => {
      const { data } = await supabase
        .from('evenements')
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
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

export function useUpdateEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: EvenementFormValues
    }) => {
      const { data } = await supabase
        .from('evenements')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

export function useDeleteEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // `.select().single()` : un DELETE hors périmètre RLS ne touche aucune
      // ligne et lève PGRST116 au lieu de renvoyer un faux succès.
      const { data } = await supabase
        .from('evenements')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

/**
 * Change le statut d'un événement.
 *
 * Passer à « Clôturé » pose la date de clôture et le compte-rendu ; en repartir
 * les efface — sans quoi un événement rouvert garderait une date de clôture dans
 * le futur de son propre suivi, et la contrainte `evenements_dates_coherentes`
 * finirait par le refuser.
 *
 * La date de clôture est une date NUE construite côté appelant (`isoLocale`),
 * jamais un `toISOString()` : c'est ce qui avait produit le 23514 des ordres de
 * travail (migration 075).
 */
export function useChangeStatutEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      compteRendu,
      dateCloture,
      clotureBy,
    }: {
      id: string
      statutId: number
      compteRendu?: string
      dateCloture?: string
      clotureBy?: string
    }) => {
      const cloture = statutId === STATUT_CLOTURE
      const { data } = await supabase
        .from('evenements')
        .update({
          statut_evenement_id: statutId,
          compte_rendu: cloture ? (compteRendu?.trim() ?? '') || null : null,
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
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}
