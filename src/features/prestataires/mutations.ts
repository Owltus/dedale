import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { contratsQueries, prestatairesQueries } from './queries'
import type { ContratFormValues, PrestataireFormValues } from './schemas'

// ── Prestataires ──────────────────────────────────────────────────────────────

// Convertit les champs texte vides en NULL (colonnes nullables côté base).
function prestatairePayload(v: PrestataireFormValues) {
  return {
    libelle: v.libelle.trim(),
    metier: v.metier.trim() || null,
    email: v.email.trim() || null,
    telephone: v.telephone.trim() || null,
    siret: v.siret.trim() || null,
    adresse: v.adresse.trim() || null,
    code_postal: v.code_postal.trim() || null,
    ville: v.ville.trim() || null,
    commentaires: v.commentaires.trim() || null,
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
      // Soft-delete : on pose deleted_at (corbeille 90j côté backend).
      await supabase
        .from('prestataires')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
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
