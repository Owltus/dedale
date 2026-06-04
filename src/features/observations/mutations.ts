import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { observationsQueries } from './queries'
import type { ObservationCreateValues, ObservationLeverValues } from './schemas'

export function useCreateObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      siteId: string
      createdBy: string
      values: ObservationCreateValues
    }) => {
      const { data } = await supabase
        .from('observations')
        .insert({
          site_id: p.siteId,
          created_by: p.createdBy,
          source: p.values.source,
          gravite: p.values.gravite,
          description: p.values.description.trim(),
          echeance: p.values.echeance || null,
          ot_id: p.values.ot_id || null,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: observationsQueries.all() }),
  })
}

/**
 * Lève une observation : statut='levee' + date_levee + levee_by (les trois sont
 * exigés ensemble par le CHECK observations_levee_coherente côté base). Le
 * commentaire est optionnel. Une transition impossible (RLS, contrainte) remonte
 * en erreur Supabase à catcher côté appelant.
 */
export function useLeverObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      leveeBy: string
      values: ObservationLeverValues
    }) => {
      const { data } = await supabase
        .from('observations')
        .update({
          statut: 'levee',
          date_levee: p.values.date_levee,
          levee_by: p.leveeBy,
          commentaire_levee: p.values.commentaire_levee.trim() || null,
        })
        .eq('id', p.id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: observationsQueries.all() }),
  })
}
