import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { categoriesQueries } from './queries'
import type { CategorieFormValues } from './schemas'

// Construit le payload base à partir des valeurs du formulaire.
function categoriePayload(v: CategorieFormValues, siteId: string | null) {
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    scope: v.scope,
    parent_id: v.parent_id || null,
    est_actif: v.etat === 'actif',
    miniature_id: v.miniature_id,
    // Portée entreprise → site_id NULL ; portée site → site actif.
    site_id: v.portee === 'entreprise' ? null : siteId,
  }
}

export function useCreateCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      values,
      siteId,
    }: {
      values: CategorieFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('categories')
        .insert(categoriePayload(values, siteId))
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoriesQueries.all() }),
  })
}

export function useUpdateCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      siteId,
    }: {
      id: string
      values: CategorieFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('categories')
        .update(categoriePayload(values, siteId))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoriesQueries.all() }),
  })
}

export function useDeleteCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete : corbeille 90j côté backend. `.select().single()` force un
      // PGRST116 (catché en UI) si la RLS filtre la ligne (0 ligne touchée),
      // plutôt qu'un faux toast de succès.
      await supabase
        .from('categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoriesQueries.all() }),
  })
}
