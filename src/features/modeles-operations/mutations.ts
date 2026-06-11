import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gammesQueries } from '@/features/gammes/queries'
import { modelesOperationsQueries } from './queries'
import type {
  ModeleOperationFormValues,
  OperationItemFormValues,
} from './schemas'

// ── Modèles d'opérations ────────────────────────────────────────────────────

function modelePayload(v: ModeleOperationFormValues, siteId: string | null) {
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    site_id: v.portee === 'entreprise' ? null : siteId,
  }
}

export function useCreateModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      values,
      siteId,
    }: {
      values: ModeleOperationFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('modeles_operations')
        .insert(modelePayload(values, siteId))
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}

export function useUpdateModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      siteId,
    }: {
      id: string
      values: ModeleOperationFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('modeles_operations')
        .update(modelePayload(values, siteId))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}

/**
 * Détache un modèle d'opération de TOUTES ses gammes puis le supprime, via la RPC
 * ATOMIQUE `detacher_et_supprimer_modele_operation` (migration #005). Une seule
 * transaction SECURITY DEFINER : elle détache aussi les liaisons cross-site
 * masquées au caller par la RLS (qu'un DELETE direct laisserait, bloquant la FK
 * `RESTRICT`), puis supprime le modèle — tout ou rien, plus de détachement
 * orphelin sur échec partiel. Les gammes ne sont JAMAIS supprimées (seules les
 * liaisons le sont) et les triggers BEFORE DELETE de `gamme_modeles` restent
 * actifs (dernière source d'opérations d'une gamme préventive active, OT actifs)
 * → l'erreur remonte pour être traduite côté UI.
 */
export function useDetacherEtSupprimerModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .rpc('detacher_et_supprimer_modele_operation', { p_id: id })
        .throwOnError()
    },
    onSuccess: () => {
      // Les liaisons modifiées impactent aussi l'affichage des gammes.
      void qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() })
      void qc.invalidateQueries({ queryKey: gammesQueries.all() })
    },
  })
}

// ── Items (opérations types) ────────────────────────────────────────────────

function itemPayload(v: OperationItemFormValues, requiresSeuils: boolean) {
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    ordre: v.ordre.trim() === '' ? 0 : Number(v.ordre),
    type_operation_id: Number(v.type_operation_id),
    unite_id: requiresSeuils && v.unite_id ? Number(v.unite_id) : null,
    seuil_minimum:
      requiresSeuils && v.seuil_minimum.trim() !== ''
        ? Number(v.seuil_minimum)
        : null,
    seuil_maximum:
      requiresSeuils && v.seuil_maximum.trim() !== ''
        ? Number(v.seuil_maximum)
        : null,
  }
}

export function useCreateOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      modeleId,
      values,
      requiresSeuils,
    }: {
      modeleId: string
      values: OperationItemFormValues
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('modeles_operations_items')
        .insert({
          ...itemPayload(values, requiresSeuils),
          modele_operation_id: modeleId,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}

export function useUpdateOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      requiresSeuils,
    }: {
      id: string
      values: OperationItemFormValues
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('modeles_operations_items')
        .update(itemPayload(values, requiresSeuils))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}

export function useDeleteOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('modeles_operations_items')
        .delete()
        .eq('id', id)
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}
