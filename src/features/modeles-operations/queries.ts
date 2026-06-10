import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleOperation =
  Database['public']['Tables']['modeles_operations']['Row']

/**
 * Modèle d'opération candidat à l'import dans une gamme, enrichi du nombre
 * d'items. Permet d'exclure les modèles VIDES côté UI : les lier déclencherait
 * un trigger `check_violation` (23514) qui ferait échouer l'INSERT groupé
 * atomique (aucun modèle lié).
 */
export interface ModeleOperationImportable {
  id: string
  nom: string
  description: string | null
  site_id: string | null
  nbItems: number
}

export const modelesOperationsQueries = {
  all: () => ['modeles_operations'] as const,

  /**
   * Modèles d'opérations (gammes-types) visibles : scope entreprise (site_id
   * NULL) + scope du site actif. Pas de soft-delete sur cette table.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('*')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.filter((m) => m.site_id === null || m.site_id === siteId)
      },
      staleTime: 60_000,
    }),

  /** Items (opérations types) d'un modèle, ordonnés, avec type et unité. */
  items: (modeleId: string) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'items', modeleId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations_items')
          .select(
            '*, types_operations(id, libelle, necessite_seuils), unites(id, nom, symbole)',
          )
          .eq('modele_operation_id', modeleId)
          .order('ordre')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Tout l'accessible (RLS) SANS filtre de site : le périmètre (Tout / Commun /
   * site) est appliqué côté composant.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('*')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Pool des modèles d'opération pour l'IMPORT dans une gamme : comme `pool()`
   * mais enrichi du nombre d'items (jointure comptée). L'appelant exclut les
   * modèles vides, non liables (trigger `check_violation`). Query dédiée pour
   * ne pas alourdir les autres consommateurs de `pool()`.
   */
  poolImport: () =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'pool-import'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('id, nom, description, site_id, modeles_operations_items(id)')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.map(
          (m): ModeleOperationImportable => ({
            id: m.id,
            nom: m.nom,
            description: m.description,
            site_id: m.site_id,
            nbItems: m.modeles_operations_items.length,
          }),
        )
      },
      staleTime: 60_000,
    }),
}
