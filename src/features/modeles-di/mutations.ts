import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { modelesDiQueries } from './queries'
import type { ModeleDiFormValues } from './schemas'

// Champs métier communs création/édition. La PORTÉE (`site_id`) n'en fait PAS
// partie : elle n'est posée qu'à la création (immuable ensuite côté base).
function modeleDiPayload(v: ModeleDiFormValues) {
  return {
    libelle: v.libelle.trim(),
    constat_modele: v.constat_modele.trim(),
    miniature_id: v.miniature_id,
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
      // Site cible (Commun → null). La portée du formulaire arbitre la valeur réelle.
      siteId: string | null
      createdBy: string
    }) => {
      const { data } = await supabase
        .from('modeles_di')
        .insert({
          ...modeleDiPayload(values),
          // Commun = site_id NULL ; sinon le site cible.
          site_id: values.portee === 'entreprise' ? null : siteId,
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
      // On NE transmet PAS `site_id` : la portée est immuable après création
      // (trigger backend, sauf admin) → on ne la propose ni ne l'envoie.
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
