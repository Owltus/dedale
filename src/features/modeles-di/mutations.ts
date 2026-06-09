import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { modelesDiQueries } from './queries'
import type { ModeleDiFormValues } from './schemas'

function modeleDiPayload(v: ModeleDiFormValues) {
  return {
    libelle: v.libelle.trim(),
    description: v.description.trim() || null,
    constat_modele: v.constat_modele.trim(),
    est_actif: v.etat === 'actif',
  }
}

export function useCreateModeleDi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      values,
      siteId,
      createdBy,
    }: {
      values: ModeleDiFormValues
      siteId: string
      createdBy: string
    }) => {
      const { data } = await supabase
        .from('modeles_di')
        .insert({
          ...modeleDiPayload(values),
          site_id: siteId,
          created_by: createdBy,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modelesDiQueries.all() }),
  })
}

export function useUpdateModeleDi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: ModeleDiFormValues
    }) => {
      const { data } = await supabase
        .from('modeles_di')
        .update(modeleDiPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modelesDiQueries.all() }),
  })
}

export function useDeleteModeleDi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression réelle (pas de soft-delete sur cette table).
      await supabase.from('modeles_di').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modelesDiQueries.all() }),
  })
}
