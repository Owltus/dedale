import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sitesQueries } from './queries'
import type { SiteFormValues } from './schemas'

// Convertit les champs texte vides en NULL (colonnes nullables côté base).
function toPayload(v: SiteFormValues) {
  return {
    nom: v.nom.trim(),
    adresse: v.adresse.trim() || null,
    code_postal: v.code_postal.trim() || null,
    ville: v.ville.trim() || null,
  }
}

export function useCreateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: SiteFormValues) => {
      const { data } = await supabase
        .from('sites')
        .insert(toPayload(values))
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sitesQueries.all() }),
  })
}

export function useUpdateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: SiteFormValues
    }) => {
      const { data } = await supabase
        .from('sites')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sitesQueries.all() }),
  })
}

export function useDeleteSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression EN CASCADE (admin only) : la RPC efface le site ET tout son
      // contenu, en transaction (rollback si une contrainte échoue). Cf. 040.
      await supabase
        .rpc('supprimer_site_cascade', { p_site_id: id })
        .throwOnError()
    },
    // La cascade touche de nombreuses tables (OT, équipements, documents…) :
    // on invalide tout le cache pour repartir propre.
    onSuccess: () => qc.invalidateQueries(),
  })
}
