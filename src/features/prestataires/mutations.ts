import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { contratsQueries, prestatairesQueries } from './queries'
import type { ContratFormValues, PrestataireFormValues } from './schemas'

// ── Prestataires ──────────────────────────────────────────────────────────────

// Formulaire allégé : seuls le nom (libelle), la description (commentaires) et
// l'image (miniature_id) sont saisis. Les autres colonnes gardent leur valeur
// (UPDATE) ou leur défaut NULL (INSERT).
function prestatairePayload(v: PrestataireFormValues) {
  return {
    libelle: v.libelle.trim(),
    commentaires: v.commentaires.trim() || null,
    miniature_id: v.miniature_id,
  }
}

export function useCreatePrestataire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: PrestataireFormValues) => {
      const { data } = await supabase
        .from('prestataires')
        .insert(prestatairePayload(values))
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: prestatairesQueries.all() }),
  })
}

export function useUpdatePrestataire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: PrestataireFormValues
    }) => {
      const { data } = await supabase
        .from('prestataires')
        .update(prestatairePayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: prestatairesQueries.all() }),
  })
}

export function useDeletePrestataire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete).
      await supabase.from('prestataires').delete().eq('id', id).throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: prestatairesQueries.all() }),
  })
}

// ── Contrats ──────────────────────────────────────────────────────────────────

function contratPayload(v: ContratFormValues) {
  return {
    reference: v.reference.trim(),
    type_contrat_id: Number(v.type_contrat_id),
    date_debut: v.date_debut,
    date_fin: v.date_fin || null,
    objet_avenant: v.objet_avenant.trim() || null,
    commentaires: v.commentaires.trim() || null,
  }
}

export function useCreateContrat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      prestataireId,
      values,
    }: {
      siteId: string
      prestataireId: string
      values: ContratFormValues
    }) => {
      const { data } = await supabase
        .from('contrats')
        .insert({
          ...contratPayload(values),
          site_id: siteId,
          prestataire_id: prestataireId,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contratsQueries.all() }),
  })
}

export function useUpdateContrat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: ContratFormValues
    }) => {
      const { data } = await supabase
        .from('contrats')
        .update(contratPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contratsQueries.all() }),
  })
}

export function useDeleteContrat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('contrats').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contratsQueries.all() }),
  })
}
