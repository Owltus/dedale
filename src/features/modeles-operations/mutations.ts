import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { siteIdPourPortee } from '@/lib/scope'
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
    categorie_id: v.categorie_id,
    miniature_id: v.miniature_id,
    site_id: siteIdPourPortee(v.portee, siteId),
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
    onSuccess: () => {
      // Le renommage d'un modèle se projette dans la section « Modèles
      // d'opération liés » d'une gamme (namespace `['gammes']`).
      void qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() })
      void qc.invalidateQueries({ queryKey: gammesQueries.all() })
    },
  })
}

/**
 * Copie un modèle d'opération PAR VALEUR vers un site cible via la RPC dédiée
 * (`copier_modele_operation`). Cas d'usage : piocher un modèle COMMUN
 * (`site_id NULL`) et l'instancier sur son site, où il devient une copie
 * indépendante (snapshot + items, modifiable sans toucher l'original commun).
 */
export function useCopierModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sourceModeleId,
      siteCible,
    }: {
      sourceModeleId: string
      siteCible: string
    }) => {
      const { data } = await supabase
        .rpc('copier_modele_operation', {
          p_source_modele_id: sourceModeleId,
          p_site_cible: siteCible,
        })
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

function itemPayload(
  v: OperationItemFormValues,
  aUnite: boolean,
  requiresSeuils: boolean,
) {
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    ordre: v.ordre.trim() === '' ? 0 : Number(v.ordre),
    type_operation_id: Number(v.type_operation_id),
    // L'unité dépend du TYPE (Mesure) ; les seuils dépendent de l'UNITÉ.
    unite_id: aUnite && v.unite_id ? Number(v.unite_id) : null,
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
      aUnite,
      requiresSeuils,
    }: {
      modeleId: string
      values: OperationItemFormValues
      aUnite: boolean
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('modeles_operations_items')
        .insert({
          ...itemPayload(values, aUnite, requiresSeuils),
          modele_operation_id: modeleId,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => {
      // Le nombre d'items d'un modèle est projeté dans la section « Modèles
      // d'opération liés » d'une gamme (namespace `['gammes']`).
      void qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() })
      void qc.invalidateQueries({ queryKey: gammesQueries.all() })
    },
  })
}

export function useUpdateOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      aUnite,
      requiresSeuils,
    }: {
      id: string
      values: OperationItemFormValues
      aUnite: boolean
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('modeles_operations_items')
        .update(itemPayload(values, aUnite, requiresSeuils))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => {
      // Le nombre d'items d'un modèle est projeté dans la section « Modèles
      // d'opération liés » d'une gamme (namespace `['gammes']`).
      void qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() })
      void qc.invalidateQueries({ queryKey: gammesQueries.all() })
    },
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
    onSuccess: () => {
      // Le nombre d'items d'un modèle est projeté dans la section « Modèles
      // d'opération liés » d'une gamme (namespace `['gammes']`).
      void qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() })
      void qc.invalidateQueries({ queryKey: gammesQueries.all() })
    },
  })
}
